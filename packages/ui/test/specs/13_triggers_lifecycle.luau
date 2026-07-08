--!nocheck
-- $lifecycleTrigger: re-render on an ECS lifecycle event (entity spawn), with
-- the render seeing the up-to-date world.

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)

	t.describe("$lifecycleTrigger", function()
	t.it("re-renders when an entity spawns", function()
			H.reset()
			local Health = H.class(function(v)
				return { value = v or 1 }
			end)
			H.rovy:__component(Health, "test/Health")
			H.rovy:__query({
				id = "q#all",
				terms = { { t = "entity" }, { t = "component", ctor = Health } },
				filters = {},
			})
			local stats = { renders = 0 }
			local Comp = H.uiClass("test/LifecycleBadge", function(self, q)
				stats.renders += 1
				return H.textLabel({ Name = "Status", Text = "seen=" .. tostring(q:size()) })
			end, {
				params = { { kind = "query", handle = "q#all" } },
				triggers = { H.lifecycleTrigger("entity_spawned") },
			})

			local app = H.startedApp()
			local target = H.target()
			H.mountUi(app, Comp, { target = target })
			t.expect(stats.renders).toBe(1)

			app.world:spawn(Health.new(10))
			H.settle(app)
			t.expect(stats.renders > 1).toBeTruthy()
			t.expect(target:FindFirstChild("Status").Text).toBe("seen=1")

			app.world:spawn(Health.new(20))
			H.settle(app)
			t.expect(target:FindFirstChild("Status").Text).toBe("seen=2")
		end)

		t.it("re-renders only when the lifecycle event ctor matches", function()
			H.reset()
			local Health = H.class(function(v)
				return { value = v or 1 }
			end)
			local Shield = H.class(function(v)
				return { value = v or 9 }
			end)
			H.rovy:__component(Health, "test/Health")
			H.rovy:__component(Shield, "test/Shield")
			local stats = { renders = 0 }
			local Comp = H.uiClass("test/LifecycleCtor", function()
				stats.renders += 1
				return H.textLabel({ Name = "Status", Text = "renders=" .. tostring(stats.renders) })
			end, {
				triggers = { H.lifecycleTrigger("component_added", { ctor = Health }) },
			})

			local app = H.startedApp()
			H.mountUi(app, Comp, { target = H.target() })
			t.expect(stats.renders).toBe(1)

			local entity = app.world:spawn()
			app.world:insert(entity, Shield.new(4))
			H.settle(app)
			t.expect(stats.renders).toBe(1)

			app.world:insert(entity, Health.new(10))
			H.settle(app)
			t.expect(stats.renders).toBe(2)
		end)

		t.it("unsubscribes on destroy", function()
			H.reset()
			H.rovy:__component(H.class(function() return {} end), "test/Noop")
			local stats = { renders = 0 }
			local Comp = H.uiClass("test/LB2", function()
				stats.renders += 1
				return H.textLabel({ Name = "x" })
			end, {
				triggers = { H.lifecycleTrigger("entity_spawned") },
			})
			local app = H.startedApp()
			local handle = H.mountUi(app, Comp, { target = H.target() })
			handle.destroy()
			app.world:spawn()
			H.settle(app)
			t.expect(stats.renders).toBe(1)
		end)
	end)
end
