--!nocheck
local testing = zune.testing
local TS = require("./harness/runtime")
local expect = testing.expect

local main = TS.loadPath("out/server/main.server")
local result = main.runTemplateSmoke()

testing.test("template bootstrap smoke", function()
	expect(result.started).toBe(true)
end)

print("ok  game template Luau smoke")
