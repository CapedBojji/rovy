--!nocheck

local runner = require("../../../test/luau/harness/spec_runner")

runner.run({
	runtimeModule = "../../../packages/imgui/test/harness/runtime",
	loadPath = "out/init",
	specsRequirePrefix = "../../../packages/vide/test/specs/",
	successMessage = "ok  harness loaded @rovy/vide out/init",
})
