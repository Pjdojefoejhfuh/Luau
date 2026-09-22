--[[
  NovaAuth Loader v5.0
  Get Key -> opens browser with checkpoint page (3 ads + generate)
]]

local SCRIPT_ID = "REPLACE_ME"
local BASE_URL = "http://localhost:3000"
local LOADER_SECRET = "nova_auth_secret_2025_x7k9"

local function headers()
    return {
        ["Content-Type"] = "application/json",
        ["X-Nova-Secret"] = LOADER_SECRET,
        ["User-Agent"] = "Roblox/WinInet"
    }
end

local function httpGet(url)
    local req = (syn and syn.request) or (http and http.request) or http_request or request
    if req then
        local ok, res = pcall(req, { Url = url, Method = "GET", Headers = headers() })
        if ok and res and res.Body then return res.Body end
    end
    local HttpService = game:GetService("HttpService")
    local ok, res = pcall(function()
        return HttpService:RequestAsync({ Url = url, Method = "GET", Headers = headers() })
    end)
    if ok and res and res.Body then return res.Body end
    return nil
end

local function httpPost(url, body)
    local req = (syn and syn.request) or (http and http.request) or http_request or request
    if req then
        local ok, res = pcall(req, {
            Url = url, Method = "POST",
            Headers = headers(), Body = body
        })
        if ok and res and res.Body then return res.Body end
    end
    local HttpService = game:GetService("HttpService")
    local ok, res = pcall(function()
        return HttpService:RequestAsync({
            Url = url, Method = "POST",
            Headers = headers(), Body = body
        })
    end)
    if ok and res and res.Body then return res.Body end
    return nil
end

local function getHWID()
    local ok, hwid = pcall(function()
        return game:GetService("RbxAnalyticsService"):GetClientId()
    end)
    if ok and hwid then return hwid end
    return tostring(game.Players.LocalPlayer.UserId) .. "_" .. tostring(game.PlaceId)
end

local CoreGui = game:GetService("CoreGui")
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local player = Players.LocalPlayer

local gui = Instance.new("ScreenGui")
gui.Name = "NovaAuthLoader"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
pcall(function() gui.Parent = CoreGui end)
if not gui.Parent then gui.Parent = player:WaitForChild("PlayerGui") end

-- Particles layer
local particleLayer = Instance.new("Frame")
particleLayer.Size = UDim2.new(1, 0, 1, 0)
particleLayer.BackgroundTransparency = 1
particleLayer.ClipsDescendants = true
particleLayer.ZIndex = 1
particleLayer.Parent = gui

-- Main frame
local frame = Instance.new("Frame")
frame.Size = UDim2.new(0, 460, 0, 360)
frame.Position = UDim2.new(0.5, -230, 0.5, -180)
frame.BackgroundColor3 = Color3.fromRGB(15, 15, 15)
frame.BorderSizePixel = 0
frame.Active = true
frame.Draggable = true
frame.ZIndex = 10
frame.Parent = gui
Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 16)

local stroke = Instance.new("UIStroke")
stroke.Color = Color3.fromRGB(60, 60, 60)
stroke.Thickness = 1
stroke.Parent = frame

local gradient = Instance.new("UIGradient")
gradient.Color = ColorSequence.new({
    ColorSequenceKeypoint.new(0, Color3.fromRGB(30, 30, 30)),
    ColorSequenceKeypoint.new(1, Color3.fromRGB(10, 10, 10))
})
gradient.Rotation = 90
gradient.Parent = frame

local titleBar = Instance.new("Frame")
titleBar.Size = UDim2.new(1, 0, 0, 45)
titleBar.BackgroundTransparency = 1
titleBar.ZIndex = 11
titleBar.Parent = frame

local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, -100, 1, 0)
title.Position = UDim2.new(0, 15, 0, 0)
title.BackgroundTransparency = 1
title.Text = "◆ NovaAuth"
title.TextColor3 = Color3.fromRGB(255, 255, 255)
title.Font = Enum.Font.GothamBold
title.TextSize = 22
title.TextXAlignment = Enum.TextXAlignment.Left
title.ZIndex = 12
title.Parent = titleBar

