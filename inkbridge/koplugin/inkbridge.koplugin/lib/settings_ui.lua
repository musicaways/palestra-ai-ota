--[[--
The InkBridge entry in KOReader's menu: everything configurable, in one place.
]]

local Config = require("lib/config")
local InfoMessage = require("ui/widget/infomessage")
local MultiInputDialog = require("ui/widget/multiinputdialog")
local Queue = require("lib/queue")
local SpinWidget = require("ui/widget/spinwidget")
local UIManager = require("ui/uimanager")

local SettingsUI = {}

local function notify(text, timeout)
    UIManager:show(InfoMessage:new{text = text, timeout = timeout or 3})
end

--- A small helper: a modal with N text fields, saved into the settings.
local function edit_fields(title, fields, on_saved)
    local dialog
    local rows = {}
    for _, field in ipairs(fields) do
        rows[#rows + 1] = {
            text = Config.get(field.key) or "",
            hint = field.hint,
            input_type = "string",
            text_type = field.secret and "password" or nil,
        }
    end
    dialog = MultiInputDialog:new{
        title = title,
        fields = rows,
        buttons = {{
            {
                text = "Annulla",
                id = "close",
                callback = function() UIManager:close(dialog) end,
            },
            {
                text = "Salva",
                is_enter_default = true,
                callback = function()
                    local values = dialog:getFields()
                    for index, field in ipairs(fields) do
                        local value = values[index] or ""
                        if field.trim_slash then value = value:gsub("/+$", "") end
                        Config.set(field.key, value)
                    end
                    UIManager:close(dialog)
                    if on_saved then on_saved() end
                end,
            },
        }},
    }
    UIManager:show(dialog)
    dialog:onShowKeyboard()
end

--- Builds the whole sub-menu. `plugin` is the plugin instance.
function SettingsUI.menu(plugin)
    return {
        {
            text = "Apri la libreria",
            keep_menu_open = false,
            callback = function() plugin:openLibrary() end,
        },
        {
            text = "Sincronizza adesso",
            keep_menu_open = true,
            callback = function() plugin:syncNow() end,
        },
        {
            text_func = function()
                local queued = Queue.count()
                if queued == 0 then return "Stato: tutto sincronizzato" end
                return string.format("Stato: %d da inviare", queued)
            end,
            keep_menu_open = true,
            callback = function() plugin:showStatus() end,
        },
        {
            text = "Server",
            sub_item_table = SettingsUI.serverMenu(plugin),
            separator = true,
        },
        {
            text = "Sincronizzazione",
            sub_item_table = SettingsUI.syncMenu(plugin),
        },
        {
            text = "Aspetto e download",
            sub_item_table = SettingsUI.viewMenu(plugin),
        },
    }
end

function SettingsUI.serverMenu(plugin)
    return {
        {
            text_func = function()
                return Config.get("mode") == "hub"
                       and "Modalità: hub InkBridge sul NAS"
                       or "Modalità: collegamento diretto"
            end,
            help_text = "L'hub unifica Calibre e Suwayomi e gestisce il merge dei "
                        .. "progressi. Il collegamento diretto non richiede di "
                        .. "installare nulla sul NAS.",
            keep_menu_open = true,
            callback = function()
                Config.set("mode", Config.get("mode") == "hub" and "direct" or "hub")
                plugin:resetBackend()
                notify(Config.get("mode") == "hub" and "Modalità hub."
                       or "Modalità diretta.")
            end,
        },
        {
            text_func = function()
                local url = Config.get("hub_url")
                return url ~= "" and ("Hub: " .. url) or "Hub: da configurare"
            end,
            enabled_func = function() return Config.get("mode") == "hub" end,
            keep_menu_open = true,
            callback = function()
                edit_fields("Hub InkBridge", {
                    {key = "hub_url", hint = "http://192.168.1.10:8577", trim_slash = true},
                    {key = "hub_token", hint = "token condiviso", secret = true},
                }, function()
                    plugin:resetBackend()
                    plugin:testConnection()
                end)
            end,
        },
        {
            text = "Calibre (modalità diretta)",
            enabled_func = function() return Config.get("mode") ~= "hub" end,
            keep_menu_open = true,
            callback = function()
                edit_fields("calibre-server", {
                    {key = "calibre_url", hint = "http://192.168.1.10:8080", trim_slash = true},
                    {key = "calibre_username", hint = "utente (facoltativo)"},
                    {key = "calibre_password", hint = "password", secret = true},
                    {key = "calibre_library", hint = "libreria (vuoto = predefinita)"},
                }, function() plugin:resetBackend() end)
            end,
        },
        {
            text = "Suwayomi (modalità diretta)",
            enabled_func = function() return Config.get("mode") ~= "hub" end,
            keep_menu_open = true,
            callback = function()
                edit_fields("Suwayomi", {
                    {key = "suwayomi_url", hint = "http://192.168.1.10:4567", trim_slash = true},
                    {key = "suwayomi_username", hint = "utente (facoltativo)"},
                    {key = "suwayomi_password", hint = "password", secret = true},
                }, function() plugin:resetBackend() end)
            end,
        },
        {
            text = "Prova la connessione",
            keep_menu_open = true,
            callback = function() plugin:testConnection() end,
        },
    }
