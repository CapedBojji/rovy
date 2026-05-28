return function()
	local ReplicatedStorage = game:GetService("ReplicatedStorage")
	local RunService = game:GetService("RunService")

	describe("multiplace arena real-engine path", function()
		it("imports compiled shared ModuleScript through real RuntimeLib path", function()
			-- Zune cannot catch real Rojo tree / RuntimeLib placement.
			local TS = require(ReplicatedStorage:WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
			local placeGame = TS.import(script, ReplicatedStorage, "Shared", "place-game")
			assert(placeGame.makePlaceBanner(placeGame.ArenaPlace) == "Rovy Arena place loaded", "arena module import failed")
		end)

		it("uses real Instance parenting and destroy semantics", function()
			-- Zune cannot catch native Instance parent/child behavior.
			local folder = Instance.new("Folder")
			folder.Name = "ArenaProbe"
			folder.Parent = ReplicatedStorage
			assert(ReplicatedStorage:FindFirstChild("ArenaProbe") == folder, "folder parent lookup failed")
			folder:Destroy()
			assert(folder.Parent == nil, "destroy did not detach folder")
		end)

		it("uses real RunService signal connections", function()
			-- Zune cannot catch native RBXScriptConnection shape.
			local connection = RunService.Heartbeat:Connect(function() end)
			assert(typeof(connection) == "RBXScriptConnection", "Heartbeat did not return RBXScriptConnection")
			connection:Disconnect()
		end)
	end)
end
