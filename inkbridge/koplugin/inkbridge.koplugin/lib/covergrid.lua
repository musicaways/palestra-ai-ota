--[[--
The cover grid: the screen you land on.

Three columns of covers with title, author and a reading bar under each one.
Tap opens the item, long-press opens its actions, the page-turn buttons of the
Libra move between pages — the same gestures the rest of KOReader uses, because
a reading device should not need a manual.
]]

local Blitbuffer = require("ffi/blitbuffer")
local CenterContainer = require("ui/widget/container/centercontainer")
local Device = require("device")
local Font = require("ui/font")
local FrameContainer = require("ui/widget/container/framecontainer")
local Geom = require("ui/geometry")
local GestureRange = require("ui/gesturerange")
local HorizontalGroup = require("ui/widget/horizontalgroup")
local ImageWidget = require("ui/widget/imagewidget")
local InputContainer = require("ui/widget/container/inputcontainer")
local ProgressWidget = require("ui/widget/progresswidget")
local Size = require("ui/size")
local TextBoxWidget = require("ui/widget/textboxwidget")
local TextWidget = require("ui/widget/textwidget")
local TitleBar = require("ui/widget/titlebar")
local UIManager = require("ui/uimanager")
local VerticalGroup = require("ui/widget/verticalgroup")
local VerticalSpan = require("ui/widget/verticalspan")
local logger = require("logger")

local Screen = Device.screen

local CoverGrid = InputContainer:extend{
    title = "InkBridge",
    subtitle = nil,
    items = nil,            -- array of items to show on this page
    page = 1,
    page_count = 1,
    total = 0,
    covers = nil,           -- uid -> local cover path (or nil)
    downloaded = nil,       -- uid -> true when the file is on the device
    on_select = nil,        -- function(item)
    on_hold = nil,          -- function(item)
    on_page_change = nil,   -- function(new_page)
    on_search = nil,
    on_menu = nil,
    close_callback = nil,
}

--- How many covers fit on this screen: three columns, as many rows as fit.
function CoverGrid.capacity()
    local width = Screen:getWidth()
    local height = Screen:getHeight()
    local columns = width > height and 4 or 3
    local cell_width = math.floor(width / columns)
    local cell_height = math.floor(cell_width * 1.62)  -- cover + two text lines
    local usable = height - Screen:scaleBySize(120)    -- title bar + footer
    local rows = math.max(1, math.floor(usable / cell_height))
    return columns * rows, columns, rows
end

function CoverGrid:init()
    self.items = self.items or {}
    self.covers = self.covers or {}
    self.downloaded = self.downloaded or {}
    self.width = Screen:getWidth()
    self.height = Screen:getHeight()
    self.dimen = Geom:new{x = 0, y = 0, w = self.width, h = self.height}
    self.cell_rects = {}

    if Device:isTouchDevice() then
        self.ges_events = {
            Tap = {GestureRange:new{ges = "tap", range = self.dimen}},
            Hold = {GestureRange:new{ges = "hold", range = self.dimen}},
            SwipeGrid = {GestureRange:new{ges = "swipe", range = self.dimen}},
        }
    end
    if Device:hasKeys() then
        self.key_events = {
            NextGridPage = {{Device.input.group.PgFwd}},
            PrevGridPage = {{Device.input.group.PgBack}},
            CloseGrid = {{Device.input.group.Back}},
        }
    end

    self:build()
end

function CoverGrid:build()
    local _, columns, rows = CoverGrid.capacity()
    self.columns, self.rows = columns, rows

    self.title_bar = self:buildTitleBar()

    local title_height = self.title_bar:getSize().h
    local footer = self:buildFooter()
    local footer_height = footer:getSize().h
    local body_height = self.height - title_height - footer_height
    local cell_width = math.floor(self.width / columns)
    local cell_height = math.floor(body_height / rows)

    local body = VerticalGroup:new{align = "left"}
    local index = 1
    for row = 1, rows do
        local line = HorizontalGroup:new{align = "top"}
        for column = 1, columns do
            local item = self.items[index]
            local x = (column - 1) * cell_width
            local y = title_height + (row - 1) * cell_height
            if item then
                self.cell_rects[#self.cell_rects + 1] = {
                    x = x, y = y, w = cell_width, h = cell_height, item = item,
                }
            end
            table.insert(line, self:buildCell(item, cell_width, cell_height))
            index = index + 1
        end
        table.insert(body, line)
    end

    self[1] = FrameContainer:new{
        width = self.width,
        height = self.height,
        background = Blitbuffer.COLOR_WHITE,
        bordersize = 0,
        padding = 0,
        margin = 0,
        VerticalGroup:new{
            align = "left",
            self.title_bar,
            body,
            footer,
        },
    }