end

function SettingsUI.syncMenu(plugin)
    return {
        {
            text = "Sincronizzazione attiva",
            checked_func = function() return Config.get("sync_enabled") end,
            callback = function() Config.toggle("sync_enabled") end,
        },
        {
            text = "Allinea all'apertura di un libro",
            checked_func = function() return Config.get("sync_on_open") end,
            callback = function() Config.toggle("sync_on_open") end,
        },
        {
            text = "Invia alla chiusura e in sospensione",
            checked_func = function() return Config.get("sync_on_close") end,
            callback = function() Config.toggle("sync_on_close") end,
        },
        {
            text_func = function()
                local pages = Config.get("sync_every_pages")
                if pages == 0 then return "Invio periodico: disattivato" end
                return string.format("Invio periodico: ogni %d pagine", pages)
            end,
            keep_menu_open = true,
            callback = function(touchmenu_instance)
                UIManager:show(SpinWidget:new{
                    title_text = "Ogni quante pagine",
                    info_text = "0 disattiva l'invio periodico.",
                    value = Config.get("sync_every_pages"),
                    value_min = 0,
                    value_max = 200,
                    value_step = 5,
                    value_hold_step = 20,
                    callback = function(spin)
                        Config.set("sync_every_pages", spin.value)
                        if touchmenu_instance then touchmenu_instance:updateItems() end
                    end,
                })
            end,
        },
        {
            text_func = function()
                return string.format("Soglia di conflitto: %d%%",
                                     math.floor((Config.get("conflict_tolerance") or 0.01) * 100))
            end,
            help_text = "Sotto questa differenza la posizione più recente viene "
                        .. "applicata senza chiedere nulla.",
            keep_menu_open = true,
            callback = function(touchmenu_instance)
                UIManager:show(SpinWidget:new{
                    title_text = "Soglia di conflitto (%)",
                    value = math.floor((Config.get("conflict_tolerance") or 0.01) * 100),
                    value_min = 0,
                    value_max = 25,
                    value_step = 1,
                    callback = function(spin)
                        Config.set("conflict_tolerance", spin.value / 100)
                        if touchmenu_instance then touchmenu_instance:updateItems() end
                    end,
                })
            end,
        },
        {
            text = "Accendi il Wi-Fi quando serve",
            checked_func = function() return Config.get("auto_wifi") end,
            callback = function() Config.toggle("auto_wifi") end,
        },
        {
            text = "Svuota la coda di invio",
            keep_menu_open = true,
            callback = function()
                local ConfirmBox = require("ui/widget/confirmbox")
                UIManager:show(ConfirmBox:new{
                    text = string.format(
                        "Scartare %d progressi non ancora inviati?", Queue.count()),
                    ok_text = "Scarta",
                    ok_callback = function()
                        Queue.clear()
                        notify("Coda svuotata.")
                    end,
                })
            end,
        },
    }
end

function SettingsUI.viewMenu(plugin)
    return {
        {
            text_func = function()
                return Config.get("view_mode") == "grid"
                       and "Vista: griglia di copertine" or "Vista: elenco"
            end,
            keep_menu_open = true,
            callback = function(touchmenu_instance)
                Config.set("view_mode", Config.get("view_mode") == "grid" and "list" or "grid")
                if touchmenu_instance then touchmenu_instance:updateItems() end
            end,
        },
        {
            text_func = function()
                return "Cartella: " .. Config.downloadDir()
            end,
            keep_menu_open = true,
            callback = function(touchmenu_instance)
                local PathChooser = require("ui/widget/pathchooser")
                UIManager:show(PathChooser:new{
                    select_directory = true,
                    select_file = false,
                    path = Config.downloadDir(),
                    onConfirm = function(path)
                        Config.setDownloadDir(path)
                        if touchmenu_instance then touchmenu_instance:updateItems() end
                    end,
                })
            end,
        },
        {
            text = "Svuota la cache delle copertine",
            keep_menu_open = true,
            callback = function()
                require("lib/catalog").clearCovers()
                notify("Copertine rimosse.")
            end,
        },
    }
end

return SettingsUI
