local runner = require("../../../test/luau/harness/spec_runner")
runner.run({
	runtimeModule = "../../../packages/networking/test/harness/runtime",
	loadPath = "out/init",
	specsRequirePrefix = "../../../packages/parallel/test/specs/",
})
