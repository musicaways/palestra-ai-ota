--[[--
JSON encode/decode, whichever implementation this KOReader build ships.

`rapidjson` is present on current builds and is much faster on the 2–3 MB
catalogue payloads; the pure-Lua `json` module is the fallback for older ones.
]]

local Json = {}

local rapid_ok, rapidjson = pcall(require, "rapidjson")
local plain_ok, plainjson = pcall(require, "json")

--- Decodes a JSON string. Returns `nil, message` on malformed input.
function Json.decode(text)
    if type(text) ~= "string" or text == "" then
        return nil, "risposta vuota"
    end
    if rapid_ok then
        local ok, result = pcall(rapidjson.decode, text)
        if ok and result ~= nil then return result end
        return nil, tostring(result)
    end
    if plain_ok then
        local ok, result = pcall(plainjson.decode, text)
        if ok and result ~= nil then return result end
        return nil, tostring(result)
    end
    return nil, "nessun parser JSON disponibile"
end

--- Encodes a Lua table. Empty tables encode as `[]` unless `as_object`.
function Json.encode(value, as_object)
    if rapid_ok then
        if as_object and type(value) == "table" and next(value) == nil then
            return "{}"
        end
        local ok, result = pcall(rapidjson.encode, value)
        if ok then return result end
        return nil, tostring(result)
    end
    if plain_ok then
        local ok, result = pcall(plainjson.encode, value)
        if ok then return result end
        return nil, tostring(result)
    end
    return nil, "nessun encoder JSON disponibile"
end

--- rapidjson keeps `null` as a sentinel; treat it as absent.
function Json.value(field)
    if field == nil then return nil end
    if rapid_ok and field == rapidjson.null then return nil end
    if type(field) == "userdata" then return nil end
    return field
end

return Json