local minBtn = Instance.new("TextButton")
minBtn.Size = UDim2.new(0, 28, 0, 28)
minBtn.Position = UDim2.new(1, -70, 0, 8)
minBtn.BackgroundColor3 = Color3.fromRGB(30, 30, 30)
minBtn.Text = "—"
minBtn.TextColor3 = Color3.fromRGB(200, 200, 200)
minBtn.Font = Enum.Font.GothamBold
minBtn.TextSize = 16
minBtn.ZIndex = 12
minBtn.Parent = titleBar
Instance.new("UICorner", minBtn).CornerRadius = UDim.new(0, 6)

local closeBtn = Instance.new("TextButton")
closeBtn.Size = UDim2.new(0, 28, 0, 28)
closeBtn.Position = UDim2.new(1, -36, 0, 8)
closeBtn.BackgroundColor3 = Color3.fromRGB(60, 20, 20)
closeBtn.Text = "✕"
closeBtn.TextColor3 = Color3.fromRGB(255, 120, 120)
closeBtn.Font = Enum.Font.GothamBold
closeBtn.TextSize = 14
closeBtn.ZIndex = 12
closeBtn.Parent = titleBar
Instance.new("UICorner", closeBtn).CornerRadius = UDim.new(0, 6)

local body = Instance.new("Frame")
body.Size = UDim2.new(1, 0, 1, -45)
body.Position = UDim2.new(0, 0, 0, 45)
body.BackgroundTransparency = 1
body.ZIndex = 11
body.Parent = frame

local sub = Instance.new("TextLabel")
sub.Size = UDim2.new(1, -40, 0, 20)
sub.Position = UDim2.new(0, 20, 0, 0)
sub.BackgroundTransparency = 1
sub.Text = "Loading..."
sub.TextColor3 = Color3.fromRGB(120, 120, 120)
sub.Font = Enum.Font.Gotham
sub.TextSize = 12
sub.TextXAlignment = Enum.TextXAlignment.Left
sub.ZIndex = 12
sub.Parent = body

local keyBox = Instance.new("TextBox")
keyBox.Size = UDim2.new(1, -40, 0, 45)
keyBox.Position = UDim2.new(0, 20, 0, 30)
keyBox.BackgroundColor3 = Color3.fromRGB(25, 25, 25)
keyBox.TextColor3 = Color3.fromRGB(255, 255, 255)
keyBox.PlaceholderText = "Paste your key..."
keyBox.PlaceholderColor3 = Color3.fromRGB(90, 90, 90)
keyBox.Text = ""
keyBox.Font = Enum.Font.Code
keyBox.TextSize = 14
keyBox.ClearTextOnFocus = false
keyBox.ZIndex = 12
keyBox.Parent = body
Instance.new("UICorner", keyBox).CornerRadius = UDim.new(0, 10)
local keyStroke = Instance.new("UIStroke")
keyStroke.Color = Color3.fromRGB(50, 50, 50)
keyStroke.Parent = keyBox

local getKeyBtn = Instance.new("TextButton")
getKeyBtn.Size = UDim2.new(0.5, -25, 0, 45)
getKeyBtn.Position = UDim2.new(0, 20, 0, 90)
getKeyBtn.BackgroundColor3 = Color3.fromRGB(30, 30, 30)
getKeyBtn.TextColor3 = Color3.fromRGB(200, 200, 200)
getKeyBtn.Text = "🔗 Get Key"
getKeyBtn.Font = Enum.Font.GothamBold
getKeyBtn.TextSize = 14
getKeyBtn.ZIndex = 12
getKeyBtn.Parent = body
Instance.new("UICorner", getKeyBtn).CornerRadius = UDim.new(0, 10)

local applyBtn = Instance.new("TextButton")
applyBtn.Size = UDim2.new(0.5, -25, 0, 45)
applyBtn.Position = UDim2.new(0.5, 5, 0, 90)
applyBtn.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
applyBtn.TextColor3 = Color3.fromRGB(0, 0, 0)
applyBtn.Text = "✓ Apply Key"
applyBtn.Font = Enum.Font.GothamBold
applyBtn.TextSize = 14
applyBtn.ZIndex = 12
applyBtn.Parent = body
Instance.new("UICorner", applyBtn).CornerRadius = UDim.new(0, 10)

