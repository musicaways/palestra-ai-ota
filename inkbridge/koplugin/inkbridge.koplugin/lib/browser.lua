--[[--
The browser: home screen, cover grid, search and the per-item actions.
]]

local Backend = require("lib/backend")
local Catalog = require("lib/catalog")
local Config = require("lib/config")
local CoverGrid = require("lib/covergrid")
local Detail = require("lib/detail")
local DocMap = require("lib/docmap")
local InfoMessage = require("ui/widget/infomessage")
local InputDialog = require("ui/widget/inputdialog")
local Menu = require("ui/widget/menu")
local Paths = require("lib/paths")
local Sync = require("lib/sync")
local Trapper = require("ui/trapper")
local UIManager = require("ui/uimanager")
local Device = require("device")

local Screen = Device.screen

local Browser = {}

Browser.backend = nil
Browser.last_source = nil

local function notify(text, timeout)
    UIManager:show(InfoMessage:new{text = text, timeout = timeout or 3})
end

--- Runs `action` with the network up, turning the Wi-Fi on if allowed.
function Browser.withNetwork(action)
    local NetworkMgr = require("ui/network/manager")
    if NetworkMgr:isOnline() then
        action()
        return
    end
    if not Config.get("auto_wifi") then
        notify("Wi-Fi spento. Attivalo e riprova.")
        return
    end
    NetworkMgr:runWhenOnline(action)
end

--- Creates (or reuses) the configured back end.
function Browser.ensureBackend(force)
    if Browser.backend and not force then return Browser.backend end
    local backend, err = Backend.create()
    if not backend then
        notify("InkBridge non è configurato:\n" .. tostring(err), 5)
        return nil
    end
    Browser.backend = backend
    Catalog.setBackend(backend)
    Sync.setBackend(backend)
    return backend
end

-- -- home ------------------------------------------------------------------

function Browser.show()
    if not Config.isConfigured() then
        notify("Configura prima il server in Strumenti → InkBridge.", 5)
        return
    end
    if not Browser.ensureBackend() then return end
    Browser.withNetwork(function() Browser.showHome() end)
end

function Browser.showHome()
    local items = {}
    local sources, err = Catalog.sources()
    if not sources then
        notify("Server non raggiungibile:\n" .. tostring(err), 5)
        sources = {}
    end
    for _, source in ipairs(sources) do
        local label = source.kind == "manga" and "Manga e fumetti" or "Libri"
        items[#items + 1] = {
            text = string.format("%s  ·  %s", label, source.name),
            mandatory = source.available and "✓" or "✗",
            callback = function()
                if not source.available then
                    notify(string.format("%s non raggiungibile:\n%s",
                                         source.name, tostring(source.detail)), 5)
                    return
                end
                Browser.openSource(source.id, label)
            end,
        }
    end

    items[#items + 1] = {
        text = "Cerca in tutta la libreria",
        callback = function() Browser.askSearch(nil) end,
    }
    items[#items + 1] = {
        text = string.format("Sul dispositivo (%d)", Browser.downloadedCount()),
        callback = function() Browser.showDownloaded() end,
    }
    items[#items + 1] = {
        text = "Sincronizza adesso",
        callback = function() Browser.syncNow() end,
    }

    local menu
    menu = Menu:new{
        title = "InkBridge",
        subtitle = Config.get("mode") == "hub" and Config.get("hub_url")
                   or "modalità diretta",
        item_table = items,
        is_borderless = true,
        is_popout = false,
        covers_fullscreen = true,
        width = Screen:getWidth(),
        height = Screen:getHeight(),
        onMenuSelect = function(_, item)
            if item.callback then item.callback() end
            return true
        end,
        close_callback = function() UIManager:close(menu) end,
    }
    UIManager:show(menu)
    Browser.home_menu = menu
end

function Browser.downloadedCount()
    local count = 0
    for _ in pairs(DocMap.all()) do count = count + 1 end
    return count
end

-- -- catalogue -------------------------------------------------------------

function Browser.openSource(source_id, label, query)
    Browser.last_source = source_id
    Browser.state = {
        source = source_id,
        query = query,
        page = 1,
        label = label or "Catalogo",
    }
    Browser.loadPage(1)
end

