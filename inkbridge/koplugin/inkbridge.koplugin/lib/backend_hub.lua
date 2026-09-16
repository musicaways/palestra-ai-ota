--[[--
Back end for the InkBridge hub — the recommended setup.

One host, one token, one catalogue.  Everything hard (merging progress, packing
CBZs, talking two different APIs) already happened on the NAS.
]]

local Http = require("lib/http")
local Json = require("lib/json")
local logger = require("logger")

local BackendHub = {}
BackendHub.__index = BackendHub

function BackendHub.new(options)
    local self = setmetatable({}, BackendHub)
    self.url = (options.url or ""):gsub("/+$", "")
    self.token = options.token or ""
    self.name = "hub"
    self.supports_delta = true
    return self
end

function BackendHub:headers()
    local headers = {["Accept"] = "application/json"}
    if self.token ~= "" then
        headers["Authorization"] = "Bearer " .. self.token
    end
    return headers
end

function BackendHub:endpoint(path, params)
    return Http.url(self.url, path, params)
end

function BackendHub:health()
    return Http.getJson(self:endpoint("/v1/health"), self:headers())
end

function BackendHub:sources()
    local data, err = Http.getJson(self:endpoint("/v1/library/sources"), self:headers())
    if not data then return nil, err end
    return data
end

function BackendHub:listItems(options)
    options = options or {}
    local data, err = Http.getJson(self:endpoint("/v1/library/items", {
        source = options.source,
        query = options.query,
        offset = options.offset or 0,
        limit = options.limit or 24,
        sort = options.sort,
        sort_order = options.sort_order,
    }), self:headers())
    if not data then return nil, err end
    return {
        items = data.items or {},
        total = data.total or 0,
        offset = data.offset or 0,
        limit = data.limit or (options.limit or 24),
    }
end

function BackendHub:item(uid)
    return Http.getJson(self:endpoint("/v1/library/items/" .. Http.escape(uid)), self:headers())
end

function BackendHub:chapters(uid)
    return Http.getJson(
        self:endpoint("/v1/library/items/" .. Http.escape(uid) .. "/chapters"), self:headers())
end

function BackendHub:fetchCover(uid, path)
    -- The token rides in the query string: the hub accepts it there precisely
    -- so a plain download call can fetch covers.
    local target = self:endpoint("/v1/library/items/" .. Http.escape(uid) .. "/cover", {
        token = self.token ~= "" and self.token or nil,
    })
    return Http.download(target, path, {block_timeout = 10, total_timeout = 30})
end

function BackendHub:downloadItem(item, target_path, on_progress, format)
    local target = self:endpoint("/v1/library/items/" .. Http.escape(item.uid) .. "/file", {
        format = format,
        token = self.token ~= "" and self.token or nil,
    })
    local path, size_or_error = Http.download(target, target_path, {on_progress = on_progress})
    if not path then return nil, size_or_error end
    return path, size_or_error
end

function BackendHub:downloadChapter(item, chapter, target_path, on_progress)
    local target = self:endpoint("/v1/library/chapters/" .. Http.escape(chapter.uid) .. "/cbz", {
        name = (item.title or "") .. " - " .. (chapter.name or ""),
        token = self.token ~= "" and self.token or nil,
    })
    return Http.download(target, target_path, {on_progress = on_progress})
end

function BackendHub:getProgress(uid)
    local body, code = Http.request{
        url = self:endpoint("/v1/progress/" .. Http.escape(uid)),
        headers = self:headers(),
    }
    if not body then
        -- 404 simply means "nobody has read this yet".
        if type(code) == "string" and code:find("non trovata") then return false end
        return nil, code
    end
    local decoded = Json.decode(body)
    if not decoded then return false end
    return decoded
end

function BackendHub:pushProgress(records, device_id, device_name)
    if #records == 0 then return {outcomes = {}, cursor = 0} end
    local payload = {
        records = records,
        device_id = device_id,
        device_name = device_name,
    }
    local data, err = Http.postJson(self:endpoint("/v1/progress"), payload, self:headers())
    if not data then return nil, err end
    return data
end

function BackendHub:pullProgress(cursor, device_id, device_name)
    local data, err = Http.getJson(self:endpoint("/v1/progress", {
        since = cursor or 0,
        device_id = device_id,
        device_name = device_name,
    }), self:headers())
    if not data then return nil, err end
    return data
end

--- Tells the hub that a KOSync document hash means this catalogue item.
function BackendHub:registerAlias(alias, uid)
    local ok, err = Http.postJson(self:endpoint("/v1/aliases"),
                                  {alias = alias, uid = uid}, self:headers())
    if not ok then
        logger.dbg("InkBridge: alias non registrato:", err)
        return nil, err
    end
    return true
end

function BackendHub:runUpstreamSync()
    return Http.postJson(self:endpoint("/v1/sync/run"), {}, self:headers())
end

return BackendHub
