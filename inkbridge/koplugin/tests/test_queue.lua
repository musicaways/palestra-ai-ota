local Queue = require("lib/queue")

local function record(uid, percent, updated_at)
    return {uid = uid, percent = percent, updated_at = updated_at, kind = "book"}
end

test("the queue keeps one record per item", function()
    Queue.put(record("a", 0.1, 100))
    Queue.put(record("a", 0.2, 200))
    assertEquals(Queue.count(), 1)
    assertEquals(Queue.get("a").percent, 0.2)
end)

test("an older reading never replaces a newer one", function()
    Queue.put(record("a", 0.9, 500))
    Queue.put(record("a", 0.1, 100))
    assertEquals(Queue.get("a").percent, 0.9)
end)

test("pending comes back oldest first", function()
    Queue.put(record("b", 0.5, 300))
    Queue.put(record("a", 0.5, 100))
    local pending = Queue.pending()
    assertEquals(pending[1].uid, "a")
    assertEquals(pending[2].uid, "b")
end)

test("acknowledge clears what was sent", function()
    Queue.put(record("a", 0.5, 100))
    Queue.put(record("b", 0.5, 200))
    Queue.acknowledge({record("a", 0.5, 100)})
    assertEquals(Queue.count(), 1)
    assertEquals(Queue.pending()[1].uid, "b")
end)

test("acknowledge keeps a record that moved on while we were sending", function()
    Queue.put(record("a", 0.5, 100))
    local sent = Queue.pending()
    Queue.put(record("a", 0.8, 900))       -- read on while the request was in flight
    Queue.acknowledge(sent)
    assertEquals(Queue.count(), 1)
    assertEquals(Queue.get("a").percent, 0.8)
end)

test("the sync cursor survives a restart", function()
    Queue.setCursor(4711)
    package.loaded["lib/queue"] = nil
    local Reloaded = require("lib/queue")
    assertEquals(Reloaded.cursor(), 4711)
end)
