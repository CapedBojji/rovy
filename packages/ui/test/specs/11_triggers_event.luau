--!nocheck
-- $eventTrigger: a component re-renders when an event is triggered and drained.

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)

	local function setup()
		local DamagePulse = H.class(function(amount)
			return { amount = amount or 0 }
		end)
		H.rovy:__event(DamagePulse, { capacity = 8 })
		local stats = { renders = 0 }
		local Comp = H.uiClass("test/EventBadge", function(self)
			stats.renders += 1
			return H.textLabel({ Name = "Status", Text = "renders=" .. tostring(stats.renders) })
		end, {
			triggers = { H.eventTrigger(DamagePulse) },
		})
		return DamagePulse, Comp, stats
	end

	t.describe("$eventTrigger", function()
		t.it("produces a { kind = 'event', ctor } descriptor", function()
			local FakeCtor = {}
			local descriptor = H.eventTrigger(FakeCtor)
			t.expect(descriptor.kind).toBe("event")
			t.expect(descriptor.ctor).toBe(FakeCtor)
		end)

		t.it("re-renders when the event is triggered", function()
			H.reset()
			local DamagePulse, Comp, stats = setup()
			local app = H.startedApp()
			local target = H.target()
			H.mountUi(app, Comp, { target = target })
			t.expect(stats.renders).toBe(1)

			app.world:trigger(DamagePulse.new(36))
			H.settle(app)
			t.expect(stats.renders > 1).toBeTruthy()
			t.expect(target:FindFirstChild("Status").Text).toBe("renders=" .. tostring(stats.renders))
		end)

		t.it("stops re-rendering after destroy", function()
			H.reset()
			local DamagePulse, Comp, stats = setup()
			local app = H.startedApp()
			local handle = H.mountUi(app, Comp, { target = H.target() })
			local afterMount = stats.renders

			handle.destroy()
			app.world:trigger(DamagePulse.new(1))
			H.settle(app)
			t.expect(stats.renders).toBe(afterMount)
		end)

		t.it("also re-renders when an event is sent through app.commands", function()
			H.reset()
			local DamagePulse, Comp, stats = setup()
			local app = H.startedApp()
			H.mountUi(app, Comp, { target = H.target() })
			t.expect(stats.renders).toBe(1)

			app.commands:send(DamagePulse.new(2))
			H.settle(app)
			t.expect(stats.renders).toBe(2)
		end)

		t.it("re-renders via post-flush event reader size even without an event observer callback", function()
			H.reset()
			local DamagePulse, Comp, stats = setup()
			local app = H.startedApp()
			local eventRegistry = app.eventRegistry
			local originalObserve = eventRegistry.observe
			eventRegistry.observe = function()
				return function() end
			end
			local handle = H.mountUi(app, Comp, { target = H.target() })
			app.commands:send(DamagePulse.new(3))
			H.settle(app)
			t.expect(stats.renders).toBe(2)

			eventRegistry.observe = originalObserve
			handle.destroy()
		end)

		t.it("throws when the event trigger points to an unregistered event", function()
			H.reset()
			local NoEvent = H.class(function()
				return {}
			end)
			local Comp = H.uiClass("test/BadEventTrigger", function()
				return H.textLabel({ Name = "x" })
			end, {
				triggers = { H.eventTrigger(NoEvent) },
			})
			local app = H.startedApp()
			t.expect(function()
				H.mountUi(app, Comp, { target = H.target() })
			end).toThrow()
		end)
	end)
end
