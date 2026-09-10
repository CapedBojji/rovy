-- run-in-roblox entry point. Drives the compiled Rovy integration harness in a
-- real DataModel and fails the process when any case fails.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local TS = require(ReplicatedStorage:WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
local harness = TS.import(script, ReplicatedStorage:WaitForChild("RovyIntegration"), "harness")

print("ROVY_BUILD_STAMP " .. tostring(harness.HARNESS_BUILD_STAMP))

local ok, resultsOrErr = pcall(harness.runIntegrationTests)
if not ok then
	print("ROVY_INTEGRATION_FAIL threw: " .. tostring(resultsOrErr))
	error("rovy integration place threw: " .. tostring(resultsOrErr), 0)
end

local failures = 0
for _, case in resultsOrErr do
	if case.ok then
		print(string.format("PASS  %s  (%s)", case.name, case.detail))
	else
		failures += 1
		print(string.format("FAIL  %s  (%s)", case.name, case.detail))
	end
end

if failures > 0 then
	print(string.format("ROVY_INTEGRATION_FAIL %d of %d", failures, #resultsOrErr))
	error(string.format("rovy integration place: %d failing case(s)", failures), 0)
end

print(string.format("ROVY_INTEGRATION_OK %d cases", #resultsOrErr))