end

--[[--
The bar on top: title, search, options, close.

Icon names have moved around between KOReader releases, so a bar that refuses
to build falls back to a plain one — a missing search icon must not take the
whole library down with it.
]]
function CoverGrid:buildTitleBar()
    local options = {
        width = self.width,
        title = self.title,
        subtitle = self.subtitle,
        subtitle_truncate_left = false,
        left_icon = "appbar.search",
        left_icon_tap_callback = function()
            if self.on_search then self.on_search() end
        end,
        right_icon = "appbar.menu",
        right_icon_tap_callback = function()
            if self.on_menu then self.on_menu() end
        end,
        close_callback = function() self:onClose() end,
        show_parent = self,
    }
    local ok, bar = pcall(function() return TitleBar:new(options) end)
    if ok and bar then return bar end
    logger.warn("InkBridge: barra del titolo ridotta (icone non disponibili)")
    options.left_icon = nil
    options.left_icon_tap_callback = nil
    options.right_icon = nil
    options.right_icon_tap_callback = nil
    return TitleBar:new(options)
end

function CoverGrid:buildFooter()
    local text
    if self.total > 0 then
        text = string.format("Pagina %d di %d  ·  %d titoli",
                             self.page, math.max(self.page_count, 1), self.total)
    else
        text = "Nessun risultato"
    end
    local label = TextWidget:new{
        text = text,
        face = Font:getFace("xx_smallinfofont"),
        fgcolor = Blitbuffer.COLOR_DARK_GRAY,
    }
    return FrameContainer:new{
        width = self.width,
        bordersize = 0,
        padding = Size.padding.small,
        margin = 0,
        background = Blitbuffer.COLOR_WHITE,
        CenterContainer:new{
            dimen = Geom:new{w = self.width, h = label:getSize().h + Size.padding.small},
            label,
        },
    }
end

--- One cell: cover, title, author, reading bar.
function CoverGrid:buildCell(item, width, height)
    local inner_width = width - 2 * Size.padding.default
    if not item then
        return FrameContainer:new{
            width = width, height = height, bordersize = 0, padding = 0, margin = 0,
            background = Blitbuffer.COLOR_WHITE,
            VerticalSpan:new{width = height},
        }
    end

    local text_height = Screen:scaleBySize(46)
    local bar_height = Screen:scaleBySize(6)
    local cover_height = height - text_height - bar_height - 3 * Size.padding.small
    local cover = self:buildCover(item, inner_width, cover_height)

    local title = TextBoxWidget:new{
        text = item.title or "",
        face = Font:getFace("cfont", 15),
        width = inner_width,
        alignment = "center",
        height = Screen:scaleBySize(30),
        height_adjust = true,
        height_overflow_show_ellipsis = true,
    }
    local caption = item.authors and item.authors[1] or ""
    if item.kind == "manga" and item.chapter_count then
        caption = string.format("%d capitoli", item.chapter_count)
    end
    local author = TextWidget:new{
        text = caption,
        face = Font:getFace("xx_smallinfofont"),
        fgcolor = Blitbuffer.COLOR_DARK_GRAY,
        max_width = inner_width,
    }

    local group = VerticalGroup:new{
        align = "center",
        cover,
        VerticalSpan:new{width = Size.padding.small},
        self:buildProgress(item, inner_width, bar_height),
        VerticalSpan:new{width = Size.padding.small},
        title,
        author,
    }

    return FrameContainer:new{
        width = width,
        height = height,
        bordersize = 0,
        padding = Size.padding.default,
        margin = 0,
        background = Blitbuffer.COLOR_WHITE,
        CenterContainer:new{
            dimen = Geom:new{w = inner_width, h = height - 2 * Size.padding.default},
            group,
        },
    }
