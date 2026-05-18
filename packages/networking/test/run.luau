--!nocheck
-- @rovy/networking spec runner. Builds the package, then runs every
-- test/specs/*.luau against the compiled `out/`. Exits nonzero on failure.
-- Usage: `pnpm --filter @rovy/networking test`

local process = zune.process

local runner = require("../../../test/luau/harness/spec_runner")

process.exit(runner.run({
	runtimeModule = "./harness/runtime",
	loadPath = "out/init",
	successMessage = "ok  harness loaded out/init",
}))
