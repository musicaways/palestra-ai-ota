local Config = require("lib/config")
local DocMap = require("lib/docmap")
local Queue = require("lib/queue")
local Sync = require("lib/sync")

local BOOK = {uid = "calibre:Lib:12", kind = "book", title = "Il nome della rosa"}
local MANGA = {uid = "suwayomi:manga:7", kind = "manga", title = "Vinland Saga",
               chapter_count = 4}
local CHAPTER = {uid = "suwayomi:chapter:101", name = "Cap. 2", index = 1}

--- A stand-in for ReaderUI on a paged document (PDF, CBZ).
local function paged_ui(page, pages, file)
    return {
        document = {
            file = file or "/books/x.cbz",
            info = {has_pages = true},
            getPageCount = function() return pages end,
            getCurrentPage = function() return page end,
        },
        paging = {
            getLastProgress = function() return page end,
            getLastPercent = function() return page / pages end,
        },
        doc_settings = require("docsettings"):open(file or "/books/x.cbz"),
        handleEvent = function(self, event)
            table.insert(Stubs.events, event)
            return true
        end,
    }
end

--- …and on a reflowable one (EPUB).
local function rolling_ui(percent, xpointer, file)
    return {
        document = {
            file = file or "/books/x.epub",
            info = {has_pages = false},
            getPageCount = function() return 300 end,
            getCurrentPage = function() return math.floor(percent * 300) end,
        },
        rolling = {
            getLastProgress = function() return xpointer end,
            getLastPercent = function() return percent end,
        },
        doc_settings = require("docsettings"):open(file or "/books/x.epub"),
        handleEvent = function(self, event)
            table.insert(Stubs.events, event)
            return true
        end,
    }
end

--- A back end that records what it was asked to do.
local function fake_backend(options)
    options = options or {}
    return {
        supports_delta = options.supports_delta ~= false,
        pushed = {},
        pushProgress = function(self, records)
            for _, record in ipairs(records) do table.insert(self.pushed, record) end
            if options.push_result then return options.push_result end
            return {outcomes = {}, cursor = 7}
        end,
        pullProgress = function(_, cursor)
            if cursor >= (options.cursor or 0) then return {records = {}, cursor = cursor} end
            return {records = options.records or {}, cursor = options.cursor or 0}
        end,
        getProgress = function() return options.remote or false end,
    }
end

test("a book's position becomes a record", function()
    local record = Sync.buildRecord(rolling_ui(0.42, "/body/DocFragment[7]"), BOOK)
    assertNear(record.percent, 0.42)
    assertEquals(record.locator, "/body/DocFragment[7]")
    assertEquals(record.kind, "book")
    assertEquals(record.status, "reading")
    assertTrue(record.updated_at > 0, "timestamp valorizzato")
end)

test("a paged book reports its page numbers", function()
    local record = Sync.buildRecord(paged_ui(50, 200, "/books/x.pdf"), BOOK)
    assertEquals(record.page, 50)
    assertEquals(record.pages, 200)
    assertNear(record.percent, 0.25)
end)

test("a manga chapter is scaled to the whole series", function()
    local entry = {uid = MANGA.uid, kind = "manga", chapter_uid = CHAPTER.uid,
                   chapter_index = 1, chapter_count = 4}
    -- Page 10 of 20 in chapter 2 of 4 → (1 + 0.5) / 4.
    local record = Sync.buildRecord(paged_ui(10, 20), entry)
    assertNear(record.percent, 0.375)
    assertEquals(record.chapter_uid, CHAPTER.uid)
    assertEquals(record.page, 10)
    assertEquals(record.pages, 20)
end)

test("the last page of the last chapter finishes the series", function()
    local entry = {uid = MANGA.uid, kind = "manga", chapter_uid = CHAPTER.uid,
                   chapter_index = 3, chapter_count = 4}
    local record = Sync.buildRecord(paged_ui(20, 20), entry)
    assertNear(record.percent, 1.0)
    assertEquals(record.status, "finished")
end)

test("recording queues even with no network", function()
    Stubs.online = false
    Sync.setBackend(fake_backend())
    Sync.recordProgress(rolling_ui(0.3, "/body/1"), BOOK)
    assertEquals(Queue.count(), 1)
    assertEquals(select(1, Sync.flush({only_if_online = true})), 0)
    assertEquals(Queue.count(), 1, "resta in coda finché non c'è rete")
end)

test("the queue empties once the network is back", function()
    Stubs.online = false
    local backend = fake_backend()
    Sync.setBackend(backend)
    Sync.recordProgress(rolling_ui(0.3, "/body/1"), BOOK)
    Stubs.online = true
    local sent = Sync.flush({only_if_online = true})
    assertEquals(sent, 1)
    assertEquals(Queue.count(), 0)
    assertEquals(backend.pushed[1].uid, BOOK.uid)
    assertEquals(Queue.cursor(), 7, "il cursore avanza con la risposta")
end)

test("a rejected push is applied back to the device", function()
    Stubs.addFile("/books/rosa.epub")
    DocMap.register("/books/rosa.epub", BOOK)
    local authoritative = {uid = BOOK.uid, kind = "book", percent = 0.8,
                           updated_at = 9999, device_name = "Tablet"}
    Sync.setBackend(fake_backend{push_result = {
        outcomes = {{uid = BOOK.uid, result = "stale", record = authoritative}},
        cursor = 3,
    }})
    Sync.recordProgress(rolling_ui(0.3, "/body/1"), BOOK)
    Sync.flush({only_if_online = true})
    assertNear(Stubs.doc_settings["/books/rosa.epub"].percent_finished, 0.8)
end)

