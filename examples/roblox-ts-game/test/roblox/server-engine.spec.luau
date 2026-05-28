return function()
	local ReplicatedStorage = game:GetService("ReplicatedStorage")
	local RunService = game:GetService("RunService")

	describe("example game real-engine path", function()
		it("imports compiled shared ModuleScript through real RuntimeLib path", function()
			-- Zune cannot catch real Rojo tree / RuntimeLib placement.
			local TS = require(ReplicatedStorage:WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
			local module = TS.import(script, ReplicatedStorage, "TS", "module")
			assert(module.makeSmokeBanner("roblox") == "Rovy integration loaded from roblox", "shared module import failed")
		end)

		it("uses real Instance parenting and destroy semantics", function()
			-- Zune cannot catch native Instance parent/child behavior.
			local folder = Instance.new("Folder")
			folder.Name = "RovyRuntimeCheck"
			folder.Parent = ReplicatedStorage
			local marker = Instance.new("BoolValue")
			marker.Name = "Marker"
			marker.Parent = folder

			assert(folder:FindFirstChild("Marker") == marker, "child lookup failed")
			folder:Destroy()
			assert(marker.Parent == nil, "destroy did not detach child")
		end)

		it("uses real RunService signal connections", function()
			-- Zune cannot catch native RBXScriptConnection shape.
			local connection = RunService.Heartbeat:Connect(function() end)
			assert(typeof(connection) == "RBXScriptConnection", "Heartbeat did not return RBXScriptConnection")
			connection:Disconnect()
		end)
	end)
end
