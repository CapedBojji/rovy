--!nocheck
-- Phase 13 — collector registration contract. Proves the frozen registry
-- boundary now carries collectors and collect param descriptors.

return function(TS, t)
	local rovy = (TS.loadPath("out/rovy") :: any).rovy

	t.describe("Phase 13 — collector registry contract", function()
		t.it("__collect pushes entries into the registry", function()
			rovy:__reset()
			local Inbox = {}
			rovy:__collect(Inbox, "src/collectors/Inbox")

			t.expect(#rovy.registry.collectors).toBe(1)
			t.expect(rovy.registry.collectors[1].ctor).toBe(Inbox)
			t.expect(rovy.registry.collectors[1].id).toBe("src/collectors/Inbox")
		end)

		t.it("systems/observers/monitors can carry collect param descriptors", function()
			rovy:__reset()
			local Inbox, Sys, Obs, Mon, Evt, Upd = {}, {}, {}, {}, {}, {}
			rovy:__collect(Inbox, "t/Inbox")
			rovy:__system(Sys, {
				id = "t/Sys",
				schedule = Upd,
				params = { { kind = "collect", ctor = Inbox } },
			})
			rovy:__observer(Obs, {
				event = Evt,
				priority = 0,
				params = { { kind = "event" }, { kind = "collect", ctor = Inbox } },
			})
			rovy:__monitor(Mon, {
				match = "t/Q",
				methods = { "onEnter" },
				params = { { kind = "entity" }, { kind = "collect", ctor = Inbox } },
			})

			t.expect(rovy.registry.systems[1].params[1].kind).toBe("collect")
			t.expect(rovy.registry.observers[1].params[2].kind).toBe("collect")
			t.expect(rovy.registry.monitors[1].params[2].kind).toBe("collect")
		end)
	end)
end
