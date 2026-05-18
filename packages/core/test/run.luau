--!nocheck
-- Phase 1+ spec runner.
-- Usage: `pnpm --filter @rovy/core test`  (= rbxtsc && zune run test/run)

local process = zune.process
local runner = require("../../../test/luau/harness/spec_runner")

process.exit(runner.run({
	runtimeModule = "./harness/runtime",
	loadPath = "out/init",
	successMessage = "ok  harness loaded out/init (TS.import + TS.getModule jecs)",
}))
