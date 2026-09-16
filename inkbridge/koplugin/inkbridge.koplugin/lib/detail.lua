--[[--
The card of a single item, and the actions you can take on it.
]]

local ButtonDialog = require("ui/widget/buttondialog")
local Catalog = require("lib/catalog")
local DocMap = require("lib/docmap")
local Downloader = require("lib/downloader")
local InfoMessage = require("ui/widget/infomessage")
local Paths = require("lib/paths")
local TextViewer = require("ui/widget/textviewer")
local UIManager = require("ui/uimanager")

local Detail = {}

local function open_file(path)
    local ReaderUI = require("apps/reader/readerui")
    ReaderUI:showReader(path)
end

local function notify(text, timeout)
    UIManager:show(InfoMessage:new{text = text, timeout = timeout or 3})
end

--- The header shown above the buttons.
function Detail.summary(item)
    local lines = {item.title or ""}
    local authors = item.authors and #item.authors > 0 and table.concat(item.authors, ", ")
    if authors then lines[#lines + 1] = authors end
    if item.series then
        local index = item.series_index and string.format(" #%g", item.series_index) or ""
        lines[#lines + 1] = string.format("%s%s", item.series, index)
    end
    if item.kind == "manga" and item.chapter_count then
        local unread = item.unread_count and item.unread_count > 0
                       and string.format(" · %d da leggere", item.unread_count) or ""
        lines[#lines + 1] = string.format("%d capitoli%s", item.chapter_count, unread)
    end
    if item.progress and item.progress.percent and item.progress.percent > 0 then
        local device = item.progress.device_name
        lines[#lines + 1] = string.format("Letto al %d%%%s",
            math.floor(item.progress.percent * 100 + 0.5),
            device and device ~= "" and (" (" .. device .. ")") or "")
    end
    if item.tags and #item.tags > 0 then
        lines[#lines + 1] = table.concat(item.tags, ", ")
    end
    return table.concat(lines, "\n")
end

--- Opens the item: chapters for a manga, the action card for a book.
function Detail.show(browser, item)
    if item.kind == "manga" then
        require("lib/chapters").show(browser, item)
        return
    end
    Detail.showBook(browser, item)
end

function Detail.showBook(browser, item)
    local downloaded, path = DocMap.isDownloaded(item.uid)
    local dialog
    local function close() UIManager:close(dialog) end

    local buttons = {}
    if downloaded then
        buttons[#buttons + 1] = {{
            text = "Leggi",
            callback = function() close() open_file(path) end,
        }}
        buttons[#buttons + 1] = {{
            text = "Riscarica",
            callback = function()
                close()
                Downloader.book(browser.backend, item, {force = true}, function(new_path)
                    open_file(new_path)
                end)
            end,
        }, {
            text = "Rimuovi",
            callback = function()
                close()
                Downloader.remove(path)
                notify("Rimosso dal dispositivo.")
                browser.refreshCurrentPage()
            end,
        }}
    else
        buttons[#buttons + 1] = {{
            text = "Scarica e leggi",
            callback = function()
                close()
                Downloader.book(browser.backend, item, {}, function(new_path)
                    open_file(new_path)
                end)
            end,
        }}
        buttons[#buttons + 1] = {{
            text = "Scarica soltanto",
            callback = function()
                close()
                Downloader.book(browser.backend, item, {}, function()
                    notify("Scaricato.")
                    browser.refreshCurrentPage()
                end)
            end,
        }}
    end

    if item.formats and #item.formats > 1 then
        buttons[#buttons + 1] = {{
            text = "Scegli il formato…",
            callback = function()
                close()
                Detail.chooseFormat(browser, item)
            end,
        }}
    end

    if item.description and item.description ~= "" then
        buttons[#buttons + 1] = {{
            text = "Descrizione",
            callback = function()
                close()
                UIManager:show(TextViewer:new{
                    title = item.title,
                    text = item.description,
                })
            end,
        }}
    end

    dialog = ButtonDialog:new{
        title = Detail.summary(item),
        title_align = "left",
        buttons = buttons,
    }
    UIManager:show(dialog)
end

function Detail.chooseFormat(browser, item)
    local dialog
    local function close() UIManager:close(dialog) end
    local buttons = {}
    for _, format in ipairs(item.formats or {}) do
        buttons[#buttons + 1] = {{
            text = format:upper(),
            callback = function()
                close()
                Downloader.book(browser.backend, item, {format = format, force = true},
                                function(path) open_file(path) end)
            end,
        }}
    end
    dialog = ButtonDialog:new{
        title = "Formato da scaricare",
        title_align = "center",
        buttons = buttons,
    }
    UIManager:show(dialog)
end

--- Long-press menu, straight from the grid.
function Detail.showActions(browser, item)
    local downloaded, path = DocMap.isDownloaded(item.uid)
    local dialog
    local function close() UIManager:close(dialog) end

    local buttons = {}
    if item.kind == "manga" then
        buttons[#buttons + 1] = {{
            text = "Capitoli",
            callback = function() close() require("lib/chapters").show(browser, item) end,
        }}
    elseif downloaded then
        buttons[#buttons + 1] = {{
            text = "Leggi",
            callback = function() close() open_file(path) end,
        }}
    else
        buttons[#buttons + 1] = {{
            text = "Scarica",
            callback = function()
                close()
                Downloader.book(browser.backend, item, {}, function()
                    notify("Scaricato.")
                    browser.refreshCurrentPage()
                end)
            end,
        }}
    end

    buttons[#buttons + 1] = {{
        text = "Scheda",
        callback = function() close() Detail.show(browser, item) end,
    }}
    if downloaded then
        buttons[#buttons + 1] = {{
            text = string.format("Rimuovi (%s)", Paths.humanSize(Paths.size(path))),
            callback = function()
                close()
                Downloader.remove(path)
                browser.refreshCurrentPage()
            end,
        }}
    end
    buttons[#buttons + 1] = {{
        text = "Aggiorna la copertina",
        callback = function()
            close()
            Catalog.dropCover(item.uid)
            browser.refreshCurrentPage()
        end,
    }}

    dialog = ButtonDialog:new{
        title = item.title,
        title_align = "center",
        buttons = buttons,
    }
    UIManager:show(dialog)
end

return Detail
