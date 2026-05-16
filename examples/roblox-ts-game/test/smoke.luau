--!nocheck
local process = require("@lune/process")
local TS = require("./harness/runtime")

local main = TS.loadPath("out/server/main.server")
local result = main.runIntegrationSmoke()

local function expect(name: string, value, expected)
	if value ~= expected then
		error(string.format("%s: expected %s, got %s", name, tostring(expected), tostring(value)), 2)
	end
end

expect("started", result.started, true)
expect("spawned", result.spawned, 1)
expect("pulses", result.pulses, 1)
expect("observed", result.observed, 1)
expect("deadEntered", result.deadEntered, 1)
expect("finalHealth", result.finalHealth, 0)
expect("traitId", result.traitId, "src/shared/module")

print("ok  integration Luau smoke")
process.exit(0)
