--!nocheck
local process = zune.process
local testing = zune.testing
local TS = require("./harness/runtime")
local expect = testing.expect

local main = TS.loadPath("out/server/main.server")
local result = main.runIntegrationSmoke()

testing.test("integration smoke", function()
	expect(result.started).toBe(true)
	expect(result.spawned).toBe(1)
	expect(result.pulses).toBe(1)
	expect(result.observed).toBe(1)
	expect(result.deadEntered).toBe(1)
	expect(result.finalHealth).toBe(0)
	expect(result.traitId).toBe("src/shared/module")
end)

print("ok  integration Luau smoke")
process.exit(testing._failed)
