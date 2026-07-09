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

	-- flushDirty pcall-isolates each node's render(): a throw must not starve
	-- sibling nodes in the same flush, must not propagate out of app:flush(),
	-- and must not leave state.flushing stuck true (which would silently
	-- freeze every future re-render for the mount).
	t.describe("render failure resilience", function()
		t.it("isolates a throwing render: warns, does not propagate, and does not starve a sibling in the same flush", function()
			H.reset()
			local Bump = H.rerenderResource()
			local aStats, bStats = { renders = 0 }, { renders = 0 }
			local A = H.uiClass("test/Thrower", function()
				aStats.renders += 1
				if aStats.renders == 2 then error("boom") end
				return H.textLabel({ Name = "A" })
			end, { triggers = { H.resourceTrigger(Bump) } })
			local B = H.uiClass("test/Healthy", function()
				bStats.renders += 1
				return H.textLabel({ Name = "B" })
			end, { triggers = { H.resourceTrigger(Bump) } })
			-- Mount both under one root so a single flushDirty pass carries both
			-- dirty nodes (separate H.mountUi calls would give each its own
			-- MountedUiState and flush independently).
			local Root = H.uiClass("test/SiblingRoot", function()
				return H.frame({ Name = "Root" }, {
					H.child(A, {}, { key = "a" }),
					H.child(B, {}, { key = "b" }),
				})
			end)
			local app = H.startedApp()
			H.mountUi(app, Root, { target = H.target() })
			t.expect(aStats.renders).toBe(1)
			t.expect(bStats.renders).toBe(1)

			t.expect(function()
				H.bump(app)
			end).never.toThrow()

			t.expect(aStats.renders).toBe(2)
			t.expect(bStats.renders).toBe(2) -- sibling still rendered in the same flush
			t.expect(#_G.__rovyWarnings).toBe(1)
			t.expect(string.find(_G.__rovyWarnings[1], "test/Thrower", 1, true) ~= nil).toBe(true)
			t.expect(string.find(_G.__rovyWarnings[1], "boom", 1, true) ~= nil).toBe(true)
		end)

		t.it("self-heals: a failed render does not wedge future flushes for the mount", function()
			H.reset()
			local Bump = H.rerenderResource()
			local stats = { renders = 0 }
			local Comp = H.uiClass("test/HealAfterThrow", function()
				stats.renders += 1
				if stats.renders == 2 then error("boom") end
				return H.textLabel({ Name = "x" })
			end, { triggers = { H.resourceTrigger(Bump) } })
			local app = H.startedApp()
			H.mountUi(app, Comp, { target = H.target() })
			t.expect(stats.renders).toBe(1)

			H.bump(app) -- render #2 throws; caught + warned
			t.expect(stats.renders).toBe(2)
			t.expect(#_G.__rovyWarnings).toBe(1)

			-- state.flushing must have been reset — a further trigger still
			-- renders instead of being silently dropped.
			H.bump(app)
			t.expect(stats.renders).toBe(3)
		end)

		t.it("the failed node itself recovers on its next trigger", function()
			H.reset()
			local Bump = H.rerenderResource()
			local stats = { renders = 0 }
			local Comp = H.uiClass("test/RecoversNode", function()
				stats.renders += 1
				if stats.renders == 2 then error("boom") end
				return H.textLabel({ Name = "x", Text = tostring(stats.renders) })
			end, { triggers = { H.resourceTrigger(Bump) } })
			local app = H.startedApp()
			local target = H.target()
			H.mountUi(app, Comp, { target = target })

			H.bump(app) -- throws, node stays out of state.dirty afterward
			H.bump(app) -- next trigger re-marks it dirty and it renders successfully
			t.expect(stats.renders).toBe(3)
			t.expect(H.hasText(target, "3")).toBeTruthy()
		end)
	end)
end
