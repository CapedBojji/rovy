--!nocheck
-- Phase 1+ spec runner.
-- Usage: `pnpm --filter @rovy/core test`  (= rbxtsc && zune run test/run)

local runner = require("../../../test/luau/harness/spec_runner")

runner.run({
	runtimeModule = "../../../packages/core/test/harness/runtime",
	loadPath = "out/init",
	specsRequirePrefix = "../../../packages/core/test/specs/",
	successMessage = "ok  harness loaded out/init (TS.import + TS.getModule jecs)",
})
