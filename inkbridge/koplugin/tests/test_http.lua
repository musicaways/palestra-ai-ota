local Http = require("lib/http")

test("url builder sorts and escapes the query", function()
    local target = Http.url("http://nas:8577/", "/v1/library/items",
                            {query = "città invisibili", source = "calibre"})
    assertEquals(target,
        "http://nas:8577/v1/library/items?query=citt%C3%A0%20invisibili&source=calibre")
end)

test("url builder drops empty parameters", function()
    assertEquals(Http.url("http://nas", "/x", {a = "", b = nil, c = 1}), "http://nas/x?c=1")
end)

test("url builder keeps an existing query string", function()
    assertEquals(Http.url("http://nas", "/x?sz=1", {a = 2}), "http://nas/x?sz=1&a=2")
end)

test("basic auth header", function()
    assertEquals(Http.basicAuth("io", "segreto"), "Basic b64:io:segreto")
    assertNil(Http.basicAuth("", "segreto"), "nessun utente, nessuna intestazione")
end)
