--[[--
The sync engine on the device side.

Device → NAS: every progress update is queued and pushed (immediately when the
Wi-Fi is up, at the next sync otherwise).

NAS → device: a delta pull brings back what other devices — or Calibre's own
viewer, or Mihon on the phone — have read.  Progress for a book that is not open
is written straight into its sidecar, so the file browser shows the right
percentage without opening anything.  For the book you are opening right now,
the engine decides: silently when the difference is small, by asking you when it
is not.
]]

local Config = require("lib/config")
local DocMap = require("lib/docmap")
local DocSettings = require("docsettings")
local Event = require("ui/event")
local Queue = require("lib/queue")
local logger = require("logger")

local Sync = {}

Sync.backend = nil

function Sync.setBackend(backend)
    Sync.backend = backend
end

local function now_ms()
    return math.floor(os.time() * 1000)
end

local function clamp(value)
    if value == nil then return 0 end
    if value < 0 then return 0 end
    if value > 1 then return 1 end
    return value
end

--- Reads where the open document currently is.
function Sync.readState(ui)
    local state = {percent = 0, locator = nil, page = nil, pages = nil}
    if not ui or not ui.document then return state end

    local ok, pages = pcall(function() return ui.document:getPageCount() end)
    state.pages = ok and pages or nil

    local has_pages = ui.document.info and ui.document.info.has_pages
    if has_pages then
        local got, page = pcall(function()
            return ui.paging and ui.paging:getLastProgress() or ui.document:getCurrentPage()
        end)
        state.page = got and tonumber(page) or nil
        local got_percent, percent = pcall(function()
            return ui.paging and ui.paging:getLastPercent() or nil
        end)
        if got_percent and tonumber(percent) then
            state.percent = clamp(tonumber(percent))
        elseif state.page and state.pages and state.pages > 0 then
            state.percent = clamp(state.page / state.pages)
        end
    else
        local got, locator = pcall(function()
            return ui.rolling and ui.rolling:getLastProgress() or nil
        end)
        state.locator = got and type(locator) == "string" and locator or nil
        local got_percent, percent = pcall(function()
            return ui.rolling and ui.rolling:getLastPercent() or nil
        end)
        state.percent = clamp(got_percent and tonumber(percent) or 0)
        local got_page, page = pcall(function() return ui.document:getCurrentPage() end)
        state.page = got_page and tonumber(page) or nil
    end
    return state
end

--[[--
Builds the record to send for an open document.

For a manga chapter the percentage is scaled to the whole series, because that
is what Suwayomi and the catalogue show: page 10 of 20 in chapter 2 of 4 is 37%
of the series, not 50%.
]]
function Sync.buildRecord(ui, entry, state)
    if not entry or not entry.uid then return nil end
    state = state or Sync.readState(ui)

    local record = {
        uid = entry.uid,
        kind = entry.kind or "book",
        percent = clamp(state.percent),
        locator = state.locator,
        page = state.page,
        pages = state.pages,
        device_id = Config.deviceId(),
        device_name = Config.deviceName(),
        updated_at = now_ms(),
        status = "reading",
    }

    if entry.kind == "manga" and entry.chapter_uid then
        record.chapter_uid = entry.chapter_uid
        local total = tonumber(entry.chapter_count) or 0
        local index = tonumber(entry.chapter_index) or 0
        local within = clamp(state.percent)
        if total > 0 then
            record.percent = clamp((index + within) / total)
        end
    end

    if record.percent >= 0.99 then
        record.status = "finished"
    elseif record.percent <= 0 then
        record.status = "new"
    end
    return record
end

--- Queues the current position; pushes it too when the network is already up.
function Sync.recordProgress(ui, entry, options)
    options = options or {}
    if not Config.get("sync_enabled") then return end
    local record = Sync.buildRecord(ui, entry)
    if not record then return end
    Queue.put(record)
    logger.dbg("InkBridge: progresso in coda", record.uid, record.percent)
    if options.flush ~= false then
        Sync.flush({silent = true, only_if_online = options.only_if_online ~= false})
    end
    return record
end

