local Cbz = require("lib/cbz")

test("crc32 matches the reference implementation", function()
    assertEquals(string.format("%08x", Cbz.crc32("hello")), "3610a686")
    assertEquals(string.format("%08x", Cbz.crc32("")), "00000000")
end)

test("crc32 can be fed in chunks", function()
    local whole = Cbz.crc32("InkBridge")
    local chunked = Cbz.crc32("Bridge", Cbz.crc32("Ink"))
    assertEquals(chunked, whole)
end)

test("page names keep the reading order and the format", function()
    assertEquals(Cbz.pageName(1, "image/jpeg"), "0001.jpg")
    assertEquals(Cbz.pageName(12, "image/png"), "0012.png")
    assertEquals(Cbz.pageName(3, nil, "http://nas/p/3.webp"), "0003.webp")
    assertEquals(Cbz.pageName(4, nil, nil), "0004.jpg")
end)

test("the archive it writes is a valid zip", function()
    local path = os.tmpname() .. ".cbz"
    local writer = assert(Cbz.open(path))
    assert(writer:add("0001.jpg", string.rep("A", 100)))
    assert(writer:add("0002.jpg", string.rep("B", 50)))
    assertEquals(writer:close(), path)

    local file = assert(io.open(path, "rb"))
    local content = file:read("*a")
    file:close()
    os.remove(path)

    assertEquals(content:sub(1, 4), "PK\3\4", "intestazione locale")
    assertTrue(content:find("PK\5\6", 1, true) ~= nil, "end of central directory")
    assertEquals(select(2, content:gsub("PK\1\2", "")), 2, "una voce di directory per file")
end)

test("abort leaves nothing behind", function()
    local path = os.tmpname() .. ".cbz"
    local writer = assert(Cbz.open(path))
    writer:add("0001.jpg", "x")
    writer:abort()
    assertNil(io.open(path, "rb"), "file rimosso")
end)
