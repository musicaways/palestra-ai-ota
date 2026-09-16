--[[-- Minimal test runner: `lua5.1 tests/run.lua` from the plugin directory. ]]

-- Resolve the plugin next to this file, so the suite runs from anywhere.
local here = debug.getinfo(1, "S").source:sub(2):match("(.*)/run%.lua$") or "."
package.path = here .. "/../inkbridge.koplugin/?.lua;" .. here .. "/?.lua;" .. package.path

local Stubs = require("stubs")

local Runner = {passed = 0, failed = 0, failures = {}}

function Runner.test(name, body)
    Stubs.reset()
    -- Each test starts from a clean module state.
    for module in pairs(package.loaded) do
        if module:match("^lib/") then package.loaded[module] = nil end
    end
    local ok, err = pcall(body)
    if ok then
        Runner.passed = Runner.passed + 1
        io.write(".")
    else
        Runner.failed = Runner.failed + 1
        Runner.failures[#Runner.failures + 1] = {name = name, err = err}
        io.write("F")
    end
end

function Runner.assertEquals(actual, expected, message)
    if actual ~= expected then
        error(string.format("%s: atteso %s, ottenuto %s",
                            message or "valore", tostring(expected), tostring(actual)), 2)
    end
end

function Runner.assertNear(actual, expected, tolerance, message)
    tolerance = tolerance or 1e-6
    if type(actual) ~= "number" or math.abs(actual - expected) > tolerance then
        error(string.format("%s: atteso ~%s, ottenuto %s",
                            message or "valore", tostring(expected), tostring(actual)), 2)
    end
end

function Runner.assertTrue(value, message)
    if not value then error((message or "atteso vero") .. ": ottenuto " .. tostring(value), 2) end
end

function Runner.assertNil(value, message)
    if value ~= nil then error((message or "atteso nil") .. ": " .. tostring(value), 2) end
end

_G.test = Runner.test
_G.assertEquals = Runner.assertEquals
_G.assertNear = Runner.assertNear
_G.assertTrue = Runner.assertTrue
_G.assertNil = Runner.assertNil
_G.Stubs = Stubs

local suites = {
    "test_paths", "test_queue", "test_cbz", "test_http", "test_sync", "test_docmap",
    "test_backend",
}
for _, suite in ipairs(suites) do
    require(suite)
end

print()
for _, failure in ipairs(Runner.failures) do
    print(string.format("FALLITO  %s\n         %s", failure.name, failure.err))
end
print(string.format("%d superati, %d falliti", Runner.passed, Runner.failed))
os.exit(Runner.failed == 0 and 0 or 1)