local status = Instance.new("TextLabel")
status.Size = UDim2.new(1, -40, 0, 60)
status.Position = UDim2.new(0, 20, 0, 150)
status.BackgroundTransparency = 1
status.Text = ""
status.TextColor3 = Color3.fromRGB(140, 140, 140)
status.Font = Enum.Font.Gotham
status.TextSize = 13
status.TextWrapped = true
status.TextXAlignment = Enum.TextXAlignment.Left
status.TextYAlignment = Enum.TextYAlignment.Top
status.ZIndex = 12
status.Parent = body

local footer = Instance.new("TextLabel")
footer.Size = UDim2.new(1, -40, 0, 20)
footer.Position = UDim2.new(0, 20, 1, -25)
footer.BackgroundTransparency = 1
footer.Text = "Protected by NovaAuth · v5"
footer.TextColor3 = Color3.fromRGB(60, 60, 60)
footer.Font = Enum.Font.Gotham
footer.TextSize = 11
footer.TextXAlignment = Enum.TextXAlignment.Left
footer.ZIndex = 12
footer.Parent = body

local function setStatus(text, color)
    status.Text = text
    status.TextColor3 = color or Color3.fromRGB(140, 140, 140)
end

-- Particles
local particleActive = true
task.spawn(function()
    while particleActive and gui.Parent do
        local p = Instance.new("Frame")
        p.Size = UDim2.new(0, 3, 0, 3)
        p.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
        p.BorderSizePixel = 0
        p.ZIndex = 5
        Instance.new("UICorner", p).CornerRadius = UDim.new(1, 0)
        p.Parent = particleLayer
        local startX = frame.Position.X.Offset + math.random(0, math.floor(frame.AbsoluteSize.X))
        local startY = frame.Position.Y.Offset + frame.AbsoluteSize.Y
        p.Position = UDim2.new(0, startX, 0, startY)
        local lifetime = 0
        local maxLife = 2 + math.random() * 2
        local drift = (math.random() - 0.5) * 40
        local conn
        conn = RunService.RenderStepped:Connect(function(dt)
            lifetime = lifetime + dt
            if lifetime > maxLife or not p.Parent then conn:Disconnect(); p:Destroy(); return end
            local progress = lifetime / maxLife
            p.Position = UDim2.new(0, startX + drift * progress, 0, startY - progress * 400)
            p.BackgroundTransparency = 0.2 + progress * 0.75
            p.Size = UDim2.new(0, 3 - progress * 2, 0, 3 - progress * 2)
        end)
        task.wait(0.08)
    end
end)

closeBtn.MouseButton1Click:Connect(function()
    particleActive = false
    TweenService:Create(frame, TweenInfo.new(0.25), {
        Size = UDim2.new(0, 0, 0, 0)
    }):Play()
    task.wait(0.3); gui:Destroy()
end)

local minimized = false
minBtn.MouseButton1Click:Connect(function()
    minimized = not minimized
    if minimized then
        body.Visible = false
        TweenService:Create(frame, TweenInfo.new(0.3), { Size = UDim2.new(0, 460, 0, 45) }):Play()
        minBtn.Text = "□"
    else
        TweenService:Create(frame, TweenInfo.new(0.3), { Size = UDim2.new(0, 460, 0, 360) }):Play()
        task.wait(0.1); body.Visible = true; minBtn.Text = "—"
    end
end)

local function addHover(btn, n, h)
    btn.MouseEnter:Connect(function() TweenService:Create(btn, TweenInfo.new(0.15), { BackgroundColor3 = h }):Play() end)
    btn.MouseLeave:Connect(function() TweenService:Create(btn, TweenInfo.new(0.15), { BackgroundColor3 = n }):Play() end)
end
addHover(minBtn, Color3.fromRGB(30,30,30), Color3.fromRGB(60,60,60))
addHover(closeBtn, Color3.fromRGB(60,20,20), Color3.fromRGB(200,40,40))
addHover(getKeyBtn, Color3.fromRGB(30,30,30), Color3.fromRGB(50,50,50))

local function loadAndRun(scriptCode)
    local fn = loadstring or load
    local ok2, err = pcall(function()
        local chunk = fn(scriptCode)
        if chunk then chunk() end
    end)
    if not ok2 then
        setStatus("❌ Script error: " .. tostring(err), Color3.fromRGB(255, 80, 80))
        return false
    end
    particleActive = false
    TweenService:Create(frame, TweenInfo.new(0.4), { BackgroundTransparency = 1 }):Play()
    TweenService:Create(stroke, TweenInfo.new(0.4), { Transparency = 1 }):Play()
    task.wait(0.5)
    gui:Destroy()
    return true
