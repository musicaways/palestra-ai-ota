--[[--
Just enough of KOReader to run the plugin's logic under a plain Lua 5.1.

Only modules the tested code actually touches are faked, and each fake records
what was asked of it so the tests can assert on behaviour instead of internals.
]]

local Stubs = {}

Stubs.files = {}          -- path -> {size = n, mode = "file"|"directory"}
Stubs.settings = {}       -- settings file -> table
Stubs.doc_settings = {}   -- document path -> table
Stubs.shown = {}          -- widgets handed to UIManager:show
Stubs.events = {}         -- events sent through ui:handleEvent
Stubs.online = true

function Stubs.reset()
    Stubs.files = {}
    Stubs.settings = {}
    Stubs.doc_settings = {}
    Stubs.shown = {}
    Stubs.events = {}
    Stubs.online = true
end

function Stubs.addFile(path, size)
    Stubs.files[path] = {size = size or 1024, mode = "file"}
end

local function preload(name, factory)
    package.preload[name] = function() return factory() end
end

-- -- storage ---------------------------------------------------------------

preload("datastorage", function()
    return {
        getSettingsDir = function() return "/settings" end,
        getDataDir = function() return "/data" end,
        getFullDataDir = function() return "/data" end,
    }
end)

preload("luasettings", function()
    local LuaSettings = {}
    LuaSettings.__index = LuaSettings
    -- Storage is resolved on every call: Stubs.reset() swaps the tables out
    -- between tests while long-lived modules keep their instance.
    local function data(self)
        Stubs.settings[self.path] = Stubs.settings[self.path] or {}
        return Stubs.settings[self.path]
    end
    function LuaSettings:open(path)
        return setmetatable({path = path}, LuaSettings)
    end
    function LuaSettings:readSetting(key)
        return data(self)[key]
    end
    function LuaSettings:saveSetting(key, value)
        data(self)[key] = value
        return self
    end
    function LuaSettings:delSetting(key)
        data(self)[key] = nil
        return self
    end
    function LuaSettings:flush() return self end
    return LuaSettings
end)

preload("docsettings", function()
    local DocSettings = {}
    DocSettings.__index = DocSettings
    local function data(self)
        Stubs.doc_settings[self.path] = Stubs.doc_settings[self.path] or {}
        return Stubs.doc_settings[self.path]
    end
    function DocSettings:open(path)
        Stubs.doc_settings[path] = Stubs.doc_settings[path] or {}
        return setmetatable({path = path}, DocSettings)
    end
    function DocSettings:readSetting(key) return data(self)[key] end
    function DocSettings:saveSetting(key, value)
        data(self)[key] = value
        return self
    end
    function DocSettings:delSetting(key)
        data(self)[key] = nil
        return self
    end
    function DocSettings:flush() return self end
    return DocSettings
end)

preload("libs/libkoreader-lfs", function()
    return {
        attributes = function(path, what)
            local entry = Stubs.files[path]
            if not entry then return nil end
            if what == "mode" then return entry.mode end
            if what == "size" then return entry.size end
            return entry
        end,
        mkdir = function(path)
            Stubs.files[path] = {mode = "directory", size = 0}
            return true
        end,
        dir = function()
            return function() return nil end
        end,
    }
end)

-- -- ui --------------------------------------------------------------------

preload("logger", function()
    local noop = function() end
    return {dbg = noop, info = noop, warn = noop, err = noop}
end)

preload("ui/uimanager", function()
    return {
        show = function(_, widget) table.insert(Stubs.shown, widget) end,
        close = function() end,
        setDirty = function() end,
        forceRePaint = function() end,
        nextTick = function(_, fn) fn() end,
    }
end)

preload("ui/widget/confirmbox", function()
    local ConfirmBox = {}
    ConfirmBox.__index = ConfirmBox
    function ConfirmBox:new(options)
        options.widget_type = "confirmbox"
        return setmetatable(options, ConfirmBox)
    end
    return ConfirmBox
end)

preload("ui/widget/infomessage", function()
    local InfoMessage = {}
    InfoMessage.__index = InfoMessage
    function InfoMessage:new(options)
        options.widget_type = "infomessage"
        return setmetatable(options, InfoMessage)
    end
    return InfoMessage
end)

preload("ui/event", function()
    local Event = {}
    Event.__index = Event
    function Event:new(name, ...)
        return setmetatable({name = name, args = {...}}, Event)
    end
    return Event
end)

preload("ui/network/manager", function()
    return {
        isOnline = function() return Stubs.online end,
        isConnected = function() return Stubs.online end,
        runWhenOnline = function(_, action) if Stubs.online then action() end end,
    }
end)

preload("device", function()
    return {
        model = "Kobo Libra Color",
        screen = {
            getWidth = function() return 1264 end,
            getHeight = function() return 1680 end,
            scaleBySize = function(_, size) return size end,
        },
        isTouchDevice = function() return true end,
        hasKeys = function() return true end,
        input = {group = {PgFwd = "PgFwd", PgBack = "PgBack", Back = "Back"}},
    }
end)

preload("util", function()
    return {
        partialMD5 = function(path) return "md5-" .. tostring(path) end,
    }
end)

-- -- network ---------------------------------------------------------------

preload("ltn12", function()
    return {
        source = {string = function(text) return text end},
        sink = {table = function(t) return t end},
    }
end)

preload("socket", function()
    return {skip = function(_, ...) return ... end}
end)

preload("socket.url", function()
    return {
        escape = function(text)
            return (tostring(text):gsub("[^%w%-%.%_%~]", function(char)
                return string.format("%%%02X", string.byte(char))
            end))
        end,
    }
end)

preload("socket.http", function()
    return {request = function() error("la rete non è disponibile nei test") end}
end)

preload("socketutil", function()
    return {
        set_timeout = function() end,
        reset_timeout = function() end,
        LARGE_BLOCK_TIMEOUT = 10,
        LARGE_TOTAL_TIMEOUT = 30,
        FILE_BLOCK_TIMEOUT = 15,
        FILE_TOTAL_TIMEOUT = 300,
    }
end)

preload("mime", function()
    return {b64 = function(text) return "b64:" .. text end}
end)

return Stubs
