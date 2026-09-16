--[[--
Back end that talks to Calibre and Suwayomi directly, with no hub in between.

Everything works, with two honest caveats that the hub does not have:

* the credentials live on the device, in the plugin settings;
* Calibre must accept **basic** authentication (`calibre-server --auth-mode=basic`)
  or none at all — digest is not implemented here;
* progress is merged against each back end one item at a time, so a book read on
  a third device shows up when you open it, not before.
]]

local Cbz = require("lib/cbz")
local Http = require("lib/http")
local Json = require("lib/json")
local Paths = require("lib/paths")

local BackendDirect = {}
BackendDirect.__index = BackendDirect

local function strip_html(text)
    if not text or text == "" then return nil end
    text = text:gsub("<br%s*/?>", "\n"):gsub("</p%s*>", "\n\n")
    text = text:gsub("<[^>]+>", "")
    text = text:gsub("&nbsp;", " "):gsub("&amp;", "&"):gsub("&lt;", "<")
               :gsub("&gt;", ">"):gsub("&quot;", '"'):gsub("&#39;", "'")
    text = text:gsub("\n\n\n+", "\n\n"):gsub("^%s+", ""):gsub("%s+$", "")
    return text ~= "" and text or nil
end

function BackendDirect.new(options)
    local self = setmetatable({}, BackendDirect)
    self.name = "direct"
    self.supports_delta = false
    self.calibre_url = (options.calibre_url or ""):gsub("/+$", "")
    self.calibre_library = options.calibre_library or ""
    self.calibre_auth = Http.basicAuth(options.calibre_username, options.calibre_password)
    self.suwayomi_url = (options.suwayomi_url or ""):gsub("/+$", "")
    self.suwayomi_auth = Http.basicAuth(options.suwayomi_username, options.suwayomi_password)
    self.formats = {"kepub", "epub", "cbz", "pdf"}
    return self
end

function BackendDirect:hasAnySource()
    return self.calibre_url ~= "" or self.suwayomi_url ~= ""
end

-- -- UIDs ------------------------------------------------------------------

local function calibre_uid(library, book_id)
    return "calibre:" .. library .. ":" .. tostring(book_id)
end

local function parse_calibre_uid(uid)
    local library, book_id = uid:match("^calibre:(.+):(%d+)$")
    return library, tonumber(book_id)
end

local function parse_suwayomi_uid(uid)
    local kind, id = uid:match("^suwayomi:(%a+):(%d+)$")
    return kind, tonumber(id)
end

-- -- Calibre ---------------------------------------------------------------

function BackendDirect:calibreHeaders()
    local headers = {["Accept"] = "application/json"}
    if self.calibre_auth then headers["Authorization"] = self.calibre_auth end
    return headers
end

function BackendDirect:calibreLibrary()
    if self.calibre_library ~= "" then return self.calibre_library end
    if self._library then return self._library end
    local info, err = Http.getJson(Http.url(self.calibre_url, "/ajax/library-info"),
                                   self:calibreHeaders())
    if not info then return nil, err end
    self._library = Json.value(info.default_library)
    if not self._library and type(info.library_map) == "table" then
        for key in pairs(info.library_map) do self._library = key break end
    end
    if not self._library then return nil, "nessuna libreria esposta da Calibre" end
    return self._library
end

