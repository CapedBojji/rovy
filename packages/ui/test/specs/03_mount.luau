--!nocheck
-- Mounting: instance trees, explicit vs implicit (ScreenGui) targets, nested
-- components, fragments (no wrapper instance), and false/undefined renders.

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)

	t.describe("mount → instance tree", function()
		t.it("parents native children in order under the target", function()
			H.reset()
			local Comp = H.uiClass("test/Order", function()
				return H.frame({ Name = "Root" }, {
					H.textLabel({ Name = "A" }),
					H.textLabel({ Name = "B" }),
					H.textLabel({ Name = "C" }),
				})
			end)
			local app = H.startedApp()
			local target = H.target()
			H.mountUi(app, Comp, { target = target })

			local root = target:FindFirstChild("Root")
			t.expect(root).toBeDefined()
			local names = {}
			for _, child in ipairs(root:GetChildren()) do
				table.insert(names, child.Name)
			end
			table.sort(names)
			t.expect(table.concat(names, ",")).toBe("A,B,C")
		end)

		t.it("applies native props to the created instance", function()
			H.reset()
			local Comp = H.uiClass("test/Props", function()
				return H.frame({ Name = "Root", Visible = false, LayoutOrder = 5 })
			end)
			local app = H.startedApp()
			local target = H.target()
			H.mountUi(app, Comp, { target = target })
			local root = target:FindFirstChild("Root")
			t.expect(root.Visible).toBe(false)
			t.expect(root.LayoutOrder).toBe(5)
		end)

		t.it("nested components chain instances", function()
			H.reset()
			local Leaf = H.uiClass("test/Leaf", function()
				return H.textLabel({ Name = "Leaf" })
			end)
			local Mid = H.uiClass("test/Mid", function()
				return H.frame({ Name = "Mid" }, H.child(Leaf, {}))
			end)
			local Root = H.uiClass("test/RootC", function()
				return H.frame({ Name = "Root" }, H.child(Mid, {}))
			end)
			local app = H.startedApp()
			local target = H.target()
			H.mountUi(app, Root, { target = target })

			local root = target:FindFirstChild("Root")
			local mid = root:FindFirstChild("Mid")
			t.expect(mid).toBeDefined()
			t.expect(mid:FindFirstChild("Leaf")).toBeDefined()
		end)

		t.it("fragments parent their children to the fragment's parent (no wrapper)", function()
			H.reset()
			local Comp = H.uiClass("test/Frag", function()
				return H.frame({ Name = "Root" }, {
					H.fragment({
						H.textLabel({ Name = "F1" }),
						H.textLabel({ Name = "F2" }),
					}),
				})
			end)
			local app = H.startedApp()
			local target = H.target()
			H.mountUi(app, Comp, { target = target })
			local root = target:FindFirstChild("Root")
			-- both fragment children are direct children of Root, no Fragment instance
			t.expect(root:FindFirstChild("F1")).toBeDefined()
			t.expect(root:FindFirstChild("F2")).toBeDefined()
			t.expect(#root:GetChildren()).toBe(2)
		end)

		t.it("render → false produces no instance", function()
			H.reset()
			local Comp = H.uiClass("test/Empty", function()
				return false
			end)
			local app = H.startedApp()
			local target = H.target()
			H.mountUi(app, Comp, { target = target })
			t.expect(#target:GetChildren()).toBe(0)
		end)
	end)

	t.describe("target resolution", function()
		t.it("defaults mount options when omitted", function()
			H.reset()
			local Comp = H.uiClass("test/NoOptions", function()
				return H.frame({ Name = "Root" })
			end)
			local app = H.startedApp()
			local handle = H.mountUi(app, Comp)
			local playerGui = _G.__rovyTestServices.Players.LocalPlayer:FindFirstChild("PlayerGui")
			local gui = playerGui:FindFirstChild("test_NoOptions")
			t.expect(gui).toBeDefined()
			t.expect(gui:FindFirstChild("Root")).toBeDefined()
			handle.destroy()
			t.expect(playerGui:FindFirstChild("test_NoOptions")).never.toBeDefined()
		end)

		t.it("no target → a ScreenGui parented into PlayerGui, sanitized name", function()
			H.reset()
			local Comp = H.uiClass("src/panels/Main", function()
				return H.frame({ Name = "Root" })
			end)
			local app = H.startedApp()
			local handle = H.mountUi(app, Comp, {})

			local players = _G.__rovyTestServices.Players
			local playerGui = players.LocalPlayer:FindFirstChild("PlayerGui")
			local gui = playerGui:FindFirstChild("src_panels_Main")
			t.expect(gui).toBeDefined()
			t.expect(gui.ClassName).toBe("ScreenGui")
			t.expect(gui.ResetOnSpawn).toBe(false)
			t.expect(gui.IgnoreGuiInset).toBe(true)
			t.expect(gui:FindFirstChild("Root")).toBeDefined()

			-- destroy removes the auto-created gui
			handle.destroy()
			t.expect(playerGui:FindFirstChild("src_panels_Main")).never.toBeDefined()
		end)

		t.it("explicit name overrides the sanitized default", function()
			H.reset()
			local Comp = H.uiClass("src/whatever", function()
				return H.frame({ Name = "Root" })
			end)
			local app = H.startedApp()
			H.mountUi(app, Comp, { name = "CustomName" })
			local playerGui = _G.__rovyTestServices.Players.LocalPlayer:FindFirstChild("PlayerGui")
			t.expect(playerGui:FindFirstChild("CustomName")).toBeDefined()
		end)

		t.it("explicit target takes precedence over name", function()
			H.reset()
			local Comp = H.uiClass("src/targetWins", function()
				return H.frame({ Name = "Root" })
			end)
			local app = H.startedApp()
			local target = H.target("TargetWins")
			H.mountUi(app, Comp, { target = target, name = "ShouldNotAppear" })

			t.expect(target:FindFirstChild("Root")).toBeDefined()
			local playerGui = _G.__rovyTestServices.Players.LocalPlayer:FindFirstChild("PlayerGui")
			t.expect(playerGui:FindFirstChild("ShouldNotAppear")).toBeUndefined()
		end)

		t.it("uses RovyUiRoot when the ui id has no path-safe characters", function()
			H.reset()
			local Comp = H.uiClass("", function()
				return H.frame({ Name = "Root" })
			end)
			local app = H.startedApp()
			local handle = H.mountUi(app, Comp, {})
			local playerGui = _G.__rovyTestServices.Players.LocalPlayer:FindFirstChild("PlayerGui")
			local gui = playerGui:FindFirstChild("RovyUiRoot")
			t.expect(gui).toBeDefined()
			t.expect(gui.Name).toBe("RovyUiRoot")
			t.expect(gui:FindFirstChild("Root")).toBeDefined()
			handle.destroy()
		end)

		t.it("uses WaitForChild fallback when PlayerGui direct lookup fails", function()
			H.reset()
			local players = _G.__rovyTestServices.Players
			local localPlayer = players.LocalPlayer
			local originalFind = localPlayer.FindFirstChildOfClass
			local originalWait = localPlayer.WaitForChild
			local originalNew = _G.Instance.new
			local captured
			_G.Instance.new = function(className, props)
				local created = originalNew(className, props)
				if className == "ScreenGui" and captured == nil then
					captured = created
				end
				return created
			end
			local originalPlayerGui = localPlayer:FindFirstChild("PlayerGui")
			local fallbackPlayerGui = originalPlayerGui or originalNew("PlayerGui")
			localPlayer.FindFirstChildOfClass = function()
				return nil
			end
			localPlayer.WaitForChild = function()
				return fallbackPlayerGui
			end

			local Comp = H.uiClass("test/NoPlayerGui", function()
				return H.frame({ Name = "Root" })
			end)
			local app = H.startedApp()
			local handle = H.mountUi(app, Comp, {})
			t.expect(captured).toBeDefined()
			t.expect(captured.Parent).toBe(fallbackPlayerGui)
			t.expect(captured:FindFirstChild("Root")).toBeDefined()

			handle.destroy()
			_G.Instance.new = originalNew
			localPlayer.FindFirstChildOfClass = originalFind
			localPlayer.WaitForChild = originalWait
		end)

		t.it("mounts with no PlayerGui target when both PlayerGui lookups fail", function()
			H.reset()
			local players = _G.__rovyTestServices.Players
			local localPlayer = players.LocalPlayer
			local originalFind = localPlayer.FindFirstChildOfClass
			local originalWait = localPlayer.WaitForChild
			local originalNew = _G.Instance.new
			local captured
			_G.Instance.new = function(className, props)
				local created = originalNew(className, props)
				if className == "ScreenGui" and captured == nil then
					captured = created
				end
				return created
			end
			localPlayer.FindFirstChildOfClass = function()
				return nil
			end
			localPlayer.WaitForChild = function()
				return nil
			end

			local Comp = H.uiClass("test/FallbackNoGui", function()
				return H.frame({ Name = "Root" })
			end)
			local app = H.startedApp()
			local handle = H.mountUi(app, Comp, {})
			t.expect(captured).toBeDefined()
			t.expect(captured.Parent).toBe(nil)
			t.expect(captured:FindFirstChild("Root")).toBeDefined()

			handle.destroy()
			_G.Instance.new = originalNew
			localPlayer.FindFirstChildOfClass = originalFind
			localPlayer.WaitForChild = originalWait
		end)

		t.it("mounts with no local player as well", function()
			H.reset()
			local players = _G.__rovyTestServices.Players
			local originalLocalPlayer = players.LocalPlayer
			local originalNew = _G.Instance.new
			local captured
			_G.Instance.new = function(className, props)
				local created = originalNew(className, props)
				if className == "ScreenGui" and captured == nil then
					captured = created
				end
				return created
			end
			players.LocalPlayer = nil

			local Comp = H.uiClass("test/NoLocalPlayer", function()
				return H.frame({ Name = "Root" })
			end)
			local app = H.startedApp()
			local handle = H.mountUi(app, Comp, {})
			t.expect(captured).toBeDefined()
			t.expect(captured.Parent).toBe(nil)

			handle.destroy()
			_G.Instance.new = originalNew
			players.LocalPlayer = originalLocalPlayer
		end)

		t.it("mounts with GetService('Players') throwing", function()
			H.reset()
			local originalGetService = _G.game.GetService
			local originalNew = _G.Instance.new
			local captured
			_G.Instance.new = function(className, props)
				local created = originalNew(className, props)
				if className == "ScreenGui" and captured == nil then
					captured = created
				end
				return created
			end
			_G.game.GetService = function(selfOrName, maybeName)
				if (maybeName or selfOrName) == "Players" then
					error("service not available", 2)
				end
				return originalGetService(selfOrName, maybeName)
			end

			local Comp = H.uiClass("test/NoPlayersService", function()
				return H.frame({ Name = "Root" })
			end)
			local app = H.startedApp()
			local handle = H.mountUi(app, Comp, {})
			t.expect(captured).toBeDefined()
			t.expect(captured.Parent).toBe(nil)
			t.expect(captured:FindFirstChild("Root")).toBeDefined()

			handle.destroy()
			_G.Instance.new = originalNew
			_G.game.GetService = originalGetService
		end)

		t.it("mounts when GetService('Players') returns nil", function()
			H.reset()
			local originalGetService = _G.game.GetService
			local originalNew = _G.Instance.new
			local captured
			_G.Instance.new = function(className, props)
				local created = originalNew(className, props)
				if className == "ScreenGui" and captured == nil then
					captured = created
				end
				return created
			end
			_G.game.GetService = function(selfOrName, maybeName)
				local name = maybeName or selfOrName
				if name == "Players" then
					return nil
				end
				return originalGetService(selfOrName, maybeName)
			end

			local Comp = H.uiClass("test/PlayersNil", function()
				return H.frame({ Name = "Root" })
			end)
			local app = H.startedApp()
			local handle = H.mountUi(app, Comp, {})

			t.expect(captured).toBeDefined()
			t.expect(captured.Parent).toBe(nil)
			t.expect(captured:FindFirstChild("Root")).toBeDefined()

			handle.destroy()
			_G.Instance.new = originalNew
			_G.game.GetService = originalGetService
		end)

		t.it("forwards mount options props into the root component", function()
			H.reset()
			local Comp = H.uiClass("test/OptionsProps", function(self)
				return H.textLabel({ Name = "Root", Text = "who=" .. tostring(self.props.who) })
			end)
			local app = H.startedApp()
			local target = H.target()
			local handle = H.mountUi(app, Comp, { target = target, props = { who = "alice" } })
			t.expect(target:FindFirstChild("Root").Text).toBe("who=alice")
			handle.destroy()
		end)
	end)
end
