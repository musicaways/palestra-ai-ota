--[[--
The offline queue.

A Kobo is offline most of the time: the Wi-Fi comes up when you ask for it and
goes away to save battery.  Every progress update is written here first and
sent later, so closing a book in aeroplane mode still reaches the NAS.

Only the newest record per item is kept — an older position for the same book
has no value once a newer one exists.
]]

local DataStorage = require("datastorage")
local LuaSettings = require("luasettings")

local Queue = {}

local store

local function settings()
    if not store then
        store = LuaSettings:open(DataStorage:getSettingsDir() .. "/inkbridge_queue.lua")
    end
    return store
end

local function records()
    return settings():readSetting("records") or {}
end

local function save(list)
    settings():saveSetting("records", list)
    settings():flush()
end

--- Adds (or replaces) the record for `record.uid`.
function Queue.put(record)
    if not record or not record.uid then return end
    local list = records()
    local existing = list[record.uid]
    if existing and (existing.updated_at or 0) > (record.updated_at or 0) then
        return  -- never let an older reading replace a newer one
    end
    list[record.uid] = record
    save(list)
end

function Queue.get(uid)
    return records()[uid]
end

--- Everything waiting, as an array.
function Queue.pending()
    local list = {}
    for _, record in pairs(records()) do list[#list + 1] = record end
    table.sort(list, function(a, b)
        return (a.updated_at or 0) < (b.updated_at or 0)
    end)
    return list
end

function Queue.count()
    local count = 0
    for _ in pairs(records()) do count = count + 1 end
    return count
end

--- Drops the records that were accepted, keeping anything queued meanwhile.
function Queue.acknowledge(sent)
    local list = records()
    for _, record in ipairs(sent) do
        local current = list[record.uid]
        if current and (current.updated_at or 0) <= (record.updated_at or 0) then
            list[record.uid] = nil
        end
    end
    save(list)
end

function Queue.clear()
    save({})
end

function Queue.cursor()
    return settings():readSetting("cursor") or 0
end

function Queue.setCursor(cursor)
    settings():saveSetting("cursor", cursor or 0)
    settings():flush()
end

function Queue._useStore(other)
    store = other
end

return Queue
