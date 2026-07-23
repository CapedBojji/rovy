--!nocheck
-- Phase 23 — runtime boundary validation for handwritten Luau registrations.

return function(TS, t)
	local rovy = (TS.loadPath("out/rovy") :: any).rovy
	local App = (TS.loadPath("out/runtime/app") :: any).App

	local function class()
		local C = {}
		C.__index = C
		C.new = function()
			return setmetatable({}, C)
		end
		C.run = function() end
		return C
	end

	local function registerComponent(ctor, id, boundary)
		rovy:__component(ctor, id)
		rovy:__boundary(ctor, boundary)
	end

	local function query(id, terms, filters)
		rovy:__query({ id = id, terms = terms, filters = filters or {} })
	end

	t.describe("Phase 23 — runtime query boundaries", function()
		t.it("rejects a client system querying a server component", function()
			rovy:__reset()
			local Update, ServerData, ClientSystem = class(), class(), class()
			rovy:__schedule(Update, { runOnStart = false })
			registerComponent(ServerData, "t/ServerData", "server")
			query("q/server", { { t = "component", ctor = ServerData } })
			rovy:__system(ClientSystem, {
				id = "t/ClientSystem", schedule = Update,
				params = { { kind = "query", handle = "q/server" } },
			})
			rovy:__boundary(ClientSystem, "client")
			t.expect(function()
				App.new():start()
			end).toThrow()
		end)

		t.it("rejects observer filter terms across boundaries", function()
			rovy:__reset()
			local ServerData, Pulse, Observer = class(), class(), class()
			registerComponent(ServerData, "t/ServerData", "server")
			rovy:__event(Pulse, {})
			query("q/filter", { { t = "entity" } }, { without = { ServerData } })
			rovy:__observer(Observer, {
				event = Pulse, priority = 0,
				params = { { kind = "query", handle = "q/filter" } },
			})
			rovy:__boundary(Observer, "client")
			t.expect(function()
				App.new():start()
			end).toThrow()
		end)

		t.it("rejects monitor match and injected queries", function()
			rovy:__reset()
			local ServerData, Monitor = class(), class()
			Monitor.onEnter = function() end
			registerComponent(ServerData, "t/ServerData", "server")
			query("q/match", { { t = "optional", ctor = ServerData } })
			query("q/param", { { t = "entity" } }, { changed = { ServerData } })
			rovy:__monitor(Monitor, {
				match = "q/match", methods = { "onEnter" },
				params = { { kind = "query", handle = "q/param" } },
			})
			rovy:__boundary(Monitor, "client")
			t.expect(function()
				App.new():start()
			end).toThrow()
		end)

		t.it("expands trait filters to boundary-marked implementers", function()
			rovy:__reset()
			local Update, ServerImpl, ClientSystem = class(), class(), class()
			rovy:__schedule(Update, { runOnStart = false })
			registerComponent(ServerImpl, "t/ServerImpl", "server")
			rovy:__traitImpl("t/Trait", ServerImpl)
			query("q/trait", { { t = "entity" } }, { hasTrait = { "t/Trait" } })
			rovy:__system(ClientSystem, {
				id = "t/ClientSystem", schedule = Update,
				params = { { kind = "query", handle = "q/trait" } },
			})
			rovy:__boundary(ClientSystem, "client")
			t.expect(function()
				App.new():start()
			end).toThrow()
		end)

		t.it("allows same-side and shared components", function()
			rovy:__reset()
			local Update, ClientData, SharedData, ClientSystem = class(), class(), class(), class()
			rovy:__schedule(Update, { runOnStart = false })
			registerComponent(ClientData, "t/ClientData", "client")
			registerComponent(SharedData, "t/SharedData", "shared")
			query("q/allowed", {
				{ t = "component", ctor = ClientData },
				{ t = "optional", ctor = SharedData },
			})
			rovy:__system(ClientSystem, {
				id = "t/ClientSystem", schedule = Update,
				params = { { kind = "query", handle = "q/allowed" } },
			})
			rovy:__boundary(ClientSystem, "client")
			t.expect(function()
				App.new():start()
			end).never.toThrow()
		end)
	end)
end