local function network_ready(options)
    local NetworkMgr = require("ui/network/manager")
    if NetworkMgr:isOnline() then return true end
    if options.only_if_online then return false end
    if not Config.get("auto_wifi") then return false end
    return false, NetworkMgr
end

--- Sends everything queued.  Returns `sent, error`.
function Sync.flush(options)
    options = options or {}
    if not Sync.backend then return 0, "back end non configurato" end
    local pending = Queue.pending()
    if #pending == 0 then return 0 end

    local ready, NetworkMgr = network_ready(options)
    if not ready then
        if NetworkMgr and options.wait_for_wifi then
            NetworkMgr:runWhenOnline(function()
                Sync.flush({silent = options.silent, only_if_online = true})
            end)
        end
        return 0, "offline"
    end

    local result, err = Sync.backend:pushProgress(pending, Config.deviceId(), Config.deviceName())
    if not result then
        logger.warn("InkBridge: push fallito:", err)
        return 0, err
    end
    Queue.acknowledge(pending)

    -- The hub answers with the authoritative record for every rejected push;
    -- apply those straight away so the device stops arguing.
    for _, outcome in ipairs(result.outcomes or {}) do
        if outcome.result == "stale" and outcome.record then
            Sync.applyRemote(outcome.record, {open_ui = options.open_ui})
        end
    end
    if result.cursor and result.cursor > 0 then
        Queue.setCursor(math.max(Queue.cursor(), result.cursor))
    end
    return #pending
end

--- Pulls what changed on the NAS since the last time.  Returns `applied, error`.
function Sync.pull(options)
    options = options or {}
    if not Sync.backend then return 0, "back end non configurato" end
    if not Sync.backend.supports_delta then return 0 end

    local ready = network_ready(options)
    if not ready then return 0, "offline" end

    local applied = 0
    local cursor = Queue.cursor()
    -- Loop: the hub answers in pages of 500 records.
    for _ = 1, 20 do
        local data, err = Sync.backend:pullProgress(cursor, Config.deviceId(), Config.deviceName())
        if not data then return applied, err end
        local records = data.records or {}
        for _, record in ipairs(records) do
            if record.device_id ~= Config.deviceId() then
                if Sync.applyRemote(record, {open_ui = options.open_ui}) then
                    applied = applied + 1
                end
            end
        end
        cursor = data.cursor or cursor
        Queue.setCursor(cursor)
        if #records == 0 then break end
    end
    return applied
end

--[[--
Applies one remote record.

Three cases: the document is open (ask or jump), the document is on the device
but closed (write its sidecar), or we do not have the file at all (remember the
position for when it is downloaded).
]]
function Sync.applyRemote(record, options)
    options = options or {}
    if not record or not record.uid then return false end

    local target_uid = record.chapter_uid or record.uid
    local downloaded, path = DocMap.isDownloaded(target_uid)
    if not downloaded then
        downloaded, path = DocMap.isDownloaded(record.uid)
    end

    local open_ui = options.open_ui
    if downloaded and open_ui and open_ui.document
       and open_ui.document.file == path then
        return Sync.resolveOnOpen(open_ui, DocMap.forPath(path), record)
    end

    if downloaded then
        Sync.applyToClosedDocument(path, record)
        return true
    end

    DocMap.stashRemote(record.uid, record)
    return true
end

--- Writes a position into a document that is not open.
function Sync.applyToClosedDocument(path, record)
    local ok, doc_settings = pcall(DocSettings.open, DocSettings, path)
    if not ok or not doc_settings then return false end

    local entry = DocMap.forPath(path)
    local percent = clamp(record.percent)
    if entry and entry.kind == "manga" and entry.chapter_uid == record.chapter_uid
       and record.pages and record.pages > 0 and record.page then
        -- The file on the device is one chapter: store the position inside it.
        percent = clamp(record.page / record.pages)
    end

    doc_settings:saveSetting("percent_finished", percent)
    if record.locator and record.locator:sub(1, 1) == "/" then
        doc_settings:saveSetting("last_xpointer", record.locator)
    elseif record.page then
        doc_settings:saveSetting("last_page", record.page)
    end
    doc_settings:saveSetting("inkbridge_synced_at", record.updated_at or now_ms())
    doc_settings:flush()
    logger.dbg("InkBridge: posizione remota scritta nel sidecar di", path)
    return true
