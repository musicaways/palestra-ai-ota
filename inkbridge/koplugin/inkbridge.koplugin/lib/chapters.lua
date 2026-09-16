--[[--
Chapter list of a manga: what is read, what is on the device, what to open.
]]

local Catalog = require("lib/catalog")
local Config = require("lib/config")
local DocMap = require("lib/docmap")
local Downloader = require("lib/downloader")
local InfoMessage = require("ui/widget/infomessage")
local Menu = require("ui/widget/menu")
local Queue = require("lib/queue")
local Sync = require("lib/sync")
local Trapper = require("ui/trapper")
local UIManager = require("ui/uimanager")
local Device = require("device")

local Screen = Device.screen

local Chapters = {}

local function notify(text, timeout)
    UIManager:show(InfoMessage:new{text = text, timeout = timeout or 3})
end

local function open_file(path)
    local ReaderUI = require("apps/reader/readerui")
    ReaderUI:showReader(path)
end

--- Marker on the right-hand side of each row.
local function chapter_state(chapter)
    if chapter.read then return "letto" end
    if chapter.last_page_read and chapter.last_page_read > 0 then
        if chapter.pages and chapter.pages > 0 then
            return string.format("%d/%d", chapter.last_page_read + 1, chapter.pages)
        end
        return "iniziato"
    end
    return nil
end

function Chapters.show(browser, item)
    browser.withNetwork(function()
        Trapper:wrap(function()
            Trapper:info("Carico i capitoli…")
            local chapters, err = Catalog.chapters(item.uid)
            Trapper:clear()
            if not chapters then
                notify("Capitoli non disponibili:\n" .. tostring(err), 5)
                return
            end
            Chapters.display(browser, item, chapters)
        end)
    end)
end

function Chapters.display(browser, item, chapters)
    item.chapter_count = item.chapter_count or #chapters
    local items = {}

    local unread = {}
    for _, chapter in ipairs(chapters) do
        if not chapter.read then unread[#unread + 1] = chapter end
    end
    if #unread > 0 then
        items[#items + 1] = {
            text = string.format("⤓  Scarica i prossimi %d non letti",
                                 math.min(5, #unread)),
            bulk = true,
        }
    end

    for _, chapter in ipairs(chapters) do
        local downloaded = DocMap.isDownloaded(chapter.uid)
        local marker = chapter_state(chapter)
        local prefix = downloaded and "↓ " or "  "
        items[#items + 1] = {
            text = prefix .. (chapter.name or ("Capitolo " .. tostring(chapter.index + 1))),
            mandatory = marker,
            chapter = chapter,
        }
    end

    local menu
    menu = Menu:new{
        title = item.title,
        subtitle = string.format("%d capitoli · %d non letti", #chapters, #unread),
        item_table = items,
        is_borderless = true,
        is_popout = false,
        covers_fullscreen = true,
        width = Screen:getWidth(),
        height = Screen:getHeight(),
        onMenuSelect = function(_, entry)
            if entry.bulk then
                UIManager:close(menu)
                Chapters.downloadNext(browser, item, unread, 5)
                return true
            end
            Chapters.open(browser, item, entry.chapter)
            return true
        end,
        onMenuHold = function(_, entry)
            if entry.chapter then
                Chapters.actions(browser, item, entry.chapter, chapters)
            end
            return true
        end,
        close_callback = function() UIManager:close(menu) end,
    }
    UIManager:show(menu)
    Chapters.menu = menu
end

--- Opens a chapter, downloading it first when needed.
function Chapters.open(browser, item, chapter)
    local downloaded, path = DocMap.isDownloaded(chapter.uid)
    if downloaded then
        open_file(path)
        return
    end
    browser.withNetwork(function()
        Downloader.chapter(browser.backend, item, chapter, {}, function(new_path)
            open_file(new_path)
        end)
    end)
end

--- Grabs the next few unread chapters in one go, for the train ride.
function Chapters.downloadNext(browser, item, unread, count)
    browser.withNetwork(function()
        local total = math.min(count, #unread)
        for index = 1, total do
            local chapter = unread[index]
            if not DocMap.isDownloaded(chapter.uid) then
                Downloader.chapter(browser.backend, item, chapter, {})
            end
        end
        notify(string.format("Scaricati fino a %d capitoli.", total))
    end)
end

function Chapters.actions(browser, item, chapter, chapters)
    local ButtonDialog = require("ui/widget/buttondialog")
    local downloaded, path = DocMap.isDownloaded(chapter.uid)
    local dialog
    local function close() UIManager:close(dialog) end

    local buttons = {{{
        text = downloaded and "Leggi" or "Scarica e leggi",
        callback = function() close() Chapters.open(browser, item, chapter) end,
    }}}
    if downloaded then
        buttons[#buttons + 1] = {{
            text = "Rimuovi dal dispositivo",
            callback = function()
                close()
                Downloader.remove(path)
                notify("Rimosso.")
            end,
        }}
    end
    buttons[#buttons + 1] = {{
        text = chapter.read and "Segna come non letto" or "Segna come letto",
        callback = function()
            close()
            Chapters.mark(item, chapter, chapters, not chapter.read)
        end,
    }}

    dialog = ButtonDialog:new{
        title = chapter.name or "",
        title_align = "center",
        buttons = buttons,
    }
    UIManager:show(dialog)
end

--- Marks a chapter read/unread and sends it to the NAS.
function Chapters.mark(item, chapter, chapters, read)
    local total = #chapters
    local percent
    if read then
        percent = total > 0 and math.min(1, (chapter.index + 1) / total) or 1
    else
        percent = total > 0 and math.min(1, chapter.index / total) or 0
    end
    local record = {
        uid = item.uid,
        kind = "manga",
        percent = percent,
        chapter_uid = chapter.uid,
        page = read and (chapter.pages or 1) or 1,
        pages = chapter.pages,
        status = percent >= 0.99 and "finished" or "reading",
        device_id = Config.deviceId(),
        device_name = Config.deviceName(),
        updated_at = math.floor(os.time() * 1000),
    }
    Queue.put(record)
    chapter.read = read
    local sent, err = Sync.flush({only_if_online = true, silent = true})
    if sent and sent > 0 then
        notify(read and "Segnato come letto." or "Segnato come non letto.")
    else
        notify(err == "offline" and "Salvato: verrà inviato alla prossima sincronizzazione."
               or (read and "Segnato come letto." or "Segnato come non letto."))
    end
end

return Chapters