test("delta pull writes the sidecar of a closed book", function()
    Stubs.addFile("/books/rosa.epub")
    DocMap.register("/books/rosa.epub", BOOK)
    Sync.setBackend(fake_backend{
        cursor = 12,
        records = {{uid = BOOK.uid, kind = "book", percent = 0.66, updated_at = 5000,
                    device_id = "tablet", locator = "/body/DocFragment[9]"}},
    })
    local applied = Sync.pull({only_if_online = true})
    assertEquals(applied, 1)
    local sidecar = Stubs.doc_settings["/books/rosa.epub"]
    assertNear(sidecar.percent_finished, 0.66)
    assertEquals(sidecar.last_xpointer, "/body/DocFragment[9]")
    assertEquals(Queue.cursor(), 12)
end)

test("our own records come back without being applied twice", function()
    Stubs.addFile("/books/rosa.epub")
    DocMap.register("/books/rosa.epub", BOOK)
    Sync.setBackend(fake_backend{
        cursor = 5,
        records = {{uid = BOOK.uid, kind = "book", percent = 0.9, updated_at = 5000,
                    device_id = Config.deviceId()}},
    })
    assertEquals(Sync.pull({only_if_online = true}), 0)
    assertNil(Stubs.doc_settings["/books/rosa.epub"].percent_finished, "sidecar intatto")
end)

test("progress for a book we do not have is kept until it is downloaded", function()
    Sync.setBackend(fake_backend{
        cursor = 2,
        records = {{uid = "calibre:Lib:99", kind = "book", percent = 0.5,
                    updated_at = 5000, device_id = "tablet"}},
    })
    Sync.pull({only_if_online = true})
    assertNear(DocMap.peekRemote("calibre:Lib:99").percent, 0.5)
end)

test("a small difference is not worth a question", function()
    Config.set("conflict_tolerance", 0.05)
    local ui = rolling_ui(0.50, "/body/1", "/books/rosa.epub")
    local asked = Sync.resolveOnOpen(ui, BOOK,
        {uid = BOOK.uid, percent = 0.52, updated_at = 9000, device_name = "Tablet"})
    assertTrue(not asked, "nessuna domanda")
    assertEquals(#Stubs.shown, 0)
end)

test("a real difference asks before moving the reader", function()
    Config.set("conflict_tolerance", 0.01)
    local ui = rolling_ui(0.20, "/body/1", "/books/rosa.epub")
    Sync.resolveOnOpen(ui, BOOK, {uid = BOOK.uid, percent = 0.80, updated_at = 9000,
                                  locator = "/body/DocFragment[20]", device_name = "Tablet"})
    assertEquals(#Stubs.shown, 1)
    local box = Stubs.shown[1]
    assertEquals(box.widget_type, "confirmbox")
    assertTrue(box.text:find("80%%") ~= nil, "mostra la percentuale remota")
    -- Nothing moved until the reader agrees.
    assertEquals(#Stubs.events, 0)
    box.ok_callback()
    assertEquals(Stubs.events[1].name, "GotoXPointer")
end)

test("a position we already knew about does not ask again", function()
    Config.set("conflict_tolerance", 0.01)
    local ui = rolling_ui(0.20, "/body/1", "/books/rosa.epub")
    ui.doc_settings:saveSetting("inkbridge_pushed_at", 9000)
    local asked = Sync.resolveOnOpen(ui, BOOK,
        {uid = BOOK.uid, percent = 0.80, updated_at = 9000, device_name = "Tablet"})
    assertTrue(not asked, "già vista")
end)

test("jumping into a paged document uses pages, not xpointers", function()
    local ui = paged_ui(10, 200, "/books/x.pdf")
    Sync.jumpTo(ui, {percent = 0.5, updated_at = 1}, BOOK)
    assertEquals(Stubs.events[1].name, "GotoPage")
    assertEquals(Stubs.events[1].args[1], 100)
end)

test("a manga jump stays inside the chapter on the device", function()
    local entry = {uid = MANGA.uid, kind = "manga", chapter_uid = CHAPTER.uid,
                   chapter_index = 1, chapter_count = 4}
    local ui = paged_ui(1, 20, "/books/vs/0001.cbz")
    Sync.jumpTo(ui, {percent = 0.375, chapter_uid = CHAPTER.uid, page = 10, pages = 20}, entry)
    assertEquals(Stubs.events[1].name, "GotoPage")
    assertEquals(Stubs.events[1].args[1], 10, "pagina del capitolo, non della serie")
end)

test("direct mode skips the delta pull instead of failing", function()
    Sync.setBackend(fake_backend{supports_delta = false})
    assertEquals(Sync.pull({only_if_online = true}), 0)
end)

test("syncNow reports what it did", function()
    Stubs.online = true
    Sync.setBackend(fake_backend())
    Sync.recordProgress(rolling_ui(0.3, "/body/1"), BOOK, {flush = false})
    local result = Sync.syncNow{only_if_online = true}
    assertEquals(result.sent, 1)
    assertEquals(result.queued, 0)
end)