end

--- Sends the open document to `record`'s position.
function Sync.jumpTo(ui, record, entry)
    if not ui or not ui.document then return false end
    if ui.link and ui.link.addCurrentLocationToStack then
        pcall(function() ui.link:addCurrentLocationToStack() end)
    end

    local has_pages = ui.document.info and ui.document.info.has_pages
    if not has_pages and record.locator and record.locator:sub(1, 1) == "/" then
        local ok = pcall(function()
            ui:handleEvent(Event:new("GotoXPointer", record.locator))
        end)
        if ok then return true end
    end

    local percent = clamp(record.percent)
    if entry and entry.kind == "manga" and record.pages and record.page
       and entry.chapter_uid == record.chapter_uid then
        percent = clamp(record.page / record.pages)
    end
    local pages = select(2, pcall(function() return ui.document:getPageCount() end))
    pages = tonumber(pages) or 0
    local page = record.page
    if not page or (entry and entry.kind == "book" and record.pages ~= pages) then
        page = pages > 0 and math.max(1, math.floor(percent * pages + 0.5)) or nil
    end
    if page then
        return pcall(function() ui:handleEvent(Event:new("GotoPage", page)) end)
    end
    return false
end

--[[--
Called when a document is opened: reconciles local and remote position.

Below the tolerance the newer one simply wins.  Above it, the reader is asked —
losing the page you are on because another device was ahead is exactly the kind
of "helpful" behaviour that makes people turn sync off.
]]
function Sync.resolveOnOpen(ui, entry, remote)
    if not entry or not entry.uid then return false end
    remote = remote or DocMap.takeRemote(entry.uid)
    if not remote then return false end

    local state = Sync.readState(ui)
    local local_record = Sync.buildRecord(ui, entry, state)
    local local_percent = local_record and local_record.percent or 0
    local remote_percent = clamp(remote.percent)

    local doc_settings = ui.doc_settings
    local local_stamp = 0
    if doc_settings then
        local_stamp = tonumber(doc_settings:readSetting("inkbridge_pushed_at")) or 0
    end
    if (remote.updated_at or 0) <= local_stamp then
        return false  -- we already know about this one
    end

    local difference = math.abs(remote_percent - local_percent)
    local tolerance = tonumber(Config.get("conflict_tolerance")) or 0.01
    if difference <= tolerance then
        return false
    end

    local UIManager = require("ui/uimanager")
    local ConfirmBox = require("ui/widget/confirmbox")
    local device = remote.device_name ~= "" and remote.device_name or "un altro dispositivo"
    UIManager:show(ConfirmBox:new{
        text = string.format(
            "Su %s la lettura è al %d%%, qui sei al %d%%.\nVuoi continuare da %d%%?",
            device, math.floor(remote_percent * 100 + 0.5), math.floor(local_percent * 100 + 0.5),
            math.floor(remote_percent * 100 + 0.5)),
        ok_text = "Vai lì",
        cancel_text = "Resta qui",
        ok_callback = function()
            Sync.jumpTo(ui, remote, entry)
        end,
    })
    return true
end

--- Fetches the remote record for one item, hub or not.
function Sync.remoteFor(uid)
    if not Sync.backend then return nil end
    local record, err = Sync.backend:getProgress(uid)
    if record == false then return nil end
    return record, err
end

--- Full sync: push what we have, pull what changed.
function Sync.syncNow(options)
    options = options or {}
    local sent, push_error = Sync.flush({only_if_online = options.only_if_online,
                                         open_ui = options.open_ui})
    local applied, pull_error = Sync.pull({only_if_online = options.only_if_online,
                                           open_ui = options.open_ui})
    return {
        sent = sent or 0,
        applied = applied or 0,
        error = push_error or pull_error,
        queued = Queue.count(),
    }
end

--- Marks the document as pushed, so opening it again does not re-ask.
function Sync.stampDocument(ui, record)
    if ui and ui.doc_settings and record then
        ui.doc_settings:saveSetting("inkbridge_pushed_at", record.updated_at)
    end
end

return Sync
