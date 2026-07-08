--!nocheck
-- Destruction & cleanup: the whole instance subtree is destroyed, trigger
-- subscriptions are released, conditional subtrees are destroyed when they stop
-- rendering, and destroy is idempotent + leaves the app flushable.

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)

	t.describe("destroy", function()
		t.it("destroys the entire instance subtree", function()
			H.reset()
			local Comp = H.uiClass("test/Tree", function()
				return H.frame({ Name = "Root" }, {
					H.textLabel({ Name = "A" }),
					H.frame({ Name = "B" }, { H.textLabel({ Name = "B1" }) }),
				})
			end)
			local app = H.startedApp()
			local target = H.target()
			local handle = H.mountUi(app, Comp, { target = target })

			local root = target:FindFirstChild("Root")
			local a = root:FindFirstChild("A")
			local b = root:FindFirstChild("B")
			local b1 = b:FindFirstChild("B1")

			handle.destroy()
			t.expect(root.Destroyed).toBe(true)
			t.expect(a.Destroyed).toBe(true)
			t.expect(b.Destroyed).toBe(true)
			t.expect(b1.Destroyed).toBe(true)
			t.expect(target:FindFirstChild("Root")).never.toBeDefined()
		end)

		t.it("removes a conditional subtree when it stops rendering", function()
			H.reset()
			local Bump = H.rerenderResource()
			local ctrl = { show = true }
			local Comp = H.uiClass("test/Conditional", function()
				return H.frame({ Name = "Root" }, {
					ctrl.show and H.textLabel({ Name = "Maybe" }) or false,
				})
			end, { triggers = { H.resourceTrigger(Bump) } })
			local app = H.startedApp()
			local target = H.target()
			H.mountUi(app, Comp, { target = target })
			local root = target:FindFirstChild("Root")
			local maybe = root:FindFirstChild("Maybe")
			t.expect(maybe).toBeDefined()

			ctrl.show = false
			H.bump(app)
			t.expect(maybe.Destroyed).toBe(true)
			t.expect(root:FindFirstChild("Maybe")).never.toBeDefined()

			-- and it comes back on the next truthy render
			ctrl.show = true
			H.bump(app)
			t.expect(root:FindFirstChild("Maybe")).toBeDefined()
		end)

		t.it("is idempotent and leaves the app flushable", function()
			H.reset()
			local Theme = H.class(function(v) return { value = v or 0 } end)
			H.rovy:__resource(Theme, "test/Theme")
			local stats = { renders = 0 }
			local Comp = H.uiClass("test/Idem", function(self, theme)
				stats.renders += 1
				return H.textLabel({ Name = "x" })
			end, {
				params = { { kind = "res", ctor = Theme } },
				triggers = { H.resourceTrigger(Theme) },
			})
			local app = H.startedApp()
			local handle = H.mountUi(app, Comp, { target = H.target() })

			handle.destroy()
			t.expect(function()
				handle.destroy() -- second destroy is a no-op
			end).never.toThrow()

			-- app keeps working; the torn-down ui does not react or error
			t.expect(function()
				app.world:insertResource(Theme.new(5))
				H.settle(app)
			end).never.toThrow()
			t.expect(stats.renders).toBe(1)
		end)

		t.it("supports destroying during a rerender without leaking renders", function()
			H.reset()
			local Bump = H.rerenderResource()
			local stats = { renders = 0 }
			local handle
			local destroyOnSecond = false
			local Comp = H.uiClass("test/SelfDestroy", function()
				stats.renders += 1
				if destroyOnSecond and stats.renders == 2 and handle ~= nil then
					handle.destroy()
				end
				return H.textLabel({ Name = "SelfDestroy" })
			end, { triggers = { H.resourceTrigger(Bump) } })
			local app = H.startedApp()
			local target = H.target()
			handle = H.mountUi(app, Comp, { target = target })
			t.expect(stats.renders).toBe(1)
			local node = target:FindFirstChild("SelfDestroy")
			t.expect(node).toBeDefined()

			destroyOnSecond = true
			H.bump(app)
			t.expect(stats.renders).toBe(2)
			t.expect(node.Destroyed).toBe(true)

			t.expect(function()
				app.world:insertResource(Bump.new(99))
				H.settle(app)
			end).never.toThrow()
			t.expect(stats.renders).toBe(2)
		end)

		t.it("destroys nodes held inside a fragment subtree", function()
			H.reset()
			local Comp = H.uiClass("test/FragmentDestroy", function()
				return H.fragment({
					H.textLabel({ Name = "One" }),
					H.textLabel({ Name = "Two" }),
				})
			end)
			local app = H.startedApp()
			local target = H.target()
			local handle = H.mountUi(app, Comp, { target = target })
			local one = target:FindFirstChild("One")
			local two = target:FindFirstChild("Two")
			t.expect(one).toBeDefined()
			t.expect(two).toBeDefined()

			handle.destroy()
			t.expect(one.Destroyed).toBe(true)
			t.expect(two.Destroyed).toBe(true)
			t.expect(target:FindFirstChild("One")).never.toBeDefined()
			t.expect(target:FindFirstChild("Two")).never.toBeDefined()
		end)
	end)
end
