--!nocheck
-- Minimal smoke runner for @rovy/datastore. The TypeScript build covers the
-- public handle types; transformer tests cover lowering.

local runner = require("../../../test/luau/harness/spec_runner")

runner.run({
	runtimeModule = "../../../packages/networking/test/harness/runtime",
	loadPath = "out/init",
	specsRequirePrefix = "../../../packages/datastore/test/specs/",
	successMessage = "ok  harness loaded out/init",
})
