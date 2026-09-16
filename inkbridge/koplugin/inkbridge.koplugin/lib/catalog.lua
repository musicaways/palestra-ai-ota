--[[--
Catalogue access with the caching the device needs.

An e-ink screen redraws in ~300 ms and the Wi-Fi takes seconds to answer, so
pages already seen are kept in memory for the session and covers are kept on
disk between sessions.
]]

local Config = require("lib/config")
local Paths = require("lib/paths")
local logger = require("logger")

local Catalog = {}

Catalog.backend = nil
Catalog._pages = {}     -- cache key -> page
Catalog._items = {}     -- uid -> item
Catalog._covers = {}    -- uid -> path | false (false = tried and failed)

function Catalog.setBackend(backend)
    Catalog.backend = backend
    Catalog.invalidate()
end

function Catalog.invalidate()
    Catalog._pages = {}
    Catalog._items = {}
end

local function key_for(options)
    return table.concat({
        options.source or "all",
        options.query or "",
        tostring(options.offset or 0),
        tostring(options.limit or 24),
        options.sort or "",
    }, "|")
end

--- One page of the catalogue.  Returns `page, error`.
function Catalog.page(options)
    options = options or {}
    options.limit = options.limit or Config.get("page_size")
    if not Catalog.backend then return nil, "back end non configurato" end

    local key = key_for(options)
    if Catalog._pages[key] and not options.refresh then
        return Catalog._pages[key]
    end
    local page, err = Catalog.backend:listItems(options)
    if not page then return nil, err end

    for _, item in ipairs(page.items or {}) do
        Catalog._items[item.uid] = item
    end
    Catalog._pages[key] = page
    return page
end

function Catalog.item(uid)
    if Catalog._items[uid] then return Catalog._items[uid] end
    if not Catalog.backend then return nil, "back end non configurato" end
    local item, err = Catalog.backend:item(uid)
    if not item then return nil, err end
    Catalog._items[uid] = item
    return item
end

function Catalog.chapters(uid)
    if not Catalog.backend then return nil, "back end non configurato" end
    return Catalog.backend:chapters(uid)
end

--[[--
The local path of a cover, downloading it when missing.

Returns nil when the cover cannot be had; callers draw a placeholder instead of
leaving a hole in the grid.
]]
function Catalog.cover(uid)
    if Catalog._covers[uid] ~= nil then
        return Catalog._covers[uid] or nil
    end
    local path = Paths.coverFile(uid)
    if Paths.exists(path) and Paths.size(path) > 0 then
        Catalog._covers[uid] = path
        return path
    end
    if not Catalog.backend then return nil end
    local downloaded, err = Catalog.backend:fetchCover(uid, path)
    if not downloaded then
        logger.dbg("InkBridge: copertina non scaricata per", uid, err)
        Catalog._covers[uid] = false
        return nil
    end
    Catalog._covers[uid] = path
    return path
end

--- Forgets a cover so the next draw fetches it again.
function Catalog.dropCover(uid)
    Catalog._covers[uid] = nil
    Paths.remove(Paths.coverFile(uid))
end

function Catalog.clearCovers()
    Catalog._covers = {}
    local lfs = require("libs/libkoreader-lfs")
    local dir = Paths.coverCache()
    for entry in lfs.dir(dir) do
        if entry:match("%.jpg$") then os.remove(dir .. "/" .. entry) end
    end
end

function Catalog.sources()
    if not Catalog.backend then return nil, "back end non configurato" end
    return Catalog.backend:sources()
end

return Catalog