function BackendDirect:calibreItems(options)
    local library, err = self:calibreLibrary()
    if not library then return nil, err end
    local search, search_error = Http.getJson(Http.url(self.calibre_url, "/ajax/search", {
        library_id = library,
        query = options.query,
        num = options.limit or 24,
        offset = options.offset or 0,
        sort = options.sort or "timestamp",
        sort_order = options.sort_order or "desc",
    }), self:calibreHeaders())
    if not search then return nil, search_error end

    local ids = search.book_ids or {}
    if #ids == 0 then
        return {items = {}, total = tonumber(search.total_num) or 0,
                offset = options.offset or 0, limit = options.limit or 24}
    end
    local id_list = {}
    for _, id in ipairs(ids) do id_list[#id_list + 1] = tostring(id) end
    local books, books_error = Http.getJson(Http.url(self.calibre_url, "/ajax/books", {
        ids = table.concat(id_list, ","),
        library_id = library,
    }), self:calibreHeaders())
    if not books then return nil, books_error end

    local items = {}
    for _, id in ipairs(ids) do
        local meta = Json.value(books[tostring(id)])
        if meta then
            items[#items + 1] = self:calibreToItem(library, id, meta)
        end
    end
    return {items = items, total = tonumber(search.total_num) or #items,
            offset = options.offset or 0, limit = options.limit or 24}
end

function BackendDirect:calibreToItem(library, book_id, meta)
    local formats = {}
    for _, format in ipairs(Json.value(meta.formats) or {}) do
        formats[#formats + 1] = tostring(format):lower()
    end
    local authors = {}
    for _, author in ipairs(Json.value(meta.authors) or {}) do
        authors[#authors + 1] = tostring(author)
    end
    local tags = {}
    for _, tag in ipairs(Json.value(meta.tags) or {}) do tags[#tags + 1] = tostring(tag) end
    local languages = Json.value(meta.languages) or {}
    return {
        uid = calibre_uid(library, book_id),
        kind = "book",
        source = "calibre",
        title = Json.value(meta.title) or ("#" .. tostring(book_id)),
        authors = authors,
        series = Json.value(meta.series),
        series_index = Json.value(meta.series_index),
        tags = tags,
        description = strip_html(Json.value(meta.comments)),
        language = languages[1],
        formats = formats,
    }
end

function BackendDirect:bestFormat(formats)
    local available = {}
    for _, format in ipairs(formats or {}) do available[format:lower()] = true end
    for _, preferred in ipairs(self.formats) do
        if available[preferred] then return preferred end
    end
    return formats and formats[1] or "epub"
end

-- -- Suwayomi --------------------------------------------------------------

function BackendDirect:suwayomiHeaders()
    local headers = {}
    if self.suwayomi_auth then headers["Authorization"] = self.suwayomi_auth end
    return headers
end

function BackendDirect:gql(query, variables)
    local data, err = Http.postJson(Http.url(self.suwayomi_url, "/api/graphql"),
                                    {query = query, variables = variables or {}},
                                    self:suwayomiHeaders())
    if not data then return nil, err end
    local errors = Json.value(data.errors)
    if errors and #errors > 0 then
        local message = Json.value(errors[1].message) or "errore GraphQL"
        return nil, "Suwayomi: " .. tostring(message)
    end
    return Json.value(data.data)
end

local LIBRARY_QUERY = [[
query InkBridgeLibrary($offset: Int, $first: Int) {
  mangas(condition: {inLibrary: true}, offset: $offset, first: $first, order: [{by: TITLE}]) {
    totalCount
    nodes {
      id title author description genre thumbnailUrl unreadCount
      chapters { totalCount }
    }
  }
}]]

local CHAPTERS_QUERY = [[
query InkBridgeChapters($id: Int!) {
  chapters(condition: {mangaId: $id}, order: [{by: SOURCE_ORDER}]) {
    nodes { id name chapterNumber sourceOrder pageCount isRead lastPageRead isDownloaded }
  }
}]]

local PAGES_MUTATION = [[
mutation InkBridgePages($id: Int!) {
  fetchChapterPages(input: {chapterId: $id}) { pages }
}]]

local UPDATE_CHAPTER_MUTATION = [[
mutation InkBridgeUpdateChapter($id: Int!, $patch: UpdateChapterPatchInput!) {
  updateChapter(input: {id: $id, patch: $patch}) { chapter { id isRead lastPageRead } }
}]]

function BackendDirect:suwayomiToItem(node)
    local genres = {}
    local genre = Json.value(node.genre)
    if type(genre) == "table" then
        for _, value in ipairs(genre) do genres[#genres + 1] = tostring(value) end
    elseif type(genre) == "string" then
        for value in genre:gmatch("[^,]+") do
            genres[#genres + 1] = value:gsub("^%s+", ""):gsub("%s+$", "")
        end
    end
    local authors = {}
    if Json.value(node.author) then authors[1] = tostring(node.author) end
    local chapters = Json.value(node.chapters) or {}
    return {
        uid = "suwayomi:manga:" .. tostring(node.id),
        kind = "manga",
        source = "suwayomi",
        title = Json.value(node.title) or ("#" .. tostring(node.id)),
        authors = authors,
        tags = genres,
        description = Json.value(node.description),
        formats = {"cbz"},
        chapter_count = tonumber(Json.value(chapters.totalCount)),
        unread_count = tonumber(Json.value(node.unreadCount)),
    }
end

function BackendDirect:suwayomiItems(options)
    local wants_search = options.query and options.query ~= ""
    local data, err = self:gql(LIBRARY_QUERY, {
        offset = wants_search and 0 or (options.offset or 0),
        first = wants_search and 500 or (options.limit or 24),
    })
    if not data then return nil, err end
    local block = Json.value(data.mangas) or {}
    local items = {}
    for _, node in ipairs(Json.value(block.nodes) or {}) do
        items[#items + 1] = self:suwayomiToItem(node)
    end
    if wants_search then
        local needle = options.query:lower()
        local filtered = {}
        for _, item in ipairs(items) do
            if item.title:lower():find(needle, 1, true) then
                filtered[#filtered + 1] = item
            end
        end
        local total = #filtered
        local window = {}
        for index = (options.offset or 0) + 1, math.min(total, (options.offset or 0)
                                                        + (options.limit or 24)) do
            window[#window + 1] = filtered[index]
        end
        return {items = window, total = total, offset = options.offset or 0,
                limit = options.limit or 24}
    end
    return {items = items, total = tonumber(Json.value(block.totalCount)) or #items,
            offset = options.offset or 0, limit = options.limit or 24}
end

-- -- Interface -------------------------------------------------------------

function BackendDirect:sources()
    local sources = {}
    if self.calibre_url ~= "" then
        local library, err = self:calibreLibrary()
        sources[#sources + 1] = {
            id = "calibre", name = "Calibre", kind = "book", enabled = true,
            available = library ~= nil,
            detail = library and ("libreria «" .. library .. "»") or tostring(err),
        }
    end
    if self.suwayomi_url ~= "" then
        local data, err = self:gql("query { mangas(condition: {inLibrary: true}) { totalCount } }")
        local total = data and Json.value(data.mangas) and Json.value(data.mangas.totalCount)
        sources[#sources + 1] = {
            id = "suwayomi", name = "Suwayomi", kind = "manga", enabled = true,
            available = data ~= nil,
            detail = data and (tostring(total) .. " manga in libreria") or tostring(err),
        }
    end
    return sources
end

function BackendDirect:listItems(options)
    options = options or {}
    local source = options.source
    if source == "calibre" or (source == nil and self.suwayomi_url == "") then
        if self.calibre_url == "" then return {items = {}, total = 0} end
        return self:calibreItems(options)
    end
    if source == "suwayomi" or (source == nil and self.calibre_url == "") then
        if self.suwayomi_url == "" then return {items = {}, total = 0} end
        return self:suwayomiItems(options)
    end
    -- Both: used by search.  Each side contributes a window, merged locally.
    local merged, total = {}, 0
    local window = {query = options.query, offset = 0,
                    limit = (options.offset or 0) + (options.limit or 24)}
    local books = self:calibreItems(window)
    if books then
        total = total + (books.total or 0)
        for _, item in ipairs(books.items) do merged[#merged + 1] = item end
    end
    local manga = self:suwayomiItems(window)
    if manga then
        total = total + (manga.total or 0)
        for _, item in ipairs(manga.items) do merged[#merged + 1] = item end
    end
    local page = {}
    for index = (options.offset or 0) + 1,
                math.min(#merged, (options.offset or 0) + (options.limit or 24)) do
        page[#page + 1] = merged[index]
    end
    return {items = page, total = total, offset = options.offset or 0,
            limit = options.limit or 24}
end

function BackendDirect:item(uid)
    if uid:find("^calibre:") then
        local library, book_id = parse_calibre_uid(uid)
        if not library then return nil, "UID non valido" end
        local books, err = Http.getJson(Http.url(self.calibre_url, "/ajax/books", {
            ids = tostring(book_id), library_id = library}), self:calibreHeaders())
        if not books then return nil, err end
        local meta = Json.value(books[tostring(book_id)])
        if not meta then return nil, "libro non trovato" end
        return self:calibreToItem(library, book_id, meta)
    end
    local kind, manga_id = parse_suwayomi_uid(uid)
    if kind ~= "manga" then return nil, "UID non valido" end
    local data, err = self:gql([[
query InkBridgeManga($id: Int!) {
  manga(id: $id) { id title author description genre thumbnailUrl unreadCount
                   chapters { totalCount } }
}]], {id = manga_id})
    if not data then return nil, err end
    local node = Json.value(data.manga)
    if not node then return nil, "manga non trovato" end
    return self:suwayomiToItem(node)
end

function BackendDirect:chapters(uid)
    local kind, manga_id = parse_suwayomi_uid(uid)
    if kind ~= "manga" then return nil, "solo i manga hanno capitoli" end
    local data, err = self:gql(CHAPTERS_QUERY, {id = manga_id})
    if not data then return nil, err end
    local block = Json.value(data.chapters) or {}
    local chapters = {}
    for _, node in ipairs(Json.value(block.nodes) or {}) do
        chapters[#chapters + 1] = {
            uid = "suwayomi:chapter:" .. tostring(node.id),
            manga_uid = uid,
            name = Json.value(node.name) or ("Capitolo " .. tostring(node.chapterNumber or "")),
            index = tonumber(Json.value(node.sourceOrder)) or 0,
            pages = tonumber(Json.value(node.pageCount)),
            read = Json.value(node.isRead) == true,
            last_page_read = tonumber(Json.value(node.lastPageRead)) or 0,
            downloaded = Json.value(node.isDownloaded) == true,
        }
    end
    table.sort(chapters, function(a, b) return a.index < b.index end)
    return chapters
end

function BackendDirect:fetchCover(uid, path)
    if uid:find("^calibre:") then
        local library, book_id = parse_calibre_uid(uid)
        if not library then return nil, "UID non valido" end
        local target = Http.url(self.calibre_url,
            "/get/thumb/" .. tostring(book_id) .. "/" .. Http.escape(library), {sz = "400x600"})
        return Http.download(target, path, {headers = self:calibreHeaders(),
                                            block_timeout = 10, total_timeout = 30})
    end
    local kind, manga_id = parse_suwayomi_uid(uid)
    if kind ~= "manga" then return nil, "UID non valido" end
    return Http.download(
        Http.url(self.suwayomi_url, "/api/v1/manga/" .. tostring(manga_id) .. "/thumbnail"),
        path, {headers = self:suwayomiHeaders(), block_timeout = 10, total_timeout = 30})
end

function BackendDirect:downloadItem(item, target_path, on_progress, format)
    local library, book_id = parse_calibre_uid(item.uid)
    if not library then return nil, "UID non valido" end
    format = format or self:bestFormat(item.formats)
    local target = Http.url(self.calibre_url,
        "/get/" .. format:upper() .. "/" .. tostring(book_id) .. "/" .. Http.escape(library))
    return Http.download(target, target_path,
                         {headers = self:calibreHeaders(), on_progress = on_progress})
end

function BackendDirect:downloadChapter(item, chapter, target_path, on_progress)
    local _, chapter_id = parse_suwayomi_uid(chapter.uid)
    if not chapter_id then return nil, "UID non valido" end

    local data, err = self:gql(PAGES_MUTATION, {id = chapter_id})
    if not data then return nil, err end
    local fetched = Json.value(data.fetchChapterPages) or {}
    local pages = Json.value(fetched.pages) or {}
    if #pages == 0 then
        -- Server did not list them: rebuild the indexed REST route.
        local manga_kind, manga_id = parse_suwayomi_uid(item.uid)
        if manga_kind == "manga" and chapter.pages then
            for index = 0, chapter.pages - 1 do
                pages[#pages + 1] = string.format("/api/v1/manga/%d/chapter/%d/page/%d",
                                                  manga_id, chapter.index, index)
            end
        end
    end
    if #pages == 0 then return nil, "capitolo senza pagine" end

    local writer, open_error = Cbz.open(target_path .. ".part")
    if not writer then return nil, "impossibile scrivere il CBZ: " .. tostring(open_error) end

    for index, page_url in ipairs(pages) do
        local absolute = page_url:find("^https?://") and page_url
                         or Http.url(self.suwayomi_url,
                                     page_url:sub(1, 1) == "/" and page_url or "/" .. page_url)
        local body, code, response_headers = Http.request{
            url = absolute,
            headers = self:suwayomiHeaders(),
            block_timeout = 15,
            total_timeout = 120,
        }
        if not body then
            writer:abort()
            return nil, string.format("pagina %d non scaricata: %s", index, tostring(code))
        end
        local content_type = response_headers and response_headers["content-type"]
        local ok, add_error = writer:add(Cbz.pageName(index, content_type, absolute), body)
        if not ok then
            writer:abort()
            return nil, "scrittura del CBZ fallita: " .. tostring(add_error)
        end
        if on_progress and on_progress(index, #pages) == false then
            writer:abort()
            return nil, "annullato"
        end
    end

    local path, close_error = writer:close()
    if not path then return nil, tostring(close_error) end
    Paths.remove(target_path)
    local renamed, rename_error = os.rename(path, target_path)
    if not renamed then
        Paths.remove(path)
        return nil, "impossibile rinominare il CBZ: " .. tostring(rename_error)
    end
    return target_path, Paths.size(target_path)
end

--- Reads the progress the source itself knows about.
function BackendDirect:getProgress(uid)
    if uid:find("^calibre:") then
        local library, book_id = parse_calibre_uid(uid)
        if not library then return false end
        local item = self:item(uid)
        local format = (item and self:bestFormat(item.formats) or "epub"):upper()
        local which = tostring(book_id) .. ":" .. format
        local data = Http.getJson(Http.url(self.calibre_url,
            "/book-get-last-read-position/" .. Http.escape(library) .. "/" .. Http.escape(which)),
            self:calibreHeaders())
        if not data then return false end
        local best
        for _, value in pairs(data) do
            local entries = (type(value) == "table" and value[1] ~= nil) and value or {value}
            for _, entry in ipairs(entries) do
                if type(entry) == "table" and Json.value(entry.epoch) then
                    if not best or tonumber(entry.epoch) > tonumber(best.epoch) then
                        best = entry
                    end
                end
            end
        end
        if not best then return false end
        return {
            uid = uid,
            kind = "book",
            percent = tonumber(Json.value(best.pos_frac)) or 0,
            locator = Json.value(best.cfi),
            device_name = Json.value(best.device) or "Calibre",
            device_id = "upstream:calibre",
            updated_at = math.floor((tonumber(Json.value(best.epoch)) or 0) * 1000),
            status = "reading",
        }
    end

    local kind, manga_id = parse_suwayomi_uid(uid)
    if kind ~= "manga" then return false end
    local chapters, err = self:chapters(uid)
    if not chapters then return nil, err end
    local total = #chapters
    local current, read_count
    read_count = 0
    for _, chapter in ipairs(chapters) do
        if chapter.read then read_count = read_count + 1 end
        if not chapter.read and chapter.last_page_read > 0 and not current then
            current = chapter
        end
    end
    if not current then
        for index = total, 1, -1 do
            if chapters[index].read then current = chapters[index] break end
        end
    end
    if not current then return false end
    local within = current.read and 1
                   or (current.pages and current.pages > 0
                       and math.min(1, (current.last_page_read + 1) / current.pages) or 0)
    local percent = total > 0 and math.min(1, (current.index + within) / total) or 0
    return {
        uid = uid,
        kind = "manga",
        percent = percent,
        chapter_uid = current.uid,
        page = current.last_page_read + 1,
        pages = current.pages,
        device_id = "upstream:suwayomi",
        device_name = "Suwayomi",
        -- Suwayomi does not report when this happened in this query, so the
        -- engine treats it as "as old as the last sync" and the device wins.
        updated_at = 0,
        status = percent >= 0.99 and "finished" or "reading",
    }
end

--- Writes progress back into Calibre / Suwayomi.
function BackendDirect:pushProgress(records, device_id, device_name)
    local failures = {}
    for _, record in ipairs(records) do
        local ok, err = self:pushOne(record, device_name or device_id)
        if not ok then failures[#failures + 1] = tostring(err) end
    end
    if #failures > 0 then
        return nil, table.concat(failures, "; ")
    end
    return {outcomes = {}, cursor = 0}
end

function BackendDirect:pushOne(record, device)
    if record.uid:find("^calibre:") then
        local library, book_id = parse_calibre_uid(record.uid)
        if not library then return nil, "UID non valido" end
        local item = self:item(record.uid)
        local format = (item and self:bestFormat(item.formats) or "epub"):upper()
        local cfi = (record.locator or ""):find("^epubcfi%(") and record.locator or ""
        local ok, err = Http.postJson(Http.url(self.calibre_url,
            "/book-set-last-read-position/" .. Http.escape(library) .. "/"
            .. tostring(book_id) .. "/" .. format),
            {device = "inkbridge:" .. tostring(device or "kobo"), cfi = cfi,
             pos_frac = record.percent or 0},
            self:calibreHeaders())
        if not ok then return nil, err end
        return true
    end
    if not record.chapter_uid then return true end
    local _, chapter_id = parse_suwayomi_uid(record.chapter_uid)
    if not chapter_id then return nil, "UID capitolo non valido" end
    local page = math.max(0, (record.page or 1) - 1)
    local read = record.pages and record.pages > 0
                 and ((page + 1) / record.pages) >= 0.95 or false
    local data, err = self:gql(UPDATE_CHAPTER_MUTATION,
                               {id = chapter_id, patch = {lastPageRead = page, isRead = read}})
    if not data then return nil, err end
    return true
end

function BackendDirect:pullProgress()
    -- No "what changed" endpoint exists on either back end; the engine falls
    -- back to per-item checks when a document is opened.
    return nil, "la sincronizzazione delta richiede l'hub"
end

function BackendDirect:registerAlias()
    return true  -- nothing to register without a hub
end

function BackendDirect:health()
    return {ok = true, sources = self:sources()}
end

return BackendDirect
