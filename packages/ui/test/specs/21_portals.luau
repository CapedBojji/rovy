--!nocheck
-- Portals render retained children into external GUI/world targets while their
-- lifecycle stays owned by the logical root. Runtime mounts remain available
-- for independently managed roots such as per-unit BillboardGuis.

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)

	t.describe("runtime GUI roots", function()
		t.it("adds independent roots to BillboardGui and SurfaceGui after app.start", function()
			H.reset()
			local Root = H.uiClass("test/RuntimeWorldRoot", function(self)
				return H.textLabel({ Name = "Info", Text = self.props.text })
			end)
			local app = H.startedApp()
			local billboard = _G.Instance.new("BillboardGui")
			local surface = _G.Instance.new("SurfaceGui")

			local billboardHandle = H.mountUi(app, Root, {
				target = billboard,
				props = { text = "unit" },
			})
			app:flush()
			local surfaceHandle = H.mountUi(app, Root, {
				target = surface,
				props = { text = "terminal" },
			})

			t.expect(billboard:FindFirstChild("Info").Text).toBe("unit")
			t.expect(surface:FindFirstChild("Info").Text).toBe("terminal")

			billboardHandle.destroy()
			t.expect(billboard:FindFirstChild("Info")).never.toBeDefined()
			t.expect(surface:FindFirstChild("Info")).toBeDefined()
			t.expect(billboard.Destroyed).never.toBe(true)

			surfaceHandle.destroy()
			t.expect(surface:FindFirstChild("Info")).never.toBeDefined()
			t.expect(surface.Destroyed).never.toBe(true)
		end)
	end)

	t.describe("portal targets", function()
		t.it("renders into existing ScreenGui, BillboardGui, and SurfaceGui targets", function()
			H.reset()
			local screen = _G.Instance.new("ScreenGui")
			local billboard = _G.Instance.new("BillboardGui")
			local surface = _G.Instance.new("SurfaceGui")
			local Root = H.uiClass("test/PortalTargets", function()
				return H.fragment({
					H.portal(screen, H.frame({ Name = "ScreenContent" }), { key = "screen" }),
					H.portal(billboard, H.frame({ Name = "BillboardContent" }), { key = "billboard" }),
					H.portal(surface, H.frame({ Name = "SurfaceContent" }), { key = "surface" }),
				})
			end)
			local app = H.startedApp()
			local logicalTarget = H.target("LogicalRoot")
			local handle = H.mountUi(app, Root, { target = logicalTarget })

			t.expect(screen:FindFirstChild("ScreenContent")).toBeDefined()
			t.expect(billboard:FindFirstChild("BillboardContent")).toBeDefined()
			t.expect(surface:FindFirstChild("SurfaceContent")).toBeDefined()
			t.expect(#logicalTarget:GetChildren()).toBe(0)

			handle.destroy()
			t.expect(screen:FindFirstChild("ScreenContent")).never.toBeDefined()
			t.expect(billboard:FindFirstChild("BillboardContent")).never.toBeDefined()
			t.expect(surface:FindFirstChild("SurfaceContent")).never.toBeDefined()
			t.expect(screen.Destroyed).never.toBe(true)
			t.expect(billboard.Destroyed).never.toBe(true)
			t.expect(surface.Destroyed).never.toBe(true)
		end)

		t.it("can create owned GUI hosts under world and player targets", function()
			H.reset()
			local head = _G.Instance.new("Part")
			local displayPart = _G.Instance.new("Part")
			local playerGui = _G.Instance.new("PlayerGui")
			local Root = H.uiClass("test/PortalHosts", function()
				return H.fragment({
					H.portal(head, H.billboardGui({
						Name = "UnitBillboard",
						Adornee = head,
					}, H.textLabel({ Name = "UnitName", Text = "Scout" })), { key = "unit" }),
					H.portal(displayPart, H.surfaceGui({
						Name = "WorldDisplay",
						Adornee = displayPart,
					}, H.textLabel({ Name = "DisplayText", Text = "Ready" })), { key = "display" }),
					H.portal(playerGui, H.screenGui({
						Name = "HudScreen",
					}, H.frame({ Name = "HudFrame" })), { key = "hud" }),
				})
			end)
			local app = H.startedApp()
			local logicalTarget = H.target("LogicalHostRoot")
			local handle = H.mountUi(app, Root, { target = logicalTarget })

			local billboard = head:FindFirstChild("UnitBillboard")
			local surface = displayPart:FindFirstChild("WorldDisplay")
			local screen = playerGui:FindFirstChild("HudScreen")
			t.expect(billboard.ClassName).toBe("BillboardGui")
			t.expect(billboard.Adornee).toBe(head)
			t.expect(billboard:FindFirstChild("UnitName").Text).toBe("Scout")
			t.expect(surface.ClassName).toBe("SurfaceGui")
			t.expect(surface.Adornee).toBe(displayPart)
			t.expect(surface:FindFirstChild("DisplayText").Text).toBe("Ready")
			t.expect(screen.ClassName).toBe("ScreenGui")
			t.expect(screen:FindFirstChild("HudFrame")).toBeDefined()

			handle.destroy()
			t.expect(billboard.Destroyed).toBe(true)
			t.expect(surface.Destroyed).toBe(true)
			t.expect(screen.Destroyed).toBe(true)
			t.expect(head.Destroyed).never.toBe(true)
			t.expect(displayPart.Destroyed).never.toBe(true)
			t.expect(playerGui.Destroyed).never.toBe(true)
		end)

		t.it("reconciles in place and moves the subtree when a portal target changes", function()
			H.reset()
			local Bump = H.rerenderResource()
			local first = _G.Instance.new("BillboardGui")
			local second = _G.Instance.new("BillboardGui")
			local state = { target = first, text = "100" }
			local Root = H.uiClass("test/StablePortal", function()
				return H.portal(state.target, H.textLabel({
					Name = "Health",
					Text = state.text,
				}), { key = "health" })
			end, { triggers = { H.resourceTrigger(Bump) } })
			local app = H.startedApp()
			local handle = H.mountUi(app, Root, { target = H.target("LogicalStable") })
			local before = first:FindFirstChild("Health")

			state.text = "75"
			H.bump(app, Bump)
			local after = first:FindFirstChild("Health")
			t.expect(after).toBe(before)
			t.expect(after.Text).toBe("75")
			t.expect(before.Destroyed).never.toBe(true)

			state.target = second
			H.bump(app, Bump)
			local moved = second:FindFirstChild("Health")
			t.expect(first:FindFirstChild("Health")).never.toBeDefined()
			t.expect(moved == before).toBe(true)
			t.expect(moved.Parent == second).toBe(true)
			t.expect(moved.Text).toBe("75")

			handle.destroy()
		end)

		t.it("adds and removes keyed unit portals during reconciliation", function()
			H.reset()
			local Bump = H.rerenderResource()
			local targets = {
				a = _G.Instance.new("BillboardGui"),
				b = _G.Instance.new("BillboardGui"),
				c = _G.Instance.new("BillboardGui"),
			}
			local units = { "a", "b" }
			local renders = 0
			local Root = H.uiClass("test/DynamicPortals", function()
				renders += 1
				local children = {}
				for _, id in ipairs(units) do
					table.insert(children, H.portal(
						targets[id],
						H.textLabel({ Name = "Tag_" .. id, Text = id }),
						{ key = id }
					))
				end
				return H.fragment(children)
			end, { triggers = { H.resourceTrigger(Bump) } })
			local app = H.startedApp()
			H.mountUi(app, Root, { target = H.target("LogicalUnits") })
			local oldA = targets.a:FindFirstChild("Tag_a")
			local oldB = targets.b:FindFirstChild("Tag_b")

			units = { "c", "b" }
			H.bump(app, Bump)
			local newB = targets.b:FindFirstChild("Tag_b")
			local newC = targets.c:FindFirstChild("Tag_c")
			t.expect(renders).toBe(2)
			t.expect(newC ~= nil).toBe(true)
			t.expect(oldA.Destroyed == true).toBe(true)
			t.expect(targets.a:FindFirstChild("Tag_a") == nil).toBe(true)
			t.expect(newB == oldB).toBe(true)
			t.expect(oldB.Destroyed).never.toBe(true)
		end)
	end)
end
