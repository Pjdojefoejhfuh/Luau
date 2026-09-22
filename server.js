const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { RedisStore } = require("connect-redis");
const { Redis } = require("@upstash/redis");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${PORT}`);
const ADMIN_PASSWORD = process.env.ADMIN_PASS || "CHANGE_ME_NOW";
const ADMIN_PASS_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);

// ⚠️ Sur Vercel, /tmp est le SEUL dossier inscriptible (éphémère).
// En local, on garde ./data/db.json
const IS_VERCEL = !!process.env.VERCEL;
const DB_FILE = IS_VERCEL
  ? path.join(os.tmpdir(), "db.json")
  : path.join(__dirname, "data", "db.json");

// Base par défaut
const DEFAULT_DB = { scripts: {}, keys: {}, bans: {}, checkpointSessions: {} };

function ensureDir(file) {
  const dir = path.dirname(file);
  try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
}

function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const seed = path.join(__dirname, "data", "db.json");
      if (IS_VERCEL && fs.existsSync(seed)) {
        ensureDir(DB_FILE);
        fs.copyFileSync(seed, DB_FILE);
      } else {
        ensureDir(DB_FILE);
        fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2));
      }
    }
    let raw = fs.readFileSync(DB_FILE, "utf8");
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    raw = raw.trim();
    if (!raw) return { ...DEFAULT_DB };
    const d = JSON.parse(raw);
    if (!d.scripts) d.scripts = {};
    if (!d.keys) d.keys = {};
    if (!d.bans) d.bans = {};
    if (!d.checkpointSessions) d.checkpointSessions = {};
    Object.values(d.scripts).forEach(s => {
      if (typeof s.requireKey !== "boolean") s.requireKey = true;
    });
    return d;
  } catch (e) {
    console.error("⚠️ db.json corrompu, réinitialisation", e.message);
    try {
      ensureDir(DB_FILE);
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2));
    } catch (_) {}
    return { ...DEFAULT_DB };
  }
}

function saveDB(db) {
  try {
    ensureDir(DB_FILE);
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), { encoding: "utf8" });
  } catch (e) {
    console.error("⚠️ saveDB échoué:", e.message);
  }
}

let db = loadDB();

/* ================= REDIS SESSION STORE ================= */
const redisClient = new Redis({
  url: process.env.KV_REST_API_REDIS_URL,
  token: process.env.KV_REST_API_REDIS_TOKEN,
  automaticDeserialization: false,
});

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET || "change_me_secret_long_et_unique",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 6,
    secure: false,
    sameSite: "lax"
  }
}));
app.use(express.static(path.join(__dirname, "public")));

function requireAuth(req, res, next) {
  if (req.session && req.session.logged) return next();
  return res.status(401).json({ error: "unauthorized" });
}

const LOADER_SECRET = process.env.LOADER_SECRET || "nova_auth_secret_2025_x7k9";

function isRobloxClient(req) {
  const secret = req.headers["x-nova-secret"];
  if (secret === LOADER_SECRET) return true;

  const ua = (req.headers["user-agent"] || "").toLowerCase();
  const robloxUAs = [
    "roblox", "wininet", "synapse", "krnl", "script-ware", "sw-",
    "fluxus", "hydrogen", "electron", "wave", "solara", "vega",
    "arceus", "codex", "delta", "evon", "ronix", "trigon",
    "valyse", "xeno", "sirhurt", "comet", "awp"
  ];
  if (robloxUAs.some(p => ua.includes(p))) return true;

  const browsers = ["mozilla", "chrome", "firefox", "safari", "edge", "opera"];
  if (browsers.some(p => ua.includes(p))) return false;

  return false;
}

/* ================= AUTH ================= */
app.post("/api/login", (req, res) => {
  const { password } = req.body;
  if (bcrypt.compareSync(password || "", ADMIN_PASS_HASH)) {
    req.session.logged = true;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: "session_save_failed" });
      return res.json({ ok: true });
    });
    return;
  }
  res.status(401).json({ error: "bad_password" });
});

app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/api/me", (req, res) => res.json({ logged: !!(req.session && req.session.logged) }));

/* ================= PUBLIC STATS ================= */
app.get("/api/public/stats", (req, res) => {
  const now = Date.now();
  const scripts = Object.values(db.scripts);
  const keys = Object.values(db.keys);
  const activeKeys = keys.filter(k => k.activatedAt && k.expiresAt > now && !k.banned).length;
  const totalViews = scripts.reduce((sum, s) => sum + (s.views || 0), 0);
  res.json({
    scripts: scripts.length,
    keys: keys.length,
    activeKeys,
    views: totalViews,
    uptime: process.uptime()
  });
});

/* ================= SCRIPTS ================= */
app.post("/api/scripts", requireAuth, (req, res) => {
  const { name, content, description, version, requireKey } = req.body;
  if (!name || !content) return res.status(400).json({ error: "missing_fields" });
  const id = crypto.randomBytes(8).toString("hex");
  db.scripts[id] = {
    id, name, content,
    description: description || "",
    version: version || "v1.0",
    requireKey: requireKey !== undefined ? !!requireKey : true,
    createdAt: Date.now(),
    views: 0
  };
  saveDB(db);
  res.json({ id, url: `${BASE_URL}/raw/${id}` });
});

app.get("/api/scripts", requireAuth, (req, res) => {
  const list = Object.values(db.scripts).map(s => ({
    id: s.id, name: s.name, description: s.description, version: s.version,
    requireKey: s.requireKey,
    createdAt: s.createdAt, views: s.views || 0,
    url: `${BASE_URL}/raw/${s.id}`,
    loaderUrl: `${BASE_URL}/loader/${s.id}`,
    keyCount: Object.values(db.keys).filter(k => k.scriptId === s.id).length
  }));
  res.json(list);
});

app.get("/api/scripts/:id/full", requireAuth, (req, res) => {
  const s = db.scripts[req.params.id];
  if (!s) return res.status(404).json({ error: "not_found" });
  res.json(s);
});

app.put("/api/scripts/:id", requireAuth, (req, res) => {
  const s = db.scripts[req.params.id];
  if (!s) return res.status(404).json({ error: "not_found" });
  ["name","content","description","version"].forEach(k => {
    if (req.body[k] !== undefined) s[k] = req.body[k];
  });
  if (req.body.requireKey !== undefined) s.requireKey = !!req.body.requireKey;
  saveDB(db);
  res.json({ ok: true });
});

app.post("/api/scripts/:id/toggle-key", requireAuth, (req, res) => {
  const s = db.scripts[req.params.id];
  if (!s) return res.status(404).json({ error: "not_found" });
  s.requireKey = !s.requireKey;
  saveDB(db);
  res.json({ ok: true, requireKey: s.requireKey });
});

app.delete("/api/scripts/:id", requireAuth, (req, res) => {
  delete db.scripts[req.params.id];
  Object.keys(db.keys).forEach(k => { if (db.keys[k].scriptId === req.params.id) delete db.keys[k]; });
  saveDB(db);
  res.json({ ok: true });
});

/* ================= KEYS ================= */
app.post("/api/keys", requireAuth, (req, res) => {
  const { scriptId, count, hours, note } = req.body;
  if (!scriptId || !db.scripts[scriptId]) return res.status(400).json({ error: "bad_script" });
  const n = Math.max(1, Math.min(200, parseInt(count) || 1));
  const h = Math.max(1, Math.min(8760, parseInt(hours) || 24));
  const created = [];
  for (let i = 0; i < n; i++) {
    const key = crypto.randomBytes(16).toString("hex").toUpperCase();
    db.keys[key] = {
      key, scriptId,
      note: note || "",
      createdAt: Date.now(),
      durationHours: h,
      activatedAt: null,
      expiresAt: null,
      usedBy: null,
      uses: 0,
      banned: false
    };
    created.push(key);
  }
  saveDB(db);
  res.json({ keys: created, count: n, hours: h });
});

app.get("/api/keys", requireAuth, (req, res) => {
  const now = Date.now();
  const list = Object.values(db.keys).map(k => {
    let status = "unused";
    if (k.banned) status = "banned";
    else if (k.expiresAt && k.expiresAt < now) status = "expired";
    else if (k.activatedAt) status = "active";
    return {
      key: k.key, scriptId: k.scriptId,
      scriptName: db.scripts[k.scriptId]?.name || "?",
      note: k.note, createdAt: k.createdAt,
      activatedAt: k.activatedAt, expiresAt: k.expiresAt,
      durationHours: k.durationHours, uses: k.uses || 0,
      usedBy: k.usedBy, banned: k.banned, status,
      url: `${BASE_URL}/key/${k.key}`
    };
  });
  res.json(list);
});

app.post("/api/keys/:key/ban", requireAuth, (req, res) => {
  const k = db.keys[req.params.key];
  if (!k) return res.status(404).json({ error: "not_found" });
  k.banned = !k.banned;
  saveDB(db);
  res.json({ ok: true, banned: k.banned });
});

app.post("/api/keys/:key/reset", requireAuth, (req, res) => {
  const k = db.keys[req.params.key];
  if (!k) return res.status(404).json({ error: "not_found" });
  k.activatedAt = null; k.expiresAt = null; k.usedBy = null; k.uses = 0;
  saveDB(db);
  res.json({ ok: true });
});

app.delete("/api/keys/:key", requireAuth, (req, res) => {
  delete db.keys[req.params.key];
  saveDB(db);
  res.json({ ok: true });
});

/* ================= BANS ================= */
app.post("/api/bans", requireAuth, (req, res) => {
  const { hwid, reason } = req.body;
  if (!hwid) return res.status(400).json({ error: "no_hwid" });
  db.bans[hwid] = { hwid, reason: reason || "", bannedAt: Date.now() };
  saveDB(db);
  res.json({ ok: true });
});
app.get("/api/bans", requireAuth, (req, res) => res.json(Object.values(db.bans)));
app.delete("/api/bans/:hwid", requireAuth, (req, res) => {
  delete db.bans[req.params.hwid];
  saveDB(db);
  res.json({ ok: true });
});

/* ================= KEY PAGE ================= */
app.get("/key/:key", (req, res) => {
  const k = db.keys[req.params.key];
  if (!k) return res.status(404).send("<h1 style='color:#fff;background:#000;padding:50px;text-align:center'>Invalid key</h1>");
  if (k.banned) return res.send("<h1 style='color:#fff;background:#000;padding:50px;text-align:center'>Key banned</h1>");
  res.sendFile(path.join(__dirname, "public", "key.html"));
});

app.get("/api/key/:key", (req, res) => {
  const k = db.keys[req.params.key];
  if (!k) return res.status(404).json({ error: "invalid" });
  res.json({
    key: k.key,
    valid: !k.banned,
    banned: k.banned,
    scriptName: db.scripts[k.scriptId]?.name || "?",
    scriptId: k.scriptId,
    durationHours: k.durationHours,
    activatedAt: k.activatedAt,
    expiresAt: k.expiresAt
  });
});

/* ================= LOADER ================= */
app.get("/loader", (req, res) => {
  res.type("text/plain").sendFile(path.join(__dirname, "public", "loader.lua"));
});

app.get("/loader/:scriptId", (req, res) => {
  const s = db.scripts[req.params.scriptId];
  if (!s) return res.status(404).send("-- script not found");
  let lua = fs.readFileSync(path.join(__dirname, "public", "loader.lua"), "utf8");
  lua = lua.replace('local SCRIPT_ID = "REPLACE_ME"', `local SCRIPT_ID = "${s.id}"`);
  res.type("text/plain").send(lua);
});

/* ================= RAW SCRIPT ================= */
app.get("/raw/:id", (req, res) => {
  const s = db.scripts[req.params.id];
  if (!s) return res.status(404).send("-- not found");
  if (!isRobloxClient(req)) {
    return res.status(403).json({
      error: "browser_not_allowed",
      message: "This endpoint is for the Roblox script client, not a browser."
    });
  }
  s.views = (s.views || 0) + 1;
  saveDB(db);
  res.type("text/plain").send(s.content);
});

/* ================= VALIDATE ================= */
app.post("/api/validate", (req, res) => {
  if (!isRobloxClient(req)) {
    return res.status(403).json({
      error: "browser_not_allowed",
      message: "This endpoint is for the Roblox script client, not a browser."
    });
  }
  console.log(`[validate] UA="${req.headers["user-agent"]}" secret="${req.headers["x-nova-secret"] ? "YES" : "NO"}" body=`, req.body);

  const { key, scriptId, hwid } = req.body;
  if (!scriptId) return res.json({ valid: false, reason: "no_script" });

  const script = db.scripts[scriptId];
  if (!script) return res.json({ valid: false, reason: "script_gone" });

  if (script.requireKey === false) {
    script.views = (script.views || 0) + 1;
    saveDB(db);
    return res.json({
      valid: true,
      bypassed: true,
      script: script.content,
      message: "No key required"
    });
  }

  if (!key) return res.json({ valid: false, reason: "no_key" });
  const k = db.keys[key.toUpperCase()];
  if (!k) return res.json({ valid: false, reason: "invalid" });
  if (k.scriptId !== scriptId) return res.json({ valid: false, reason: "wrong_script" });
  if (k.banned) return res.json({ valid: false, reason: "banned" });
  if (hwid && db.bans[hwid]) return res.json({ valid: false, reason: "hwid_banned" });

  const now = Date.now();
  if (!k.activatedAt) {
    k.activatedAt = now;
    k.expiresAt = now + k.durationHours * 3600 * 1000;
    k.usedBy = hwid || "unknown";
  }
  if (k.expiresAt < now) return res.json({ valid: false, reason: "expired" });
  if (hwid && k.usedBy && k.usedBy !== "unknown" && k.usedBy !== hwid) {
    return res.json({ valid: false, reason: "hwid_mismatch" });
  }

  k.uses = (k.uses || 0) + 1;
  script.views = (script.views || 0) + 1;
  saveDB(db);

  res.json({
    valid: true,
    script: script.content,
    expiresAt: k.expiresAt,
    hoursLeft: Math.floor((k.expiresAt - now) / 3600000)
  });
});

/* ================= SCRIPT MODE ================= */
app.get("/api/script-mode/:id", (req, res) => {
  const s = db.scripts[req.params.id];
  if (!s) return res.status(404).json({ error: "not_found" });
  res.json({ id: s.id, name: s.name, requireKey: s.requireKey });
});

/* ================= GET KEY ================= */
app.get("/api/getkey/:scriptId", (req, res) => {
  if (!isRobloxClient(req)) {
    return res.status(403).json({
      error: "browser_not_allowed",
      message: "This endpoint is for the Roblox script client, not a browser."
    });
  }

  const s = db.scripts[req.params.scriptId];
  if (!s) return res.status(404).json({ error: "script_not_found" });

  const now = Date.now();
  const allKeys = Object.values(db.keys).filter(k => k.scriptId === s.id && !k.banned);

  const unused = allKeys
    .filter(k => !k.activatedAt)
    .sort((a, b) => a.createdAt - b.createdAt);

  const active = allKeys
    .filter(k => k.activatedAt && k.expiresAt && k.expiresAt > now)
    .sort((a, b) => b.createdAt - a.createdAt);

  const picked = unused[0] || active[0] || null;

  if (!picked) {
    return res.status(404).json({
      error: "no_key_available",
      message: "No key available for this script. Please contact the admin."
    });
  }

  const isReused = picked.activatedAt ? true : false;

  res.json({
    key: picked.key,
    url: `${BASE_URL}/key/${picked.key}`,
    hours: picked.durationHours,
    scriptName: s.name,
    reused: isReused,
    status: isReused ? "active" : "unused",
    expiresAt: picked.expiresAt,
    activatedAt: picked.activatedAt
  });
});

app.get("/api/config", (req, res) => res.json({ baseUrl: BASE_URL }));

/* ================= LOADER CONFIG ================= */
app.get("/api/loader-config", (req, res) => {
  res.json({ secret: LOADER_SECRET, baseUrl: BASE_URL });
});

/* ================= DEBUG ================= */
app.post("/api/debug/echo", (req, res) => {
  res.json({
    headers: req.headers,
    body: req.body,
    isRoblox: isRobloxClient(req)
  });
});

/* ================= CHECKPOINT SYSTEM ================= */
app.get("/api/checkpoint/start/:scriptId", (req, res) => {
  if (!isRobloxClient(req)) {
    return res.status(403).json({
      error: "browser_not_allowed",
      message: "This endpoint is for the Roblox script client, not a browser."
    });
  }
  const s = db.scripts[req.params.scriptId];
  if (!s) return res.status(404).json({ error: "script_not_found" });

  const sessionId = crypto.randomBytes(16).toString("hex");
  const now = Date.now();
  const ads = pickAds(3);

  db.checkpointSessions[sessionId] = {
    id: sessionId,
    scriptId: s.id,
    ads: ads.map((url, i) => ({
      index: i,
      url,
      completedAt: null,
      startedAt: null
    })),
    createdAt: now,
    expiresAt: now + 15 * 60 * 1000,
    completed: false,
    generatedKey: null,
    hwid: null
  };
  saveDB(db);

  res.json({
    sessionId,
    url: `${BASE_URL}/checkpoint/${sessionId}`,
    expiresAt: db.checkpointSessions[sessionId].expiresAt,
    adsCount: 3
  });
});

app.get("/api/checkpoint/status/:sessionId", (req, res) => {
  const sess = db.checkpointSessions[req.params.sessionId];
  if (!sess) return res.status(404).json({ error: "not_found" });
  const now = Date.now();
  if (sess.expiresAt < now && !sess.completed) {
    return res.json({ expired: true, session: null });
  }
  res.json({
    expired: false,
    session: {
      id: sess.id,
      scriptId: sess.scriptId,
      ads: sess.ads.map(a => ({
        index: a.index,
        url: a.url,
        completedAt: a.completedAt,
        startedAt: a.startedAt
      })),
      expiresAt: sess.expiresAt,
      completed: sess.completed,
      generatedKey: sess.generatedKey
    }
  });
});

app.post("/api/checkpoint/open/:sessionId/:index", (req, res) => {
  const sess = db.checkpointSessions[req.params.sessionId];
  if (!sess) return res.status(404).json({ error: "not_found" });
  if (sess.expiresAt < Date.now()) return res.status(410).json({ error: "expired" });
  const idx = parseInt(req.params.index);
  const ad = sess.ads[idx];
  if (!ad) return res.status(404).json({ error: "ad_not_found" });
  if (ad.completedAt) return res.json({ ok: true, alreadyDone: true });
  ad.startedAt = Date.now();
  saveDB(db);
  res.json({ ok: true, url: ad.url });
});

app.post("/api/checkpoint/complete/:sessionId/:index", (req, res) => {
  const sess = db.checkpointSessions[req.params.sessionId];
  if (!sess) return res.status(404).json({ error: "not_found" });
  if (sess.expiresAt < Date.now()) return res.status(410).json({ error: "expired" });
  const idx = parseInt(req.params.index);
  const ad = sess.ads[idx];
  if (!ad) return res.status(404).json({ error: "ad_not_found" });
  if (ad.completedAt) return res.json({ ok: true, alreadyDone: true });

  const elapsed = Date.now() - (ad.startedAt || 0);
  if (elapsed < 15000) {
    return res.status(400).json({ error: "too_fast", waitMore: 15000 - elapsed });
  }

  ad.completedAt = Date.now();
  const allDone = sess.ads.every(a => a.completedAt);
  if (allDone) sess.completed = true;

  saveDB(db);
  res.json({ ok: true, allDone });
});

app.post("/api/checkpoint/generate/:sessionId", (req, res) => {
  const sess = db.checkpointSessions[req.params.sessionId];
  if (!sess) return res.status(404).json({ error: "not_found" });
  if (sess.expiresAt < Date.now()) return res.status(410).json({ error: "expired" });

  const allDone = sess.ads.every(a => a.completedAt);
  if (!allDone) return res.status(400).json({ error: "not_all_completed" });

  if (sess.generatedKey) {
    const existing = db.keys[sess.generatedKey];
    if (existing) {
      return res.json({
        key: existing.key,
        url: `${BASE_URL}/key/${existing.key}`,
        hours: existing.durationHours,
        reused: true
      });
    }
  }

  const script = db.scripts[sess.scriptId];
  if (!script) return res.status(404).json({ error: "script_gone" });

  const key = crypto.randomBytes(16).toString("hex").toUpperCase();
  db.keys[key] = {
    key,
    scriptId: sess.scriptId,
    note: "Checkpoint-generated",
    createdAt: Date.now(),
    durationHours: 24,
    activatedAt: null,
    expiresAt: null,
    usedBy: null,
    uses: 0,
    banned: false
  };
  sess.generatedKey = key;
  saveDB(db);

  res.json({
    key,
    url: `${BASE_URL}/key/${key}`,
    hours: 24,
    reused: false,
    scriptName: script.name
  });
});

/* ================= ADS ================= */
const AD_POOL = [
  "https://www.google.com/search?q=roblox+script+hub",
  "https://www.youtube.com/results?search_query=roblox+script+showcase",
  "https://www.reddit.com/r/robloxexploiting/",
  "https://www.bing.com/search?q=best+roblox+executor",
  "https://duckduckgo.com/?q=roblox+free+scripts",
  "https://www.google.com/search?q=luau+script+tutorial",
  "https://www.youtube.com/results?search_query=luau+roblox+tutorial",
  "https://github.com/topics/roblox-script"
];
function pickAds(n) {
  const shuffled = [...AD_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

/* ================= CHECKPOINT PAGE ================= */
app.get("/checkpoint/:sessionId", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "checkpoint.html"));
});

/* ================= EXPORT (Vercel serverless) ================= */
module.exports = app;

// En local uniquement : démarre le serveur
if (!IS_VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n✅ NovaAuth running : http://localhost:${PORT}\n`);
    console.log(`🔐 Admin password : ${ADMIN_PASSWORD}`);
    console.log(`📁 Data file : ${DB_FILE}\n`);
  });
}