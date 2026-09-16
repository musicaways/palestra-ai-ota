local DocMap = require("lib/docmap")

local ITEM = {uid = "calibre:Lib:12", kind = "book", title = "Il nome della rosa",
              source = "calibre"}
local MANGA = {uid = "suwayomi:manga:7", kind = "manga", title = "Vinland Saga",
               chapter_count = 4}
local CHAPTER = {uid = "suwayomi:chapter:101", name = "Cap. 2", index = 1}

test("a downloaded book can be found again by path and by uid", function()
    Stubs.addFile("/books/rosa.epub")
    DocMap.register("/books/rosa.epub", ITEM)
    local entry = DocMap.forPath("/books/rosa.epub")
    assertEquals(entry.uid, "calibre:Lib:12")
    assertEquals(DocMap.pathFor("calibre:Lib:12"), "/books/rosa.epub")
    assertTrue(DocMap.isDownloaded("calibre:Lib:12"), "il file risulta presente")
end)

test("a chapter is filed under its own uid, with the series around it", function()
    Stubs.addFile("/books/vs/0001.cbz")
    DocMap.register("/books/vs/0001.cbz", MANGA, CHAPTER)
    local entry = DocMap.forPath("/books/vs/0001.cbz")
    assertEquals(entry.chapter_uid, "suwayomi:chapter:101")
    assertEquals(entry.chapter_index, 1)
    assertEquals(entry.chapter_count, 4)
    assertEquals(DocMap.pathFor("suwayomi:chapter:101"), "/books/vs/0001.cbz")
end)

test("a file deleted behind our back stops counting as downloaded", function()
    Stubs.addFile("/books/rosa.epub")
    DocMap.register("/books/rosa.epub", ITEM)
    Stubs.files["/books/rosa.epub"] = nil
    assertTrue(not DocMap.isDownloaded("calibre:Lib:12"), "non più scaricato")
    assertNil(DocMap.pathFor("calibre:Lib:12"), "mappa ripulita")
end)

test("the sidecar keeps the link when the file is renamed", function()
    Stubs.addFile("/books/rosa.epub")
    DocMap.register("/books/rosa.epub", ITEM)
    -- Simulate a rename: the sidecar moves with the file, our index does not.
    Stubs.doc_settings["/books/eco.epub"] = Stubs.doc_settings["/books/rosa.epub"]
    Stubs.settings["/settings/inkbridge_docs.lua"].by_path["/books/rosa.epub"] = nil
    Stubs.addFile("/books/eco.epub")
    local entry = DocMap.forPath("/books/eco.epub")
    assertEquals(entry.uid, "calibre:Lib:12")
end)

test("progress for a file we do not have is kept for later", function()
    DocMap.stashRemote("calibre:Lib:99", {percent = 0.4})
    assertEquals(DocMap.peekRemote("calibre:Lib:99").percent, 0.4)
    assertEquals(DocMap.takeRemote("calibre:Lib:99").percent, 0.4)
    assertNil(DocMap.peekRemote("calibre:Lib:99"), "consumato una volta sola")
end)

test("forget removes both directions of the mapping", function()
    Stubs.addFile("/books/rosa.epub")
    DocMap.register("/books/rosa.epub", ITEM)
    DocMap.forget("/books/rosa.epub")
    assertNil(DocMap.forPath("/books/rosa.epub"), "per percorso")
    assertNil(DocMap.pathFor("calibre:Lib:12"), "per uid")
end)

test("the document hash is the one KOSync uses", function()
    assertEquals(DocMap.documentHash("/books/rosa.epub"), "md5-/books/rosa.epub")
end)
