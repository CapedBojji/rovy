--!nocheck

local process = zune.process

local runner = require("../../../test/luau/harness/spec_runner")

process.exit(runner.run({
	runtimeModule = "./harness/runtime",
	loadPath = "out/init",
	successMessage = "ok  harness loaded out/init",
}))
