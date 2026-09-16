--[[--
The plugin's HTTP layer.

Everything the device does over the network goes through here: JSON calls,
file downloads with a progress callback, and error messages that a reader can
act on ("NAS non raggiungibile") instead of a socket errno.
]]

local Json = require("lib/json")
local ltn12 = require("ltn12")
local socket = require("socket")
local socket_url = require("socket.url")
local socketutil = require("socketutil")
local http = require("socket.http")
local logger = require("logger")

local has_https, https = pcall(require, "ssl.https")
local has_mime, mime = pcall(require, "mime")

local Http = {}

local BLOCK_TIMEOUT = socketutil.LARGE_BLOCK_TIMEOUT or 10
local TOTAL_TIMEOUT = socketutil.LARGE_TOTAL_TIMEOUT or 30
local FILE_BLOCK_TIMEOUT = socketutil.FILE_BLOCK_TIMEOUT or 15
local FILE_TOTAL_TIMEOUT = socketutil.FILE_TOTAL_TIMEOUT or 300

--- Percent-encodes one query value.
function Http.escape(value)
    return socket_url.escape(tostring(value == nil and "" or value))
end

--- Builds `base .. path .. ?a=1&b=2`; `params` may be nil.
function Http.url(base, path, params)
    local target = (base or ""):gsub("/+$", "") .. (path or "")
    if params then
        local parts = {}
        -- Sorted so identical calls produce identical URLs (cache friendly).
        local keys = {}
        for key in pairs(params) do keys[#keys + 1] = key end
        table.sort(keys)
        for _, key in ipairs(keys) do
            local value = params[key]
            if value ~= nil and value ~= "" then
                parts[#parts + 1] = Http.escape(key) .. "=" .. Http.escape(value)
            end
        end
        if #parts > 0 then
            target = target .. (target:find("?", 1, true) and "&" or "?") .. table.concat(parts, "&")
        end
    end
    return target
end

function Http.basicAuth(username, password)
    if not username or username == "" then return nil end
    local raw = username .. ":" .. (password or "")
    if has_mime then
        return "Basic " .. (mime.b64(raw))
    end
    return nil
end

local function requester_for(target)
    if target:match("^https://") then
        if not has_https then return nil, "questo KOReader non supporta HTTPS" end
        return https.request
    end
    return http.request
end

local function friendly_error(code, status, target)
    if code == nil or code == "timeout" then
        return "nessuna risposta dal server (timeout)"
    end
    if type(code) == "string" then
        if code:find("refused") then return "connessione rifiutata: il servizio è avviato?" end
        if code:find("resolve") or code:find("host") then return "host non risolto: controlla l'indirizzo" end
        if code:find("network") then return "rete non raggiungibile: il Wi-Fi è attivo?" end
        return code
    end
    if code == 401 or code == 403 then
        return "autenticazione rifiutata (token o credenziali errati)"
    end
    if code == 404 then
        return "risorsa non trovata sul server"
    end
    if code >= 500 then
        return string.format("errore del server (%d)", code)
    end
    logger.dbg("InkBridge: HTTP", code, status, target)
    return string.format("HTTP %s", tostring(code))
end

--[[--
Performs a request.

@tparam table options url, method, headers, body (string), timeout pair
@treturn string|nil body
@treturn number|string code — HTTP status, or a message when nothing was sent
@treturn table headers
]]
function Http.request(options)
    local target = options.url
    local requester, err = requester_for(target)
    if not requester then return nil, err end

    local sink_table = {}
    local headers = {}
    for key, value in pairs(options.headers or {}) do headers[key] = value end

    local source
    if options.body then
        headers["Content-Length"] = tostring(#options.body)
        source = ltn12.source.string(options.body)
    end

    socketutil:set_timeout(options.block_timeout or BLOCK_TIMEOUT,
                           options.total_timeout or TOTAL_TIMEOUT)
    local ok, code, response_headers, status = pcall(function()
        return socket.skip(1, requester{
            url = target,
            method = options.method or "GET",
            headers = headers,
            source = source,
            sink = ltn12.sink.table(sink_table),
        })
    end)
    socketutil:reset_timeout()

    if not ok then
        return nil, friendly_error(tostring(code), nil, target)
    end
    if type(code) ~= "number" then
        return nil, friendly_error(code, status, target)
    end
    local body = table.concat(sink_table)
    if code < 200 or code >= 300 then
        return nil, friendly_error(code, status, target), response_headers, code
    end
    return body, code, response_headers
end

--- GET returning a decoded JSON document.
function Http.getJson(target, headers, timeouts)
    local body, code = Http.request{
        url = target,
        headers = headers,
        block_timeout = timeouts and timeouts[1],
        total_timeout = timeouts and timeouts[2],
    }
    if not body then return nil, code end
    local decoded, decode_error = Json.decode(body)
    if not decoded then
        return nil, "risposta non leggibile: " .. tostring(decode_error)
    end
    return decoded
end

--- POST (or PUT) of a JSON document, returning the decoded answer.
function Http.postJson(target, payload, headers, method)
    local encoded, encode_error = Json.encode(payload)
    if not encoded then return nil, "codifica JSON fallita: " .. tostring(encode_error) end
    local merged = {["Content-Type"] = "application/json", ["Accept"] = "application/json"}
    for key, value in pairs(headers or {}) do merged[key] = value end
    local body, code = Http.request{
        url = target,
        method = method or "POST",
        headers = merged,
        body = encoded,
    }
    if not body then return nil, code end
    if body == "" then return {} end
    local decoded, decode_error = Json.decode(body)
    if not decoded then
        return nil, "risposta non leggibile: " .. tostring(decode_error)
    end
    return decoded
end

--[[--
Downloads to a file, reporting progress.

The file is written to `target .. ".part"` and renamed at the end, so an
interrupted transfer never leaves something that looks like a readable book.
]]
function Http.download(target_url, target_path, options)
    options = options or {}
    local requester, err = requester_for(target_url)
    if not requester then return nil, err end

    local part_path = target_path .. ".part"
    local file, open_error = io.open(part_path, "wb")
    if not file then return nil, "impossibile scrivere sul dispositivo: " .. tostring(open_error) end

    local received = 0
    local expected = 0
    local on_progress = options.on_progress
    local cancelled = false

    local sink = function(chunk, chunk_error)
        if cancelled then return nil, "annullato" end
        if chunk == nil then
            if chunk_error then return nil, chunk_error end
            return true  -- end of stream
        end
        if chunk == "" then return true end
        local written, write_error = file:write(chunk)
        if not written then return nil, write_error end
        received = received + #chunk
        if on_progress then
            if on_progress(received, expected) == false then
                cancelled = true
                return nil, "annullato"
            end
        end
        return true
    end

    socketutil:set_timeout(options.block_timeout or FILE_BLOCK_TIMEOUT,
                           options.total_timeout or FILE_TOTAL_TIMEOUT)
    local ok, code, response_headers = pcall(function()
        return socket.skip(1, requester{
            url = target_url,
            method = "GET",
            headers = options.headers,
            sink = sink,
            -- Learn the size as soon as the headers arrive, for the progress bar.
            redirect = true,
        })
    end)
    socketutil:reset_timeout()
    file:close()

    if response_headers and response_headers["content-length"] then
        expected = tonumber(response_headers["content-length"]) or 0
    end

    if not ok or type(code) ~= "number" or code < 200 or code >= 300 then
        os.remove(part_path)
        if cancelled then return nil, "annullato" end
        return nil, friendly_error(type(code) == "number" and code or tostring(code),
                                   nil, target_url)
    end
    if received == 0 then
        os.remove(part_path)
        return nil, "il server ha risposto con un file vuoto"
    end

    os.remove(target_path)
    local renamed, rename_error = os.rename(part_path, target_path)
    if not renamed then
        os.remove(part_path)
        return nil, "impossibile rinominare il file: " .. tostring(rename_error)
    end
    return target_path, received
end

return Http
