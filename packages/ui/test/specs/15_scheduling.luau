--!nocheck
-- Dirty scheduling & flushing: multiple triggers firing in one flush coalesce
-- to a single render, distinct nodes each render once, a no-op flush renders
-- nothing, and draining the deferred task queue never double-renders.

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)

	t.describe("dirty scheduling", function()
		t.it("coalesces two triggers firing in one flush into a single render", function()
			H.reset()
			local Bump = H.rerenderResource()
			local Marker = H.class(function() return {} end)
			H.rovy:__component(Marker, "test/Marker")
			local stats = { renders = 0 }
			local Comp = H.uiClass("test/Coalesce", function()
				stats.renders += 1
				return H.textLabel({ Name = "x" })
			end, {
				triggers = { H.resourceTrigger(Bump), H.lifecycleTrigger("entity_spawned") },
			})
			local app = H.startedApp()
			H.mountUi(app, Comp, { target = H.target() })
			t.expect(stats.renders).toBe(1)

			-- one flush in which BOTH triggers fire → node marked dirty twice →
			-- deduped by the dirty Set → exactly one extra render.
			app.world:insertResource(Bump.new(1))
			app.world:spawn(Marker.new())
			H.settle(app)
			t.expect(stats.renders).toBe(2)
		end)

		t.it("renders each distinct dirty node once per shared flush", function()
			H.reset()
			local Bump = H.rerenderResource()
			local a, b = { renders = 0 }, { renders = 0 }
			local A = H.uiClass("test/NodeA", function()
				a.renders += 1
				return H.textLabel({ Name = "A" })
			end, { triggers = { H.resourceTrigger(Bump) } })
			local B = H.uiClass("test/NodeB", function()
				b.renders += 1
				return H.textLabel({ Name = "B" })
			end, { triggers = { H.resourceTrigger(Bump) } })
			local app = H.startedApp()
			H.mountUi(app, A, { target = H.target() })
			H.mountUi(app, B, { target = H.target() })
			t.expect(a.renders).toBe(1)
			t.expect(b.renders).toBe(1)

			H.bump(app)
			t.expect(a.renders).toBe(2)
			t.expect(b.renders).toBe(2)
		end)

		t.it("a flush with nothing dirty renders nothing", function()
			H.reset()
			local Bump = H.rerenderResource()
			local stats = { renders = 0 }
			local Comp = H.uiClass("test/Idle", function()
				stats.renders += 1
				return H.textLabel({ Name = "x" })
			end, { triggers = { H.resourceTrigger(Bump) } })
			local app = H.startedApp()
			H.mountUi(app, Comp, { target = H.target() })
			t.expect(stats.renders).toBe(1)

			app:flush()
			if _G.__rovyDrainTasks then _G.__rovyDrainTasks() end
			t.expect(stats.renders).toBe(1)
		end)

		t.it("draining the deferred queue after a settle does not double-render", function()
			H.reset()
			local Bump = H.rerenderResource()
			local stats = { renders = 0 }
			local Comp = H.uiClass("test/NoDouble", function()
				stats.renders += 1
				return H.textLabel({ Name = "x" })
			end, { triggers = { H.resourceTrigger(Bump) } })
			local app = H.startedApp()
			H.mountUi(app, Comp, { target = H.target() })

			H.bump(app)
			t.expect(stats.renders).toBe(2)
			-- extra drains + flushes must be inert
			_G.__rovyDrainTasks()
			app:flush()
			_G.__rovyDrainTasks()
			t.expect(stats.renders).toBe(2)
			t.expect(_G.__rovyPendingTasks()).toBe(0)
		end)

		t.it("flushes again when a node is re-marked during a render", function()
			H.reset()
			local Bump = H.rerenderResource()
			local app
			local stats = { renders = 0 }
			local Comp = H.uiClass("test/ReentrantFlush", function()
				stats.renders += 1
				if stats.renders == 2 then
					app.world:insertResource(Bump.new(2))
				end
				return H.textLabel({ Name = "x" })
			end, {
				params = { { kind = "res", ctor = Bump } },
				triggers = { H.resourceTrigger(Bump) },
			})
			app = H.startedApp()
			H.mountUi(app, Comp, { target = H.target() })

			app.world:insertResource(Bump.new(1))
			H.settle(app)
			t.expect(stats.renders).toBe(3)
		end)
	end)
end
