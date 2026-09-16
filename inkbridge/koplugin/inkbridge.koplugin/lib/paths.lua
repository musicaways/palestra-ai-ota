--[[--
Filesystem helpers: download targets, the cover cache and safe file names.
]]

local DataStorage = require("datastorage")
local lfs = require("libs/libkoreader-lfs")

local Paths = {}

--- Strips what neither FAT32 (Kobo's user storage) nor ext4 will take.
function Paths.safeName(name, max_length)
    max_length = max_length or 100
    name = tostring(name or ""):gsub("[/\\:%*%?\"<>|%c]", "_")
    name = name:gsub("%s+", " "):gsub("^%s+", ""):gsub("%s+$", "")
    name = name:gsub("%.+$", "")
    if #name > max_length then
        name = name:sub(1, max_length):gsub("%s+$", "")
    end
    if name == "" then name = "senza_titolo" end
    return name
end

function Paths.ensureDir(dir)
    if lfs.attributes(dir, "mode") == "directory" then return dir end
    -- mkdir -p, one segment at a time.
    local current = dir:sub(1, 1) == "/" and "/" or ""
    for segment in dir:gmatch("[^/]+") do
        current = current == "/" and ("/" .. segment) or
                  (current == "" and segment or current .. "/" .. segment)
        if lfs.attributes(current, "mode") ~= "directory" then
            lfs.mkdir(current)
        end
    end
    return lfs.attributes(dir, "mode") == "directory" and dir or nil
end

function Paths.exists(path)
    return path ~= nil and lfs.attributes(path, "mode") ~= nil
end

function Paths.size(path)
    local attributes = lfs.attributes(path)
    return attributes and attributes.size or 0
end

function Paths.remove(path)
    if Paths.exists(path) then os.remove(path) end
end

--- Cache directory for cover thumbnails.
function Paths.coverCache()
    local dir = DataStorage:getDataDir() .. "/cache/inkbridge"
    return Paths.ensureDir(dir) or dir
end

--- A cover file name that cannot collide across sources.
function Paths.coverFile(uid)
    return Paths.coverCache() .. "/" .. (uid:gsub("[^%w]", "_")) .. ".jpg"
end

--- Where a book lands on the device.
function Paths.bookTarget(base_dir, item, format)
    local author = item.authors and item.authors[1] or nil
    local name = Paths.safeName(item.title)
    if author and author ~= "" then
        name = Paths.safeName(author) .. " - " .. name
    end
    return base_dir .. "/" .. name .. "." .. (format or "epub")
end

--- Where a manga chapter lands: one folder per series keeps the file browser sane.
function Paths.chapterTarget(base_dir, item, chapter)
    local series_dir = base_dir .. "/" .. Paths.safeName(item.title)
    Paths.ensureDir(series_dir)
    local index = string.format("%04d", tonumber(chapter.index or 0) or 0)
    return series_dir .. "/" .. index .. " - " .. Paths.safeName(chapter.name, 80) .. ".cbz"
end

function Paths.humanSize(bytes)
    bytes = tonumber(bytes) or 0
    if bytes >= 1024 * 1024 * 1024 then
        return string.format("%.1f GB", bytes / (1024 * 1024 * 1024))
    elseif bytes >= 1024 * 1024 then
        return string.format("%.1f MB", bytes / (1024 * 1024))
    elseif bytes >= 1024 then
        return string.format("%.0f kB", bytes / 1024)
    end
    return string.format("%d B", bytes)
end

return Paths