--- Fetches one page (and its covers) and shows the grid.
function Browser.loadPage(page_number)
    local state = Browser.state
    if not state then return end
    local capacity = CoverGrid.capacity()
    state.page = page_number

    Browser.withNetwork(function()
        Trapper:wrap(function()
            Trapper:info("Carico il catalogo…")
            local page, err = Catalog.page{
                source = state.source,
                query = state.query,
                offset = (page_number - 1) * capacity,
                limit = capacity,
            }
            if not page then
                Trapper:clear()
                notify("Catalogo non disponibile:\n" .. tostring(err), 5)
                return
            end

            local wants_covers = Config.get("view_mode") ~= "list"
            local covers, downloaded = {}, {}
            for index, item in ipairs(page.items) do
                Backend.normalise(item)
                downloaded[item.uid] = DocMap.isDownloaded(item.uid) and true or nil
                if wants_covers then
                    -- Cached covers make this instant the second time around.
                    if Trapper:info(string.format("Copertine… %d/%d",
                                                  index, #page.items)) == false then
                        break
                    end
                    covers[item.uid] = Catalog.cover(item.uid)
                end
            end
            Trapper:clear()

            if Config.get("view_mode") == "list" then
                Browser.showList(page, downloaded)
            else
                Browser.showGrid(page, covers, downloaded)
            end
        end)
    end)
end

function Browser.showGrid(page, covers, downloaded)
    local state = Browser.state
    local capacity = CoverGrid.capacity()
    local page_count = math.max(1, math.ceil((page.total or 0) / capacity))

    if Browser.grid then
        UIManager:close(Browser.grid)
        Browser.grid = nil
    end

    local subtitle = state.query and string.format("ricerca: %s", state.query) or nil
    local grid = CoverGrid:new{
        title = state.label or "Catalogo",
        subtitle = subtitle,
        items = page.items,
        covers = covers,
        downloaded = downloaded,
        page = state.page,
        page_count = page_count,
        total = page.total or #page.items,
        on_select = function(item) Detail.show(Browser, item) end,
        on_hold = function(item) Detail.showActions(Browser, item) end,
        on_page_change = function(new_page) Browser.loadPage(new_page) end,
        on_search = function() Browser.askSearch(state.source) end,
        on_refresh = function()
            Catalog.invalidate()
            Browser.loadPage(state.page)
        end,
        on_menu = function() Browser.showViewMenu() end,
        close_callback = function() Browser.grid = nil end,
    }
    Browser.grid = grid
    UIManager:show(grid)
end

--- The same page as a plain list: faster, and kinder to a tired battery.
function Browser.showList(page, downloaded)
    local state = Browser.state
    local capacity = CoverGrid.capacity()
    local page_count = math.max(1, math.ceil((page.total or 0) / capacity))

    if Browser.grid then
        UIManager:close(Browser.grid)
        Browser.grid = nil
    end

    local items = {}
    for _, item in ipairs(page.items) do
        local mandatory
        if item.progress and item.progress.percent and item.progress.percent > 0 then
            mandatory = string.format("%d%%", math.floor(item.progress.percent * 100 + 0.5))
        elseif downloaded[item.uid] then
            mandatory = "↓"
        end
        local subtitle = Backend.authorLine(item)
        if item.kind == "manga" and item.chapter_count then
            subtitle = string.format("%d capitoli", item.chapter_count)
        end
        items[#items + 1] = {
            text = subtitle ~= "" and string.format("%s — %s", item.title, subtitle)
                   or item.title,
            mandatory = mandatory,
            item = item,
        }
    end

    local menu
    menu = Menu:new{
        title = state.label or "Catalogo",
        subtitle = string.format("Pagina %d di %d · %d titoli",
                                 state.page, page_count, page.total or #page.items),
        item_table = items,
        is_borderless = true,
        is_popout = false,
        covers_fullscreen = true,
        width = Screen:getWidth(),
        height = Screen:getHeight(),
        onMenuSelect = function(_, entry)
            Detail.show(Browser, entry.item)
            return true
        end,
        onMenuHold = function(_, entry)
            Detail.showActions(Browser, entry.item)
            return true
        end,
        close_callback = function() Browser.grid = nil end,
    }
    -- Page turns move through the catalogue, not just through the list.
    menu.onNextPage = function()
        if state.page < page_count then Browser.loadPage(state.page + 1) end
        return true
    end
    menu.onPrevPage = function()
        if state.page > 1 then Browser.loadPage(state.page - 1) end
        return true
    end
    Browser.grid = menu
    UIManager:show(menu)
end

function Browser.askSearch(source_id)
    local dialog
    dialog = InputDialog:new{
        title = "Cerca",
        input = Browser.state and Browser.state.query or "",
        input_hint = "titolo, autore, tag…",
        buttons = {{
            {
                text = "Annulla",
                id = "close",
                callback = function() UIManager:close(dialog) end,
            },
            {
                text = "Cerca",
                is_enter_default = true,
                callback = function()
                    local query = dialog:getInputText()
                    UIManager:close(dialog)
                    Catalog.invalidate()
                    Browser.openSource(source_id, query ~= "" and ("Ricerca: " .. query)
                                       or "Catalogo", query ~= "" and query or nil)
                end,
            },
        }},
    }
    UIManager:show(dialog)
    dialog:onShowKeyboard()
end

function Browser.showViewMenu()
    local ButtonDialog = require("ui/widget/buttondialog")
    local dialog
    local function close() UIManager:close(dialog) end
    dialog = ButtonDialog:new{
        title = "Vista",
        title_align = "center",
        buttons = {
            {{
                text = Config.get("view_mode") == "grid" and "Passa all'elenco"
                       or "Passa alla griglia",
                callback = function()
                    close()
                    Config.set("view_mode", Config.get("view_mode") == "grid" and "list" or "grid")
                    Browser.loadPage(Browser.state and Browser.state.page or 1)
                end,
            }},
            {{
                text = "Aggiorna il catalogo",
                callback = function()
                    close()
                    Catalog.invalidate()
                    Browser.loadPage(Browser.state and Browser.state.page or 1)
                end,
            }},
            {{
                text = "Sincronizza adesso",
                callback = function() close() Browser.syncNow() end,
            }},
            {{
                text = "Svuota la cache delle copertine",
                callback = function()
                    close()
                    Catalog.clearCovers()
                    notify("Copertine rimosse.")
                end,
            }},
        },
    }
    UIManager:show(dialog)
end

-- -- downloaded ------------------------------------------------------------

function Browser.showDownloaded()
    local entries = {}
    for path, entry in pairs(DocMap.all()) do
        if Paths.exists(path) then
            entries[#entries + 1] = {path = path, entry = entry}
        end
    end
    table.sort(entries, function(a, b)
        return (a.entry.downloaded_at or 0) > (b.entry.downloaded_at or 0)
    end)

    local items = {}
    for _, row in ipairs(entries) do
        local label = row.entry.title or row.path
        if row.entry.chapter_name then
            label = string.format("%s — %s", label, row.entry.chapter_name)
        end
        items[#items + 1] = {
            text = label,
            mandatory = Paths.humanSize(Paths.size(row.path)),
            callback = function()
                local ReaderUI = require("apps/reader/readerui")
                ReaderUI:showReader(row.path)
            end,
            hold_callback = function()
                local ConfirmBox = require("ui/widget/confirmbox")
                UIManager:show(ConfirmBox:new{
                    text = string.format("Rimuovere «%s» dal dispositivo?\nResta sul NAS.", label),
                    ok_text = "Rimuovi",
                    ok_callback = function()
                        require("lib/downloader").remove(row.path)
                        notify("Rimosso.")
                    end,
                })
            end,
        }
    end
    if #items == 0 then
        items[1] = {text = "Nessun file scaricato", enabled = false}
    end

    local menu
    menu = Menu:new{
        title = "Sul dispositivo",
        item_table = items,
        is_borderless = true,
        is_popout = false,
        covers_fullscreen = true,
        width = Screen:getWidth(),
        height = Screen:getHeight(),
        onMenuSelect = function(_, item)
            if item.callback then item.callback() end
            return true
        end,
        onMenuHold = function(_, item)
            if item.hold_callback then item.hold_callback() end
            return true
        end,
        close_callback = function() UIManager:close(menu) end,
    }
    UIManager:show(menu)
end

-- -- sync ------------------------------------------------------------------

function Browser.syncNow()
    if not Browser.ensureBackend() then return end
    Browser.withNetwork(function()
        Trapper:wrap(function()
            Trapper:info("Sincronizzo…")
            local result = Sync.syncNow{only_if_online = true}
            -- With the hub, also make it reconcile with Calibre and Suwayomi now.
            if Browser.backend.runUpstreamSync then
                Browser.backend:runUpstreamSync()
            end
            Trapper:clear()
            if result.error then
                notify("Sincronizzazione parziale:\n" .. tostring(result.error), 5)
            else
                notify(string.format("Sincronizzato.\nInviati: %d · Ricevuti: %d",
                                     result.sent, result.applied))
            end
            Catalog.invalidate()
            if Browser.grid and Browser.state then
                Browser.loadPage(Browser.state.page)
            end
        end)
    end)
end

function Browser.refreshCurrentPage()
    if Browser.state then
        Catalog.invalidate()
        Browser.loadPage(Browser.state.page)
    end
end

return Browser
