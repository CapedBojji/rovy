--!nocheck

local runner = require("../../../test/luau/harness/spec_runner")

runner.run({
	runtimeModule = "../../../packages/networking/test/harness/runtime",
	loadPath = "out/shared/init",
	specsRequirePrefix = "../../../packages/scribe/test/specs/",
	successMessage = "ok  harness loaded split scribe output",
})
