return function()
	local ReplicatedStorage = game:GetService("ReplicatedStorage")
	local RunService = game:GetService("RunService")
	local ServerScriptService = game:GetService("ServerScriptService")

	describe("zombie game real-engine path", function()
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
			assert(type(driver.runZombieRobloxDriverSmoke) == "function", "driver import failed")
		end)

		it("preserves RovyUi root nodes inside inspected resources", function()
			local TS = require(ReplicatedStorage:WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
			local core = TS.import(script, ReplicatedStorage, "rbxts_include", "node_modules", "@rovy", "core", "out")
			local ui = TS.import(script, ReplicatedStorage, "rbxts_include", "node_modules", "@rovy", "ui", "out")
			local RovyWorld = core.RovyWorld
			local markResourceCloneByReference = core.markResourceCloneByReference
			local RovyUi = ui.default

			local function class(init)
				local C = {}
				C.__index = C
				C.new = function(...)
					local self = setmetatable({}, C)
					if init then
						init(self, ...)
					end
					return self
				end
				return C
			end

			local UiState = class(function(self)
				self.node = RovyUi.new(Instance.new("ScreenGui"))
				self.localRef = markResourceCloneByReference({
					queue = {},
					push = function(localSelf, value)
						table.insert(localSelf.queue, value)
					end,
					drain = function(localSelf)
						local out = localSelf.queue
						localSelf.queue = {}
						return out
					end,
				})
				self.nested = { count = 0 }
			end)
			local holder = {}

			local world = RovyWorld.new()
			world:registerResourceEntry({
				ctor = UiState,
				id = "test/UiState",
				inspect = {
					fields = {
						{ key = "node", typeLabel = "table", validator = function()
							return true
						end },
						{ key = "localRef", typeLabel = "table", validator = function()
							return true
						end },
						{ key = "nested", typeLabel = "table", validator = function()
							return true
						end },
					},
				},
			})
			holder.raw = UiState.new()
			world:setResource(UiState, holder.raw)

			local scope = world:beginResourceScope()
			local state = world:resolveResourceForInjection(UiState, false, scope)
			holder.paramWasRaw = state == holder.raw
			holder.nodeWasRaw = state.node == holder.raw.node
			holder.localWasRaw = state.localRef == holder.raw.localRef
			holder.nestedWasRaw = state.nested == holder.raw.nested
			state.localRef:push("clicked")
			state.nested.count += 1
			world:commitResourceScope(scope)

			local live = world:resource(UiState)
			assert(holder.paramWasRaw and live == holder.raw, "resource container was replaced")
			assert(holder.nodeWasRaw and live.node == holder.raw.node, "RovyUi root node was replaced")
			assert(holder.localWasRaw and live.localRef == holder.raw.localRef, "marked local ref was replaced")
			assert(#holder.raw.localRef:drain() == 1, "local ref mutation did not hit original ref")
			assert(holder.nestedWasRaw and live.nested == holder.raw.nested, "normal nested table was replaced")
			assert(live.nested.count == 1, "nested mutation did not commit")
		end)

		it("mock-drives server player, fire, defeat, and restart", function()
			-- Zune already proves deterministic sim; Roblox here proves real Model/Part character input path.
			local TS = require(ReplicatedStorage:WaitForChild("rbxts_include"):WaitForChild("RuntimeLib"))
			local driver = TS.import(script, ServerScriptService, "TS", "test-driver")
			local result = driver.runZombieRobloxDriverSmoke()

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
