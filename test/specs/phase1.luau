--!nocheck
-- Phase 1 exit spec: rovy.__* push fns populate the registry; loadPaths
-- delegates to the (injectable) module provider; traitToken returns a handle.
-- Runs against the compiled out/ artifact (what ships).

return function(TS, t)
	local rovy = (TS.loadPath("out/rovy") :: any).rovy

	t.describe("rovy registry (Phase 1)", function()
		t.it("starts empty after __reset", function()
			rovy:__reset()
			t.expect(#rovy.registry.components).toBe(0)
			t.expect(#rovy.registry.systems).toBe(0)
		end)

		t.it("__component / __resource / __event push entries", function()
			rovy:__reset()
			local Position = {}
			local BattleClock = {}
			local DamageTaken = {}
			rovy:__component(Position, "src/components/Position")
			rovy:__resource(BattleClock, "src/resources/BattleClock")
			rovy:__event(DamageTaken, { capacity = 256 })

			t.expect(#rovy.registry.components).toBe(1)
			t.expect(rovy.registry.components[1].ctor).toBe(Position)
			t.expect(rovy.registry.components[1].id).toBe("src/components/Position")
			t.expect(#rovy.registry.resources).toBe(1)
			t.expect(rovy.registry.events[1].capacity).toBe(256)
		end)

		t.it("__system / __observer / __monitor carry param descriptors", function()
			rovy:__reset()
			local Sys, Obs, Mon, Evt, Upd = {}, {}, {}, {}, {}
			rovy:__system(Sys, {
				id = "src/systems/Sys",
				schedule = Upd,
				params = { { kind = "commands" }, { kind = "query", handle = "q#0" } },
			})
			rovy:__observer(Obs, { event = Evt, priority = 5, params = { { kind = "event" } } })
			rovy:__monitor(Mon, { match = "q#m", methods = { "onEnter" }, params = {} })

			t.expect(rovy.registry.systems[1].id).toBe("src/systems/Sys")
			t.expect(rovy.registry.systems[1].params[2].handle).toBe("q#0")
			t.expect(rovy.registry.observers[1].priority).toBe(5)
			t.expect(rovy.registry.monitors[1].methods[1]).toBe("onEnter")
		end)

		t.it("__traitImpl accumulates implementers per trait id", function()
			rovy:__reset()
			local Stunned, Rooted = {}, {}
			rovy:__traitImpl("src/traits/CrowdControl", Stunned)
			rovy:__traitImpl("src/traits/CrowdControl", Rooted)
			local impls = rovy.registry.traits["src/traits/CrowdControl"]
			t.expect(impls).toBeDefined()
			t.expect(#impls).toBe(2)
		end)

		t.it("__query stores hoisted descriptor by id", function()
			rovy:__reset()
			rovy:__query({ id = "src/systems/S:0", terms = {}, filters = {} })
			t.expect(rovy.registry.queries["src/systems/S:0"]).toBeDefined()
		end)

		t.it("traitToken returns a stable-id handle", function()
			local token = rovy:traitToken("src/traits/CrowdControl")
			t.expect(token.__rovyTraitId).toBe("src/traits/CrowdControl")
		end)

		t.it("loadPaths delegates to the injected module provider", function()
			local seen = nil
			rovy:setModuleProvider(function(roots)
				seen = roots
			end)
			rovy:loadPaths("a", "b")
			t.expect(seen).toBeDefined()
			t.expect(#seen).toBe(2)
			t.expect(seen[1]).toBe("a")
		end)
	end)
end
