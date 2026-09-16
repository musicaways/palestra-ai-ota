--[[--
Downloads, with a progress dialog that can be dismissed.

Both entry points register what they wrote in the document map, which is what
lets the sync engine recognise the file later.
]]

local Config = require("lib/config")
local DocMap = require("lib/docmap")
local Paths = require("lib/paths")
local Trapper = require("ui/trapper")
local UIManager = require("ui/uimanager")
local InfoMessage = require("ui/widget/infomessage")
local logger = require("logger")

local Downloader = {}

local function percent_text(received, expected)
    if expected and expected > 0 then
        return string.format("%d%%  (%s / %s)",
                             math.floor(received / expected * 100),
                             Paths.humanSize(received), Paths.humanSize(expected))
    end
    return Paths.humanSize(received)
end

--[[--
Downloads a book.

`callback(path)` runs after a successful download; errors are shown to the
reader and the callback is not called.
]]
function Downloader.book(backend, item, options, callback)
    options = options or {}
    local format = options.format or (item.formats and item.formats[1]) or "epub"
    local target = Paths.bookTarget(Config.downloadDir(), item, format)

    local existing, existing_path = DocMap.isDownloaded(item.uid)
    if existing and not options.force then
        if callback then callback(existing_path) end
        return existing_path
    end

    Trapper:wrap(function()
        Trapper:info(string.format("Scarico «%s»…", item.title))
        local last_shown = 0
        local path, err = backend:downloadItem(item, target, function(received, expected)
            local now = os.time()
            if now ~= last_shown then
                last_shown = now
                -- Trapper:info returns false when the reader dismissed the box.
                local keep_going = Trapper:info(string.format("Scarico «%s»…\n%s",
                                                              item.title,
                                                              percent_text(received, expected)))
                if keep_going == false then return false end
            end
            return true
        end, options.format)
        Trapper:clear()

        if not path then
            if tostring(err) ~= "annullato" then
                UIManager:show(InfoMessage:new{
                    text = string.format("Download non riuscito:\n%s", tostring(err)),
                    timeout = 5,
                })
            end
            return
        end
        DocMap.register(path, item)
        Downloader.registerAlias(backend, path, item.uid)
        logger.info("InkBridge: scaricato", path)
        if callback then callback(path) end
    end)
    return target
end

--- Downloads one manga chapter as a CBZ.
function Downloader.chapter(backend, item, chapter, options, callback)
    options = options or {}
    local target = Paths.chapterTarget(Config.downloadDir(), item, chapter)

    local existing, existing_path = DocMap.isDownloaded(chapter.uid)
    if existing and not options.force then
        if callback then callback(existing_path) end
        return existing_path
    end

    Trapper:wrap(function()
        local label = string.format("%s\n%s", item.title, chapter.name or "")
        Trapper:info("Preparo il capitolo…\n" .. label)
        local last_shown = 0
        local path, err = backend:downloadChapter(item, chapter, target,
            function(received, expected)
                local now = os.time()
                if now ~= last_shown then
                    last_shown = now
                    local text
                    if expected and expected > 0 and expected < 10000 then
                        -- Direct mode counts pages, the hub counts bytes.
                        text = string.format("Pagina %d di %d", received, expected)
                    else
                        text = percent_text(received, expected)
                    end
                    if Trapper:info(label .. "\n" .. text) == false then return false end
                end
                return true
            end)
        Trapper:clear()

        if not path then
            if tostring(err) ~= "annullato" then
                UIManager:show(InfoMessage:new{
                    text = string.format("Capitolo non scaricato:\n%s", tostring(err)),
                    timeout = 5,
                })
            end
            return
        end
        DocMap.register(path, item, chapter)
        Downloader.registerAlias(backend, path, item.uid)
        if callback then callback(path) end
    end)
    return target
end

--- Tells the hub which catalogue item a KOSync document hash belongs to.
function Downloader.registerAlias(backend, path, uid)
    if not backend.registerAlias then return end
    local hash = DocMap.documentHash(path)
    if not hash then return end
    backend:registerAlias("kosync:" .. hash, uid)
end

--- Removes a downloaded file and forgets it.
function Downloader.remove(path)
    Paths.remove(path)
    DocMap.forget(path)
end

return Downloader
