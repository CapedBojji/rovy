--!nocheck
-- A companion package's event named in `static rerender`.
--
-- @rovy/scribe publishes through core's ordinary buffered path:
-- ScribeEventRuntime.flush does `commands.send(new Ctor())` with the user's
-- @scribeEvent class, and the transformer registers that same class as a core
-- event (`rovy.__event(...)`) beside the scribe registration, so a trigger
-- naming the class subscribes to the constructor the runtime actually sends.
--
-- @rovy/datastore takes the same path with a constructor its registry mints per
-- (kind, documentId); test/place covers that one against a real DataModel.
--
-- Deliberately numbered to run early. The fake Instance layer keeps every
-- instance it ever created in one list and GetChildren scans all of it, so by
-- the end of the suite a recursive tree walk overflows the C stack. Pruning
-- destroyed entries on reset breaks the portal specs, which revive reparented
-- instances, so this spec sits ahead of that growth instead.

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)

	t.describe("package-owned event triggers", function()
		t.it("re-renders on a scribe-style event sent through commands", function()
			H.reset()
			-- Shaped like what the transformer emits for an @scribeEvent class.
			local ScribeCoinsChanged = H.class(function(after)
				return { after = after or 0 }
			end)
			H.rovy:__event(ScribeCoinsChanged, { capacity = 8 })

			local stats = { renders = 0 }
			local Comp = H.uiClass("test/ScribeCoinsLabel", function(self)
				stats.renders += 1
				return H.textLabel({ Name = "Status", Text = "renders=" .. tostring(stats.renders) })
			end, {
				triggers = { H.eventTrigger(ScribeCoinsChanged) },
			})

			local app = H.startedApp()
			H.mountUi(app, Comp, { target = H.target() })
			t.expect(stats.renders).toBe(1)

			-- Exactly what ScribeEventRuntime.flush does for a profile change.
			app.commands:send(ScribeCoinsChanged.new(10))
			H.settle(app)

			t.expect(stats.renders).toBe(2)
		end)
	end)
end
