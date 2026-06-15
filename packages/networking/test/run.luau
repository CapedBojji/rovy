--!nocheck
-- @rovy/networking spec runner. Builds the package, then runs every
-- test/specs/*.luau against the compiled `out/`. Exits nonzero on failure.
-- Usage: `pnpm --filter @rovy/networking test`

local runner = require("../../../tests/luau/harness/spec_runner")

runner.run({
	runtimeModule = "../../../packages/networking/test/harness/runtime",
	loadPath = "out/init",
	specsRequirePrefix = "../../../packages/networking/test/specs/",
	successMessage = "ok  harness loaded out/init",
})
