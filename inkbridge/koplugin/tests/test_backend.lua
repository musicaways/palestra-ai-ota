--[[-- Back ends, with the HTTP layer replaced by a recorder. ]]

local real_http = require("lib/http")

--- Installs a fake lib/http and returns the recorder.
local function fake_http(handlers)
    local calls = {requests = {}, downloads = {}}
    local fake = {
        escape = real_http.escape,
        url = real_http.url,
        basicAuth = real_http.basicAuth,
        request = function(options)
            table.insert(calls.requests, options)
            local handler = handlers.request
            if handler then return handler(options) end
            return "", 200, {}
        end,
        getJson = function(target, headers)
            table.insert(calls.requests, {url = target, method = "GET", headers = headers})
            local handler = handlers.getJson
            if handler then return handler(target) end
            return nil, "nessun handler"
        end,
        postJson = function(target, payload, headers, method)
            table.insert(calls.requests,
                         {url = target, method = method or "POST", body = payload,
                          headers = headers})
            local handler = handlers.postJson
            if handler then return handler(target, payload) end
            return {}
        end,
        download = function(target, path, options)
            table.insert(calls.downloads, {url = target, path = path, options = options})
            local handler = handlers.download
            if handler then return handler(target, path, options) end
            return path, 1234
        end,
    }
    package.loaded["lib/http"] = fake
    calls.fake = fake
    return calls
end

local function restore_http()
    package.loaded["lib/http"] = real_http
end

-- -- hub -------------------------------------------------------------------

test("the hub back end builds the catalogue URL and carries the token", function()
    local calls = fake_http{getJson = function() return {items = {}, total = 0} end}
    local Hub = require("lib/backend_hub")
    local backend = Hub.new{url = "http://nas:8577/", token = "segreto"}
    backend:listItems{source = "calibre", query = "eco", offset = 24, limit = 24}
    restore_http()

    local request = calls.requests[1]
    assertTrue(request.url:find("/v1/library/items?", 1, true) ~= nil, "endpoint")
    assertTrue(request.url:find("limit=24", 1, true) ~= nil, "limite")
    assertTrue(request.url:find("offset=24", 1, true) ~= nil, "offset")
    assertTrue(request.url:find("query=eco", 1, true) ~= nil, "ricerca")
    assertEquals(request.headers["Authorization"], "Bearer segreto")
end)

test("covers carry the token in the query string, where a download can put it", function()
    local calls = fake_http{}
    local Hub = require("lib/backend_hub")
    local backend = Hub.new{url = "http://nas:8577", token = "segreto"}
    backend:fetchCover("calibre:Lib:12", "/cache/x.jpg")
    restore_http()

    local download = calls.downloads[1]
    assertTrue(download.url:find("calibre%%3ALib%%3A12") ~= nil, "uid codificato")
    assertTrue(download.url:find("token=segreto", 1, true) ~= nil, "token")
    assertEquals(download.path, "/cache/x.jpg")
end)

test("pushing progress sends the device identity with the records", function()
    local calls = fake_http{postJson = function() return {outcomes = {}, cursor = 9} end}
    local Hub = require("lib/backend_hub")
    local backend = Hub.new{url = "http://nas:8577", token = ""}
    local result = backend:pushProgress({{uid = "calibre:Lib:12", percent = 0.5}},
                                        "kobo-1", "Kobo Libra Color")
    restore_http()

    assertEquals(result.cursor, 9)
    local body = calls.requests[1].body
    assertEquals(body.device_id, "kobo-1")
    assertEquals(body.device_name, "Kobo Libra Color")
    assertEquals(body.records[1].uid, "calibre:Lib:12")
end)