end

-- Auto-check script mode
task.spawn(function()
    local res = httpGet(BASE_URL .. "/api/script-mode/" .. SCRIPT_ID)
    if not res then sub.Text = "Enter your key"; return end
    local ok, data = pcall(HttpService.JSONDecode, HttpService, res)
    if not ok then sub.Text = "Enter your key"; return end

    if data.requireKey == false then
        sub.Text = "No key required — loading..."
        setStatus("✓ Loading script...", Color3.fromRGB(74, 222, 128))
        keyBox.Visible = false; getKeyBtn.Visible = false; applyBtn.Visible = false
        local hwid = getHWID()
        local body_ = HttpService:JSONEncode({ scriptId = SCRIPT_ID, hwid = hwid })
        local vres = httpPost(BASE_URL .. "/api/validate", body_)
        if not vres then setStatus("❌ Network error", Color3.fromRGB(255, 80, 80)); return end
        local ok2, vdata = pcall(HttpService.JSONDecode, HttpService, vres)
        if not ok2 or not vdata.valid or not vdata.script then
            setStatus("❌ " .. ((vdata and vdata.reason) or "Failed"), Color3.fromRGB(255, 80, 80)); return
        end
        task.wait(0.3); loadAndRun(vdata.script)
    else
        sub.Text = "Enter your key to continue"
    end
end)

-- GET KEY -> open checkpoint page in browser
getKeyBtn.MouseButton1Click:Connect(function()
    setStatus("⏳ Creating verification session...", Color3.fromRGB(255, 200, 60))
    local res = httpGet(BASE_URL .. "/api/checkpoint/start/" .. SCRIPT_ID)
    if not res then
        setStatus("❌ Could not reach server", Color3.fromRGB(255, 80, 80)); return
    end
    local ok, data = pcall(HttpService.JSONDecode, HttpService, res)
    if not ok or not data.url then
        setStatus("❌ " .. ((data and data.error) or "Failed"), Color3.fromRGB(255, 80, 80)); return
    end

    -- Ouvre l'URL dans le navigateur par défaut
    if setclipboard then setclipboard(data.url) end

    local opened = false
    if request then
        -- certains executors n'ouvrent pas, donc on tente aussi via shell
    end
    pcall(function()
        game:GetService("GuiService"):OpenBrowserWindow(data.url)
        opened = true
    end)

    if opened then
        setStatus("✓ Browser opened! Complete 3 ads and click Generate Key.", Color3.fromRGB(74, 222, 128))
    else
        setStatus("✓ URL copied! Paste it in your browser:\n" .. data.url, Color3.fromRGB(74, 222, 128))
    end
end)

-- APPLY KEY
applyBtn.MouseButton1Click:Connect(function()
    local k = keyBox.Text
    if k == "" then setStatus("❌ Please enter a key", Color3.fromRGB(255, 80, 80)); return end
    setStatus("⏳ Validating...", Color3.fromRGB(255, 200, 60))
    local hwid = getHWID()
    local body_ = HttpService:JSONEncode({ key = k, scriptId = SCRIPT_ID, hwid = hwid })
    local res = httpPost(BASE_URL .. "/api/validate", body_)
    if not res then setStatus("❌ Network error. Try again.", Color3.fromRGB(255, 80, 80)); return end
    local ok, data = pcall(HttpService.JSONDecode, HttpService, res)
    if not ok then setStatus("❌ Server response invalid", Color3.fromRGB(255, 80, 80)); return end
    if not data.valid then
        local reason = data.reason or "unknown"
        local msg = ({
            invalid = "Invalid key", expired = "Key expired", banned = "Key banned",
            hwid_banned = "Your device is banned", hwid_mismatch = "Key locked to another device",
            no_key = "No key provided", wrong_script = "Key does not match this script",
            script_gone = "Script unavailable", no_script = "No script specified"
        })[reason] or ("Unknown error: " .. tostring(reason))
        setStatus("❌ " .. msg, Color3.fromRGB(255, 80, 80)); return
    end
    if not data.script then setStatus("❌ No script returned", Color3.fromRGB(255, 80, 80)); return end
    setStatus("✓ Key valid! Loading script...", Color3.fromRGB(74, 222, 128))
    task.wait(0.5); loadAndRun(data.script)
end)