--[[--
Which file on the device is which item on the NAS.

Downloads register themselves here, so opening a book later is enough for the
sync engine to know what to talk about.  Three ways in, in order of trust:

1. the path we wrote when downloading;
2. `inkbridge_uid` saved in the document's own sidecar (survives a move or a
   rename done in the file browser);
3. KOReader's partial MD5, which is also the KOSync document id.
]]

local DataStorage = require("datastorage")
local DocSettings = require("docsettings")
local LuaSettings = require("luasettings")
local logger = require("logger")
local util = require("util")

local DocMap = {}

local store

local function settings()
    if not store then
        store = LuaSettings:open(DataStorage:getSettingsDir() .. "/inkbridge_docs.lua")
    end
    return store
end

local function table_of(key)
    return settings():readSetting(key) or {}
end

--- Remembers that `path` holds `item` (and `chapter`, for manga).
function DocMap.register(path, item, chapter)
    local by_path = table_of("by_path")
    local entry = {
        uid = item.uid,
        kind = item.kind,
        title = item.title,
        source = item.source,
        chapter_uid = chapter and chapter.uid or nil,
        chapter_index = chapter and chapter.index or nil,
        chapter_name = chapter and chapter.name or nil,
        chapter_count = item.chapter_count,
        downloaded_at = os.time(),
    }
    by_path[path] = entry
    settings():saveSetting("by_path", by_path)

    local by_uid = table_of("by_uid")
    local key = chapter and chapter.uid or item.uid
    by_uid[key] = path
    settings():saveSetting("by_uid", by_uid)
    settings():flush()

    -- Second copy inside the document's sidecar, so a rename does not lose it.
    local ok, doc_settings = pcall(DocSettings.open, DocSettings, path)
    if ok and doc_settings then
        doc_settings:saveSetting("inkbridge", entry)
        doc_settings:flush()
    else
        logger.dbg("InkBridge: sidecar non scrivibile per", path)
    end
    return entry
end

--- The catalogue entry for an open document, or nil.
function DocMap.forPath(path)
    if not path then return nil end
    local entry = table_of("by_path")[path]
    if entry then return entry end
    local ok, doc_settings = pcall(DocSettings.open, DocSettings, path)
    if ok and doc_settings then
        local sidecar = doc_settings:readSetting("inkbridge")
        if sidecar and sidecar.uid then
            -- Re-file it under the new path so the next lookup is cheap.
            local by_path = table_of("by_path")
            by_path[path] = sidecar
            settings():saveSetting("by_path", by_path)
            settings():flush()
            return sidecar
        end
    end
    return nil
end

function DocMap.pathFor(uid)
    return table_of("by_uid")[uid]
end

function DocMap.forget(path)
    -- Also drop the sidecar copy: otherwise the next forPath() would restore
    -- the entry we just removed.
    local ok, doc_settings = pcall(DocSettings.open, DocSettings, path)
    if ok and doc_settings then
        doc_settings:delSetting("inkbridge")
        doc_settings:flush()
    end
    local by_path = table_of("by_path")
    local entry = by_path[path]
    by_path[path] = nil
    settings():saveSetting("by_path", by_path)
    if entry then
        local by_uid = table_of("by_uid")
        local key = entry.chapter_uid or entry.uid
        if by_uid[key] == path then by_uid[key] = nil end
        settings():saveSetting("by_uid", by_uid)
    end
    settings():flush()
end

--- True when this item (or this chapter) is already on the device.
function DocMap.isDownloaded(uid)
    local path = DocMap.pathFor(uid)
    if not path then return false end
    local lfs = require("libs/libkoreader-lfs")
    if lfs.attributes(path, "mode") ~= "file" then
        DocMap.forget(path)
        return false
    end
    return true, path
end

--- KOReader's own document hash — also the id the KOSync protocol uses.
function DocMap.documentHash(path)
    local ok, hash = pcall(util.partialMD5, path)
    if ok and hash then return hash end
    return nil
end

--- Progress arriving from the NAS for a document that is not open yet.
function DocMap.stashRemote(uid, record)
    local pending = table_of("pending_remote")
    pending[uid] = record
    settings():saveSetting("pending_remote", pending)
    settings():flush()
end

function DocMap.takeRemote(uid)
    local pending = table_of("pending_remote")
    local record = pending[uid]
    if record then
        pending[uid] = nil
        settings():saveSetting("pending_remote", pending)
        settings():flush()
    end
    return record
end

function DocMap.peekRemote(uid)
    return table_of("pending_remote")[uid]
end

function DocMap.all()
    return table_of("by_path")
end

function DocMap._useStore(other)
    store = other
end

return DocMap
