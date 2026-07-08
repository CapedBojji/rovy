--!nocheck

local runner = require("../../../test/luau/harness/spec_runner")

if _G.__rovyCoverageReset then
	_G.__rovyCoverageReset()
end

runner.run({
	runtimeModule = "../../../packages/ui/test/harness/runtime",
	loadPath = "out/init",
	specsRequirePrefix = "../../../packages/ui/test/specs/",
	successMessage = "ok  harness loaded out/init",
})

if _G.__rovyCoverageSummary then
	local summary = _G.__rovyCoverageSummary()
	print(("[coverage] ui total lines: %d, covered lines: %d, percent: %.2f%%"):format(summary.total, summary.covered, summary.percent * 100))
	for path, data in pairs(summary.files) do
		print(("[coverage] %s => %.2f%% (%d/%d)"):format(path, data.percent * 100, data.covered, data.total))
		if data.uncovered ~= nil and #data.uncovered > 0 then
			print(("[coverage] %s misses: %s"):format(path, table.concat(data.uncovered, ", ")))
		end
	end
	assert(summary.percent >= 1 - 1e-12, "coverage goal not reached: ui runtime must be 100% covered")
end
