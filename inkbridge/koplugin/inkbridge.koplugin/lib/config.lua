--[[--
Persistent settings for InkBridge.

Everything lives in one LuaSettings file next to KOReader's own settings, so a
firmware update on the Kobo does not take the configuration with it.
]]

local DataStorage = require("datastorage")
local LuaSettings = require("luasettings")
local lfs = require("libs/libkoreader-lfs")
local logger = require("logger")

local Config = {}

local DEFAULTS = {
    -- "hub" talks to the InkBridge service on the NAS, "direct" talks to
    -- Calibre and Suwayomi themselves.
    mode = "hub",
    hub_url = "",
    hub_token = "",

    calibre_url = "",
    calibre_username = "",
    calibre_password = "",
    calibre_library = "",

    suwayomi_url = "",
    suwayomi_username = "",
    suwayomi_password = "",

    download_dir = nil,          -- resolved at first use
    -- Sync behaviour.
    sync_enabled = true,
    sync_on_open = true,         -- pull the remote position when opening a book
    sync_on_close = true,        -- push when closing or suspending
    sync_every_pages = 20,       -- 0 disables the periodic push
    conflict_tolerance = 0.01,   -- ask below this difference? no: below it we decide silently
    auto_wifi = true,            -- turn the Wi-Fi on by ourselves when syncing
    -- Browsing.
    view_mode = "grid",          -- grid | list
    page_size = 24,
    keep_covers = true,
}

local settings                    -- lazily created LuaSettings instance

local function store()
    if not settings then
        settings = LuaSettings:open(DataStorage:getSettingsDir() .. "/inkbridge.lua")
    end
    return settings
end

--- Reads a setting, falling back to the built-in default.
function Config.get(key)
    local value = store():readSetting(key)
    if value == nil then return DEFAULTS[key] end
    return value
end

function Config.set(key, value)
    store():saveSetting(key, value)
    store():flush()
end

function Config.toggle(key)
    Config.set(key, not Config.get(key))
    return Config.get(key)
end

function Config.defaults()
    return DEFAULTS
end

--- A stable id for this device, generated once and kept forever.
function Config.deviceId()
    local id = store():readSetting("device_id")
    if not id then
        local Device = require("device")
        local seed = (Device.model or "kobo") .. "-" .. tostring(os.time())
                     .. "-" .. tostring(math.random(1, 1e6))
        id = seed:gsub("%s+", ""):gsub("[^%w%-]", ""):lower()
        store():saveSetting("device_id", id)
        store():flush()
    end
    return id
end

function Config.deviceName()
    local name = store():readSetting("device_name")
    if not name then
        local Device = require("device")
        name = Device.model or "KOReader"
        store():saveSetting("device_name", name)
        store():flush()
    end
    return name
end

--- Where downloaded books and chapters are written.
function Config.downloadDir()
    local dir = store():readSetting("download_dir")
    if not dir then
        -- On a Kobo this lands in the user-visible storage, so the books also
        -- show up in KOReader's file browser without extra configuration.
        dir = DataStorage:getFullDataDir() .. "/inkbridge"
        if lfs.attributes("/mnt/onboard", "mode") == "directory" then
            dir = "/mnt/onboard/InkBridge"
        end
    end
    if lfs.attributes(dir, "mode") ~= "directory" then
        local ok, err = lfs.mkdir(dir)
        if not ok and lfs.attributes(dir, "mode") ~= "directory" then
            logger.warn("InkBridge: impossibile creare", dir, err)
        end
    end
    return dir
end

function Config.setDownloadDir(dir)
    Config.set("download_dir", dir)
end

--- True when the plugin has enough configuration to talk to something.
function Config.isConfigured()
    if Config.get("mode") == "hub" then
        return Config.get("hub_url") ~= ""
    end
    return Config.get("calibre_url") ~= "" or Config.get("suwayomi_url") ~= ""
end

--- Test seam: point the whole module at another settings file.
function Config._useStore(other)
    settings = other
end

return Config
