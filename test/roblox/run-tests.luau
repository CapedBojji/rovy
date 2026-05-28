local ReplicatedStorage = game:GetService("ReplicatedStorage")

local function waitForPath(root, ...)
	local current = root
	for _, name in ipairs({ ... }) do
		current = current:WaitForChild(name)
	end
	return current
end

local rbxtsScope = waitForPath(ReplicatedStorage, "rbxts_include", "node_modules", "@rbxts")
local testezPackage = rbxtsScope:WaitForChild("testez")
local testezModule = testezPackage:FindFirstChild("src") or testezPackage
local TestEZ = require(testezModule)

local roots = { ReplicatedStorage:WaitForChild("RovyRobloxTests") }
local reporter = TestEZ.Reporters.TextReporter
local results = TestEZ.TestBootstrap:run(roots, reporter)

if results.failureCount > 0 then
	error(string.format("TestEZ failed: %d failures", results.failureCount))
end

print(string.format("TestEZ passed: %d passed, %d skipped", results.successCount, results.skippedCount))
