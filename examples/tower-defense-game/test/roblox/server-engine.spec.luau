return function()
	local ReplicatedStorage = game:GetService("ReplicatedStorage")
	local RunService = game:GetService("RunService")

	describe("tower defense real-engine path", function()
		it("boots server smoke through real engine path", function()
			-- Zune cannot prove Studio output wiring; this intentionally drives server app in Roblox.
			local TS = require(ReplicatedStorage:WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
			local gameModule = TS.import(script, game:GetService("ServerScriptService"), "TS", "game")
			local result = gameModule.runTowerDefenseSmoke(1)

			assert(result.started, "server app did not start")
			assert(result.monstersSpawned >= 1, "expected monsters")
			assert(result.snapshotCount >= 1, "expected snapshots")
			assert(result.clientHeartbeatApplied, "expected client heartbeat")
		end)

		it("imports compiled shared ModuleScripts through real RuntimeLib path", function()
			-- Zune cannot catch real Rojo tree / RuntimeLib placement.
			local TS = require(ReplicatedStorage:WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
			local contracts = TS.import(script, ReplicatedStorage, "TS", "contracts")
			local network = TS.import(script, ReplicatedStorage, "TS", "network")
			local payload = contracts.ClientHeartbeatPayload.new(7, 0.25, 3)
			local event = network.toClientHeartbeatNet(payload)

			assert(event.clientFrame == 7, "client heartbeat frame did not round-trip")
			assert(event.clientTime == 0.25, "client heartbeat time did not round-trip")
			assert(event.lastSnapshotTick == 3, "client heartbeat snapshot tick did not round-trip")
		end)

		it("uses real Instance parenting and destroy semantics", function()
			-- Zune cannot catch native Instance parent/child behavior.
			local part = Instance.new("Part")
			part.Name = "TowerDefenseProbe"
			part.Anchored = true
			part.Parent = game:GetService("Workspace")
			assert(game:GetService("Workspace"):FindFirstChild("TowerDefenseProbe") == part, "workspace lookup failed")
			part:Destroy()
			assert(part.Parent == nil, "destroy did not detach part")
		end)

		it("uses real RunService signal connections", function()
			-- Zune cannot catch native RBXScriptConnection shape.
			local connection = RunService.Heartbeat:Connect(function() end)
			assert(typeof(connection) == "RBXScriptConnection", "Heartbeat did not return RBXScriptConnection")
			connection:Disconnect()
		end)
	end)
end
