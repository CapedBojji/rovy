--!nocheck
local process = require("@lune/process")
local TS = require("./harness/runtime")
local check = require("../../../test/luau/harness/checks")

local main = TS.loadPath("out/server/main.server")
local result = main.runIntegrationSmoke()

check.equal("started", result.started, true)
check.equal("spawned", result.spawned, 1)
check.equal("pulses", result.pulses, 1)
check.equal("observed", result.observed, 1)
check.equal("deadEntered", result.deadEntered, 1)
check.equal("finalHealth", result.finalHealth, 0)
check.equal("traitId", result.traitId, "src/shared/module")

print("ok  integration Luau smoke")
process.exit(0)
