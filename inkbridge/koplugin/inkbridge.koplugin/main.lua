--[[--
InkBridge — Calibre and Suwayomi on a Kobo, kept in sync.

The plugin lives in two worlds: in the file manager it is a library browser, in
the reader it is the thing that remembers where you got to and tells the NAS.
]]

-- The plugin's own modules live in lib/; make them requirable however the
-- plugin loader set package.path up.
local plugin_dir = debug.getinfo(1, "S").source:sub(2):match("(.*)/main%.lua$")
if plugin_dir then
    package.path = plugin_dir .. "/?.lua;" .. package.path
end

local Config = require("lib/config")
local Dispatcher = require("dispatcher")
local DocMap = require("lib/docmap")
local InfoMessage = require("ui/widget/infomessage")
local Queue = require("lib/queue")
local Sync = require("lib/sync")
local UIManager = require("ui/uimanager")
local WidgetContainer = require("ui/widget/container/widgetcontainer")
local logger = require("logger")

local InkBridge = WidgetContainer:extend{
    name = "inkbridge",
    is_doc_only = false,
}

function InkBridge:init()
    self.pages_since_push = 0
    self:onDispatcherRegisterActions()
    if self.ui and self.ui.menu then
        self.ui.menu:registerToMainMenu(self)
    end
end

function InkBridge:onDispatcherRegisterActions()
    Dispatcher:registerAction("inkbridge_library", {
        category = "none", event = "InkBridgeLibrary",
        title = "InkBridge: libreria", general = true,
    })
    Dispatcher:registerAction("inkbridge_sync", {
        category = "none", event = "InkBridgeSync",
        title = "InkBridge: sincronizza", general = true,
    })
end

function InkBridge:addToMainMenu(menu_items)
    menu_items.inkbridge = {
        text = "InkBridge",
        sorting_hint = "tools",
        sub_item_table = require("lib/settings_ui").menu(self),
    }
end

-- -- actions ---------------------------------------------------------------

local function notify(text, timeout)
    UIManager:show(InfoMessage:new{text = text, timeout = timeout or 3})
end

function InkBridge:browser()
    return require("lib/browser")
end

function InkBridge:openLibrary()
    self:browser().show()
end

function InkBridge:resetBackend()
    local Browser = self:browser()
    Browser.backend = nil
    require("lib/catalog").invalidate()
    Browser.ensureBackend(true)
end

function InkBridge:syncNow()
    self:browser().syncNow()
end

function InkBridge:testConnection()
    local Browser = self:browser()
    local backend = Browser.ensureBackend(true)
    if not backend then return end
    Browser.withNetwork(function()
        local health, err = backend:health()
        if not health then
            notify("Connessione fallita:\n" .. tostring(err), 6)
            return
        end
        local lines = {"Connessione riuscita."}
        for _, source in ipairs(health.sources or {}) do
            lines[#lines + 1] = string.format("%s: %s", source.name,
                source.available and (source.detail ~= "" and source.detail or "attiva")
                or ("non disponibile — " .. tostring(source.detail)))
        end
        notify(table.concat(lines, "\n"), 6)
    end)
end

function InkBridge:showStatus()
    local queued = Queue.count()
    local lines = {
        string.format("Dispositivo: %s", Config.deviceName()),
        string.format("Modalità: %s", Config.get("mode") == "hub" and "hub" or "diretta"),
        string.format("In coda: %d", queued),
        string.format("Cursore di sincronizzazione: %d", Queue.cursor()),
        string.format("Cartella: %s", Config.downloadDir()),
    }
    notify(table.concat(lines, "\n"), 8)
end

function InkBridge:onInkBridgeLibrary()
    self:openLibrary()
    return true
end

function InkBridge:onInkBridgeSync()
    self:syncNow()
    return true
end

-- -- reader integration ----------------------------------------------------

--- The catalogue entry of the open document, if it came from the NAS.
function InkBridge:currentEntry()
    if not self.ui or not self.ui.document then return nil end
    if self._entry_for == self.ui.document.file then return self._entry end
    self._entry_for = self.ui.document.file
    self._entry = DocMap.forPath(self.ui.document.file)
    return self._entry
end

function InkBridge:onReaderReady()
    self.pages_since_push = 0
    local entry = self:currentEntry()
    if not entry then return end
    if not Config.get("sync_enabled") or not Config.get("sync_on_open") then return end

    local Browser = self:browser()
    if not Browser.ensureBackend() then return end

    -- Anything already pulled for this document is applied without the network.
    local stashed = DocMap.takeRemote(entry.uid)
    if stashed then
        Sync.resolveOnOpen(self.ui, entry, stashed)
        return
    end

    local NetworkMgr = require("ui/network/manager")
    if not NetworkMgr:isOnline() then return end   -- never hold up opening a book
    local remote = Sync.remoteFor(entry.uid)
    if remote then
        Sync.resolveOnOpen(self.ui, entry, remote)
    end
end

--- Queues the current position (and sends it when the network is already up).
function InkBridge:pushCurrentProgress(options)
    options = options or {}
    local entry = self:currentEntry()
    if not entry then return end
    if not Config.get("sync_enabled") then return end

    local record = Sync.recordProgress(self.ui, entry, {flush = false})
    if not record then return end
    Sync.stampDocument(self.ui, record)

    local NetworkMgr = require("ui/network/manager")
    if options.force_flush or NetworkMgr:isOnline() then
        local sent, err = Sync.flush({only_if_online = true, open_ui = self.ui, silent = true})
        if err and err ~= "offline" then
            logger.dbg("InkBridge: invio rinviato:", err)
        end
        return sent
    end
end

function InkBridge:onCloseDocument()
    if Config.get("sync_on_close") then
        self:pushCurrentProgress()
    end
end

function InkBridge:onFlushSettings()
    -- KOReader flushes settings on suspend and before closing: a good moment.
    if Config.get("sync_on_close") then
        self:pushCurrentProgress()
    end
end

function InkBridge:onSuspend()
    if Config.get("sync_on_close") then
        self:pushCurrentProgress()
    end
end

function InkBridge:onEndOfBook()
    local entry = self:currentEntry()
    if not entry then return end
    local record = Sync.recordProgress(self.ui, entry, {flush = false})
    if record then
        record.percent = 1
        record.status = "finished"
        Queue.put(record)
        self:pushCurrentProgress()
    end
end

local function count_page(self)
    if not Config.get("sync_enabled") then return end
    local every = tonumber(Config.get("sync_every_pages")) or 0
    if every <= 0 then return end
    self.pages_since_push = (self.pages_since_push or 0) + 1
    if self.pages_since_push >= every then
        self.pages_since_push = 0
        self:pushCurrentProgress()
    end
end

function InkBridge:onPageUpdate()
    count_page(self)
end

function InkBridge:onPosUpdate()
    count_page(self)
end

--- When the Wi-Fi comes up for any reason, empty the queue.
function InkBridge:onNetworkConnected()
    if not Config.get("sync_enabled") then return end
    if Queue.count() == 0 then return end
    local Browser = self:browser()
    if not Browser.backend then
        if not Config.isConfigured() then return end
        Browser.ensureBackend()
    end
    Sync.flush({only_if_online = true, open_ui = self.ui, silent = true})
end

return InkBridge
