return function()
	local ReplicatedStorage = game:GetService("ReplicatedStorage")
	local RunService = game:GetService("RunService")
	local ServerScriptService = game:GetService("ServerScriptService")

	describe("tower defense game real-engine path", function()
		it("uses real RunService signal connections", function()
			-- Zune cannot catch native RBXScriptConnection shape.
			local connection = RunService.Heartbeat:Connect(function() end)
			assert(typeof(connection) == "RBXScriptConnection", "Heartbeat did not return RBXScriptConnection")
			connection:Disconnect()
		end)

		it("uses real Instance character tree plumbing", function()
			-- Zune cannot catch Roblox Instance parenting, IsA, or destroy semantics.
			local character = Instance.new("Model")
			local root = Instance.new("Part")
			root.Name = "HumanoidRootPart"
			root.Position = Vector3.new(4, 5, 6)
			root.Parent = character
			character.Parent = game:GetService("Workspace")

			assert(character:FindFirstChild("HumanoidRootPart") == root, "root missing from character")
			assert(root:IsA("BasePart"), "root is not BasePart")

			character:Destroy()
			assert(root.Parent == nil, "destroy did not detach root")
		end)

		it("imports compiled ModuleScripts through real RuntimeLib path", function()
			-- Zune cannot catch real Rojo tree / RuntimeLib placement.
			local TS = require(ReplicatedStorage:WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
			local driver = TS.import(script, ServerScriptService, "TS", "test-driver")
			assert(type(driver.runTowerRobloxDriverSmoke) == "function", "driver import failed")
		end)

		it("mock-drives server player, fire, defeat, and restart", function()
			-- Zune already proves deterministic sim; Roblox here proves real Model/Part character input path.
			local TS = require(ReplicatedStorage:WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
			local driver = TS.import(script, ServerScriptService, "TS", "test-driver")
			local result = driver.runTowerRobloxDriverSmoke()

			assert(result.started, "app did not start")
			assert(result.rootSynced, "real HumanoidRootPart position did not sync into ECS")
			assert(result.zombiesSpawned >= 1, "expected zombie spawn")
			assert(result.zombiesKilled >= 1, "expected projectile kill")
			assert(result.shotsFired >= 1, "expected fire event")
			assert(result.snapshotCount >= 1, "expected snapshot")
			assert(result.defeatReached, "expected defeat")
			assert(result.restartApplied, "expected restart")
			assert(result.phase == "intermission", "expected intermission after restart")
			assert(result.waveNumber == 0, "expected wave reset")
			assert(result.playerHealth == 100, "expected player health reset")
		end)
	end)
end