test("an empty push does not touch the network", function()
    local calls = fake_http{}
    local Hub = require("lib/backend_hub")
    local backend = Hub.new{url = "http://nas:8577"}
    backend:pushProgress({}, "kobo-1", "Kobo")
    restore_http()
    assertEquals(#calls.requests, 0)
end)

test("a book nobody has read yet reads as 'no progress', not as an error", function()
    fake_http{request = function() return nil, "risorsa non trovata sul server" end}
    local Hub = require("lib/backend_hub")
    local backend = Hub.new{url = "http://nas:8577"}
    local record = backend:getProgress("calibre:Lib:12")
    restore_http()
    assertEquals(record, false)
end)

-- -- direct ----------------------------------------------------------------

test("direct mode resolves calibre's default library once", function()
    local calls = fake_http{getJson = function(target)
        if target:find("library%-info") then
            return {library_map = {Lib = "Libreria"}, default_library = "Lib"}
        end
        if target:find("/ajax/search") then return {book_ids = {}, total_num = 0} end
        return {}
    end}
    local Direct = require("lib/backend_direct")
    local backend = Direct.new{calibre_url = "http://nas:8080"}
    backend:calibreItems{}
    backend:calibreItems{}
    restore_http()

    local info_calls = 0
    for _, request in ipairs(calls.requests) do
        if request.url:find("library%-info") then info_calls = info_calls + 1 end
    end
    assertEquals(info_calls, 1, "una sola richiesta di library-info")
end)

test("direct mode normalises a calibre book", function()
    fake_http{getJson = function(target)
        if target:find("library%-info") then return {default_library = "Lib"} end
        if target:find("/ajax/search") then return {book_ids = {12}, total_num = 1} end
        return {["12"] = {title = "Il nome della rosa", authors = {"Umberto Eco"},
                          tags = {"Giallo"}, formats = {"EPUB", "PDF"},
                          comments = "<p>Un'abbazia</p>", languages = {"ita"}}}
    end}
    local Direct = require("lib/backend_direct")
    local backend = Direct.new{calibre_url = "http://nas:8080"}
    local page = backend:calibreItems{}
    restore_http()

    local item = page.items[1]
    assertEquals(item.uid, "calibre:Lib:12")
    assertEquals(item.title, "Il nome della rosa")
    assertEquals(item.formats[1], "epub")
    assertEquals(item.description, "Un'abbazia")
    assertEquals(item.kind, "book")
end)

test("the preferred format wins when the book has several", function()
    fake_http{}
    local Direct = require("lib/backend_direct")
    local backend = Direct.new{calibre_url = "http://nas:8080"}
    restore_http()
    assertEquals(backend:bestFormat({"PDF", "EPUB"}), "epub")
    assertEquals(backend:bestFormat({"pdf", "kepub", "epub"}), "kepub")
    assertEquals(backend:bestFormat({"djvu"}), "djvu")
end)

test("a GraphQL error becomes a readable message", function()
    fake_http{postJson = function()
        return {errors = {{message = "Unknown field 'lastReadChapter'"}}}
    end}
    local Direct = require("lib/backend_direct")
    local backend = Direct.new{suwayomi_url = "http://nas:4567"}
    local data, err = backend:gql("query { nulla }")
    restore_http()
    assertNil(data, "nessun dato")
    assertTrue(err:find("Unknown field") ~= nil, "messaggio riportato")
end)

test("direct mode writes a manga position as a chapter update", function()
    local calls = fake_http{postJson = function()
        return {data = {updateChapter = {chapter = {id = 101}}}}
    end}
    local Direct = require("lib/backend_direct")
    local backend = Direct.new{suwayomi_url = "http://nas:4567"}
    local ok = backend:pushOne({uid = "suwayomi:manga:7", chapter_uid = "suwayomi:chapter:101",
                                page = 20, pages = 20, percent = 0.5}, "Kobo")
    restore_http()

    assertTrue(ok, "aggiornamento inviato")
    local variables = calls.requests[1].body.variables
    assertEquals(variables.id, 101)
    assertEquals(variables.patch.lastPageRead, 19, "pagine 1-based sul device")
    assertTrue(variables.patch.isRead, "capitolo finito")
end)

test("direct mode sends the percentage to calibre, and a CFI only when it is one", function()
    local calls = fake_http{
        getJson = function(target)
            if target:find("library%-info") then return {default_library = "Lib"} end
            return {["12"] = {title = "x", formats = {"EPUB"}}}
        end,
        postJson = function() return {ok = true} end,
    }
    local Direct = require("lib/backend_direct")
    local backend = Direct.new{calibre_url = "http://nas:8080"}
    backend:pushOne({uid = "calibre:Lib:12", percent = 0.42,
                     locator = "/body/DocFragment[7]"}, "Kobo")
    restore_http()

    local post
    for _, request in ipairs(calls.requests) do
        if request.method == "POST" then post = request end
    end
    assertTrue(post.url:find("/book%-set%-last%-read%-position/Lib/12/EPUB") ~= nil, "endpoint")
    assertNear(post.body.pos_frac, 0.42)
    assertEquals(post.body.cfi, "", "un xpointer non è un CFI")
    assertTrue(post.body.device:find("^inkbridge:") ~= nil, "marcato come nostro")
end)

test("direct mode packs a chapter into a CBZ the device can read", function()
    local pages = {}
    for index = 0, 4 do
        pages[#pages + 1] = string.format("/api/v1/manga/7/chapter/1/page/%d", index)
    end
    fake_http{
        postJson = function() return {data = {fetchChapterPages = {pages = pages}}} end,
        request = function(options)
            return "IMG" .. options.url:sub(-1), 200, {["content-type"] = "image/jpeg"}
        end,
    }
    local Direct = require("lib/backend_direct")
    local backend = Direct.new{suwayomi_url = "http://nas:4567"}
    local target = os.tmpname() .. ".cbz"
    local path, size = backend:downloadChapter(
        {uid = "suwayomi:manga:7", title = "Vinland Saga"},
        {uid = "suwayomi:chapter:101", index = 1, pages = 5}, target)
    restore_http()

    assertEquals(path, target)
    local file = assert(io.open(target, "rb"))
    local content = file:read("*a")
    file:close()
    os.remove(target)
    assertEquals(content:sub(1, 4), "PK\3\4", "è uno zip")
    assertEquals(select(2, content:gsub("PK\1\2", "")), 5, "cinque pagine")
    assertTrue(size == nil or size >= 0, "dimensione riportata")
end)

test("a page that fails to download does not leave half a chapter behind", function()
    fake_http{
        postJson = function()
            return {data = {fetchChapterPages = {pages = {"/p/0", "/p/1"}}}}
        end,
        request = function(options)
            if options.url:find("/p/1") then return nil, "connessione rifiutata" end
            return "IMG", 200, {["content-type"] = "image/jpeg"}
        end,
    }
    local Direct = require("lib/backend_direct")
    local backend = Direct.new{suwayomi_url = "http://nas:4567"}
    local target = os.tmpname() .. ".cbz"
    local path, err = backend:downloadChapter({uid = "suwayomi:manga:7", title = "x"},
                                              {uid = "suwayomi:chapter:101", index = 1,
                                               pages = 2}, target)
    restore_http()
    assertNil(path, "nessun file")
    assertTrue(err:find("pagina 2") ~= nil, "dice quale pagina")
    assertNil(io.open(target .. ".part", "rb"), "niente residui")
end)
