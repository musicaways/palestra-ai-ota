--[[--
A minimal CBZ (ZIP, stored) writer for direct mode.

With the hub on the NAS this code never runs — the server packs the chapter.
Without it, Suwayomi hands out loose images and the device has to do the
packing itself, so this writes a stored (uncompressed) archive: manga pages are
already JPEG/WebP, deflating them would burn battery for nothing.
]]

local Cbz = {}

local has_bit, bit = pcall(require, "bit")

local band, bxor, rshift
if has_bit then
    band, bxor, rshift = bit.band, bit.bxor, bit.rshift
else
    -- Plain-Lua fallback so the module also runs under a stock interpreter.
    local function bitop(a, b, op)
        local result, bitval = 0, 1
        while a > 0 or b > 0 do
            local abit, bbit = a % 2, b % 2
            if op(abit, bbit) == 1 then result = result + bitval end
            a, b, bitval = (a - abit) / 2, (b - bbit) / 2, bitval * 2
        end
        return result
    end
    band = function(a, b) return bitop(a, b, function(x, y)
        return (x == 1 and y == 1) and 1 or 0 end) end
    bxor = function(a, b) return bitop(a, b, function(x, y)
        return (x ~= y) and 1 or 0 end) end
    rshift = function(a, n) return math.floor(a / 2 ^ n) end
end

-- CRC-32 (IEEE 802.3), table built once on first use.
local crc_table
local function crc32_table()
    if crc_table then return crc_table end
    crc_table = {}
    for i = 0, 255 do
        local crc = i
        for _ = 1, 8 do
            if band(crc, 1) == 1 then
                crc = bxor(rshift(crc, 1), 0xEDB88320)
            else
                crc = rshift(crc, 1)
            end
        end
        crc_table[i] = crc
    end
    return crc_table
end

--- Updates a running CRC-32 with `chunk`. Start with `crc = nil`.
function Cbz.crc32(chunk, crc)
    local table_ = crc32_table()
    crc = bxor(crc or 0, 0xFFFFFFFF)
    for i = 1, #chunk do
        crc = bxor(table_[band(bxor(crc, chunk:byte(i)), 0xFF)], rshift(crc, 8))
    end
    return bxor(crc, 0xFFFFFFFF)
end

local function le16(value)
    value = value % 0x10000
    return string.char(value % 256, math.floor(value / 256) % 256)
end

local function le32(value)
    value = value % 0x100000000
    return string.char(value % 256,
                       math.floor(value / 256) % 256,
                       math.floor(value / 65536) % 256,
                       math.floor(value / 16777216) % 256)
end

local function dos_time(time)
    local date = os.date("*t", time or os.time())
    local dos_date = (math.max(date.year - 1980, 0) * 512) + (date.month * 32) + date.day
    local dos_clock = (date.hour * 2048) + (date.min * 32) + math.floor(date.sec / 2)
    return le16(dos_clock) .. le16(dos_date)
end

--[[--
Opens a CBZ for writing.

    local writer = Cbz.open("/mnt/onboard/x.cbz")
    writer:add("0001.jpg", data)
    writer:close()
]]
function Cbz.open(path)
    local file, err = io.open(path, "wb")
    if not file then return nil, err end

    local writer = {
        path = path,
        file = file,
        offset = 0,
        entries = {},
        stamp = dos_time(),
    }

    function writer:write(data)
        local ok, write_error = self.file:write(data)
        if not ok then return nil, write_error end
        self.offset = self.offset + #data
        return true
    end

    --- Appends one file. `data` is the whole entry: pages arrive as one image.
    function writer:add(name, data)
        local crc = Cbz.crc32(data)
        local entry = {name = name, crc = crc, size = #data, offset = self.offset}
        local header = "PK\3\4"
            .. le16(20) .. le16(0) .. le16(0)     -- version, flags, method (stored)
            .. self.stamp
            .. le32(crc) .. le32(#data) .. le32(#data)
            .. le16(#name) .. le16(0)
        local ok, write_error = self:write(header .. name .. data)
        if not ok then return nil, write_error end
        self.entries[#self.entries + 1] = entry
        return true
    end

    function writer:close()
        local directory_offset = self.offset
        for _, entry in ipairs(self.entries) do
            local record = "PK\1\2"
                .. le16(20) .. le16(20) .. le16(0) .. le16(0)
                .. self.stamp
                .. le32(entry.crc) .. le32(entry.size) .. le32(entry.size)
                .. le16(#entry.name) .. le16(0) .. le16(0)
                .. le16(0) .. le16(0) .. le32(0)
                .. le32(entry.offset)
            local ok, write_error = self:write(record .. entry.name)
            if not ok then self.file:close() return nil, write_error end
        end
        local directory_size = self.offset - directory_offset
        local eocd = "PK\5\6" .. le16(0) .. le16(0)
            .. le16(#self.entries) .. le16(#self.entries)
            .. le32(directory_size) .. le32(directory_offset) .. le16(0)
        local ok, write_error = self:write(eocd)
        self.file:close()
        if not ok then return nil, write_error end
        return self.path
    end

    function writer:abort()
        self.file:close()
        os.remove(self.path)
    end

    return writer
end

--- `0001.jpg` from a page index and its media type.
function Cbz.pageName(index, content_type, url)
    local extension
    local ct = (content_type or ""):lower()
    if ct:find("png") then extension = ".png"
    elseif ct:find("webp") then extension = ".webp"
    elseif ct:find("gif") then extension = ".gif"
    elseif ct:find("jpeg") or ct:find("jpg") then extension = ".jpg" end
    if not extension and url then
        local tail = url:match("%.([%a%d]+)$")
        if tail and #tail <= 4 then extension = "." .. tail:lower() end
    end
    return string.format("%04d%s", index, extension or ".jpg")
end

return Cbz