end

--- The cover image, or a framed title when there is no image to show.
function CoverGrid:buildCover(item, width, height)
    local path = self.covers[item.uid]
    if path then
        local ok, image = pcall(function()
            return ImageWidget:new{
                file = path,
                width = width,
                height = height,
                scale_factor = 0,   -- fit, keep aspect ratio
            }
        end)
        if ok and image then
            local badge = self.downloaded[item.uid]
            if not badge then
                return CenterContainer:new{
                    dimen = Geom:new{w = width, h = height}, image,
                }
            end
            -- A downloaded item gets a thin frame, visible even on e-ink.
            return CenterContainer:new{
                dimen = Geom:new{w = width, h = height},
                FrameContainer:new{
                    bordersize = Size.border.thick,
                    padding = 0,
                    margin = 0,
                    color = Blitbuffer.COLOR_BLACK,
                    image,
                },
            }
        end
        logger.dbg("InkBridge: copertina non disegnabile", path)
    end

    local placeholder = TextBoxWidget:new{
        text = item.title or "",
        face = Font:getFace("cfont", 17),
        width = width - 2 * Size.padding.default,
        alignment = "center",
        height = height - 2 * Size.padding.default,
        height_adjust = false,
        height_overflow_show_ellipsis = true,
    }
    return FrameContainer:new{
        width = width,
        height = height,
        bordersize = Size.border.thin,
        padding = Size.padding.default,
        margin = 0,
        color = Blitbuffer.COLOR_GRAY,
        background = Blitbuffer.COLOR_WHITE,
        CenterContainer:new{
            dimen = Geom:new{w = width - 2 * Size.padding.default,
                             h = height - 2 * Size.padding.default},
            placeholder,
        },
    }
end

function CoverGrid:buildProgress(item, width, height)
    local percentage = 0
    if item.progress and item.progress.percent then
        percentage = math.min(1, math.max(0, item.progress.percent))
    end
    if percentage <= 0 then
        -- Keep the vertical rhythm even when nothing has been read.
        return VerticalSpan:new{width = height}
    end
    return ProgressWidget:new{
        width = width,
        height = height,
        percentage = percentage,
        margin_h = 0,
        margin_v = 0,
        bordersize = Size.border.thin,
        radius = 0,
        bgcolor = Blitbuffer.COLOR_WHITE,
        fillcolor = Blitbuffer.COLOR_BLACK,
    }
end

-- -- interaction -----------------------------------------------------------

function CoverGrid:cellAt(position)
    if not position then return nil end
    for _, rect in ipairs(self.cell_rects) do
        if position.x >= rect.x and position.x < rect.x + rect.w
           and position.y >= rect.y and position.y < rect.y + rect.h then
            return rect.item
        end
    end
    return nil
end

function CoverGrid:onTap(_, ges)
    local item = self:cellAt(ges and ges.pos)
    if item and self.on_select then
        self.on_select(item)
        return true
    end
    return false
end

function CoverGrid:onHold(_, ges)
    local item = self:cellAt(ges and ges.pos)
    if item and self.on_hold then
        self.on_hold(item)
        return true
    end
    return false
end

function CoverGrid:onSwipeGrid(_, ges)
    local direction = ges and ges.direction
    if direction == "west" then return self:onNextGridPage() end
    if direction == "east" then return self:onPrevGridPage() end
    if direction == "south" then
        -- Pull down to refresh, as in the file browser.
        if self.on_refresh then self.on_refresh() end
        return true
    end
    return false
end

function CoverGrid:onNextGridPage()
    if self.page >= self.page_count then return true end
    if self.on_page_change then self.on_page_change(self.page + 1) end
    return true
end

function CoverGrid:onPrevGridPage()
    if self.page <= 1 then return true end
    if self.on_page_change then self.on_page_change(self.page - 1) end
    return true
end

function CoverGrid:onCloseGrid()
    return self:onClose()
end

function CoverGrid:onClose()
    UIManager:close(self)
    if self.close_callback then self.close_callback() end
    return true
end

function CoverGrid:onShow()
    UIManager:setDirty(self, "full")
    return true
end

return CoverGrid
