--[[--
Back-end interface and factory.

A back end answers these calls (each returns `value` or `nil, message`):

    :sources()                           → { {id, name, kind, available, detail}, … }
    :listItems{source, query, offset, limit}
                                         → {items = {…}, total = n, offset, limit}
    :item(uid)                           → item
    :chapters(uid)                       → { chapter, … }          (manga only)
    :fetchCover(uid, path)               → path
    :downloadItem(item, dir, on_progress)→ path, format
    :downloadChapter(item, chapter, dir, on_progress)
                                         → path
    :getProgress(uid)                    → record | false          (false = none yet)
    :pushProgress(records)               → {cursor = n}
    :pullProgress(cursor)                → {records = {…}, cursor} (hub only)

An `item` is the same shape the hub serves:
`{uid, kind, source, title, authors, series, tags, description, formats,
  chapter_count, unread_count, progress}`.
]]

local Config = require("lib/config")

local Backend = {}

--- Builds the back end the settings ask for.  Returns `nil, message` when the
--- plugin has not been configured yet.
function Backend.create()
    if Config.get("mode") == "hub" then
        local url = Config.get("hub_url")
        if url == "" then
            return nil, "Indirizzo dell'hub non impostato"
        end
        return require("lib/backend_hub").new{
            url = url,
            token = Config.get("hub_token"),
        }
    end
    local Direct = require("lib/backend_direct")
    local backend = Direct.new{
        calibre_url = Config.get("calibre_url"),
        calibre_username = Config.get("calibre_username"),
        calibre_password = Config.get("calibre_password"),
        calibre_library = Config.get("calibre_library"),
        suwayomi_url = Config.get("suwayomi_url"),
        suwayomi_username = Config.get("suwayomi_username"),
        suwayomi_password = Config.get("suwayomi_password"),
    }
    if not backend:hasAnySource() then
        return nil, "Nessuna sorgente configurata (Calibre o Suwayomi)"
    end
    return backend
end

--- Normalises whatever a back end produced into the shape the UI expects.
function Backend.normalise(item)
    item = item or {}
    item.authors = item.authors or {}
    item.tags = item.tags or {}
    item.formats = item.formats or {}
    item.title = item.title or "(senza titolo)"
    item.kind = item.kind or "book"
    return item
end

--- "Autore, Altro Autore" for the cover grid caption.
function Backend.authorLine(item)
    if not item.authors or #item.authors == 0 then return "" end
    return table.concat(item.authors, ", ")
end

return Backend
