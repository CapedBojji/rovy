--!nocheck

local runner = require("../../../test/luau/harness/spec_runner")

runner.run({
	runtimeModule = "../../../packages/ui/test/harness/runtime",
	loadPath = "out/init",
	specsRequirePrefix = "../../../packages/ui/test/specs/",
	successMessage = "ok  harness loaded out/init",
})
