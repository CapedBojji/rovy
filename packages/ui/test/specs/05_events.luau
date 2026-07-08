--!nocheck
-- Event connections via the `events` prop: connect, swap handler, drop one
-- event, clear the whole events prop, ignore non-functions, and disconnect on
-- destroy. Handlers receive (instance, ...signalArgs).

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)

	local function mountControlled(initialEvents)
		local Bump = H.rerenderResource()
		local ctrl = { events = initialEvents }
		local Comp = H.uiClass("test/EventsRoot", function()
			return H.native("TextButton", { Name = "Btn", events = ctrl.events })
		end, { triggers = { H.resourceTrigger(Bump) } })
		local app = H.startedApp()
		local target = H.target()
		local handle = H.mountUi(app, Comp, { target = target })
		return app, target, ctrl, handle
	end

	t.describe("patchEvents", function()
		t.it("connects a handler that receives (instance, ...args)", function()
			H.reset()
			local seen = {}
			local app, target = mountControlled({
				Activated = function(instance, a, b)
					table.insert(seen, { instance = instance, a = a, b = b })
				end,
			})
			local btn = target:FindFirstChild("Btn")
			btn.Activated:Fire("x", "y")
			t.expect(#seen).toBe(1)
			t.expect(seen[1].instance).toBe(btn)
			t.expect(seen[1].a).toBe("x")
			t.expect(seen[1].b).toBe("y")
		end)

		t.it("swapping the handler disconnects the old one", function()
			H.reset()
			local oldCount, newCount = 0, 0
			local app, target, ctrl = mountControlled({
				Activated = function()
					oldCount += 1
				end,
			})
			local btn = target:FindFirstChild("Btn")
			ctrl.events = {
				Activated = function()
					newCount += 1
				end,
			}
			H.bump(app)
			btn.Activated:Fire()
			t.expect(oldCount).toBe(0)
			t.expect(newCount).toBe(1)
		end)

		t.it("dropping an event name disconnects just that one", function()
			H.reset()
			local clicks, moves = 0, 0
			local app, target, ctrl = mountControlled({
				Activated = function() clicks += 1 end,
				MouseMoved = function() moves += 1 end,
			})
			local btn = target:FindFirstChild("Btn")
			ctrl.events = { MouseMoved = function() moves += 1 end }
			H.bump(app)
			btn.Activated:Fire()
			btn.MouseMoved:Fire()
			t.expect(clicks).toBe(0)
			t.expect(moves).toBe(1)
		end)

		t.it("disconnects a handler when its callback stops being a function", function()
			H.reset()
			local clicks = 0
			local app, target, ctrl = mountControlled({
				Activated = function() clicks += 1 end,
			})
			local btn = target:FindFirstChild("Btn")
			btn.Activated:Fire()
			t.expect(clicks).toBe(1)

			ctrl.events = { Activated = 42 }
			H.bump(app)
			btn.Activated:Fire()
			t.expect(clicks).toBe(1)
		end)

		t.it("keeps callback connections when events becomes non-table and reconnects on table reuse", function()
			H.reset()
			local clicks = 0
			local app, target, ctrl = mountControlled({
				Activated = function()
					clicks += 1
				end,
			})
			local btn = target:FindFirstChild("Btn")
			btn.Activated:Fire()
			t.expect(clicks).toBe(1)

			ctrl.events = 0
			H.bump(app)
			btn.Activated:Fire()
			t.expect(clicks).toBe(2)

			local rebound = 0
			ctrl.events = {
				Activated = function()
					rebound += 1
				end,
			}
			H.bump(app)
			btn.Activated:Fire()
			t.expect(clicks).toBe(2)
			t.expect(rebound).toBe(1)
		end)

		t.it("does not react to in-place event table mutations", function()
			H.reset()
			local clicks = 0
			local events = {
				Activated = function()
					clicks += 1
				end,
			}
			local app, target, ctrl = mountControlled(events)
			local btn = target:FindFirstChild("Btn")
			btn.Activated:Fire()
			t.expect(clicks).toBe(1)

			events.Activated = nil
			H.bump(app)
			btn.Activated:Fire()
			t.expect(clicks).toBe(2)

			local swapped = 0
			ctrl.events = {
				Activated = function()
				swapped += 1
			end,
			}
			H.bump(app)
			btn.Activated:Fire()
			t.expect(clicks).toBe(2)
			t.expect(swapped).toBe(1)

			ctrl.events = { Activated = nil }
			H.bump(app)
			btn.Activated:Fire()
			t.expect(swapped).toBe(1)
		end)

		t.it("ignores callbacks for event names with no Roblox signal", function()
			H.reset()
			local app, target = mountControlled({
				NoSuchSignal = function()
					error("should not run")
				end,
			})
			local btn = target:FindFirstChild("Btn")
			-- the fake Instance has no such signal, and this should not throw or connect
			t.expect(btn.NoSuchSignal).toBeUndefined()
		end)

		t.it("removing the whole events prop disconnects all connections", function()
			H.reset()
			local clicks = 0
			local app, target, ctrl = mountControlled({
				Activated = function() clicks += 1 end,
			})
			local btn = target:FindFirstChild("Btn")
			ctrl.events = nil
			H.bump(app)
			btn.Activated:Fire()
			t.expect(clicks).toBe(0)
		end)

		t.it("non-function event values are ignored", function()
			H.reset()
			local app, target = mountControlled({ Activated = 42 })
			local btn = target:FindFirstChild("Btn")
			-- firing must not error and nothing is connected
			t.expect(function()
				btn.Activated:Fire()
			end).never.toThrow()
		end)

		t.it("destroy disconnects event connections", function()
			H.reset()
			local clicks = 0
			local app, target, ctrl, handle = mountControlled({
				Activated = function() clicks += 1 end,
			})
			local btn = target:FindFirstChild("Btn")
			handle.destroy()
			btn.Activated:Fire()
			t.expect(clicks).toBe(0)
		end)
	end)
end
