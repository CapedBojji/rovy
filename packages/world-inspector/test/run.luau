--!nocheck

local runner = require("../../../tests/luau/harness/spec_runner")

runner.run({
	runtimeModule = "../../../packages/networking/test/harness/runtime",
	loadPath = "out/init",
	specsRequirePrefix = "../../../packages/world-inspector/test/specs/",
	successMessage = "ok  harness loaded out/init",
})
