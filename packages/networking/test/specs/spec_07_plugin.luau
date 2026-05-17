--!nocheck
-- NetPlugin end-to-end against real @rovy/core. Normal user path is backend
-- auto-install at App:start(); this spec keeps explicit plugin coverage for
-- advanced/internal transport setup and schedule wiring.

local nethelp = require("../harness/net")

return function(TS, t)
	local net = TS.loadPath("out/init")
	local core = TS.import(nil, TS.getModule(nil, "@rovy", "rovy-core"))
	local rovy = core.rovy
	local App = core.App

	t.describe("NetPlugin transport selection", function()
		t.it("defaults to RemoteEventTransport", function()
			local p = net.NetPlugin.new()
			t.expect(getmetatable(p.transport)).toBe(net.RemoteEventTransport)
		end)

		t.it("uses BlinkTransport when a blink module is given", function()
			local p = net.NetPlugin.new({ blink = {} })
			t.expect(getmetatable(p.transport)).toBe(net.BlinkTransport)
		end)

		t.it("honours an explicit transport override", function()
			local lb = net.LoopbackTransport.new()
			local p = net.NetPlugin.new({ transport = lb })
			t.expect(p.transport).toBe(lb)
		end)
	end)

	t.describe("NetPlugin manual step (no schedule)", function()
		t.it("exposes manualStep that flushes the outbox", function()
			net.rovyNet:__reset()
			local Cmd = nethelp.eventClass({ "n" })
			net.rovyNet:__netEvent(Cmd, {
				id = "g/Cmd", name = "Cmd", direction = "clientToServer",
				channel = "reliable", receive = "send", fields = { "n" },
			})
			local lb = net.LoopbackTransport.new()
			local plugin = net.NetPlugin.new({ transport = lb, boundary = "client" })
			-- build() needs an app for insertParam; a tiny stub suffices here.
			local stub = { insertParam = function() end }
			plugin:build(stub)
			t.expect(plugin.manualStep).toBeDefined()
			plugin.runtime.client:send(Cmd.new(3))
			plugin:manualStep(nethelp.commands())
			t.expect(#lb.sent).toBe(1)
			t.expect(lb.sent[1].payload.n).toBe(3)
		end)
	end)

	t.describe("NetPlugin scheduled round-trip", function()
		t.it("auto-wires receive+flush; params injected; no hand setup", function()
			rovy:__reset()
			net.rovyNet:__reset()

			local Update = {}
			local AppSet = {}

			local Ping = nethelp.eventClass({ "seq" })
			local Snap = nethelp.eventClass({ "tick" })
			net.rovyNet:__netEvent(Ping, {
				id = "g/Ping", name = "Ping", direction = "clientToServer",
				channel = "reliable", receive = "send", fields = { "seq" },
			})
			net.rovyNet:__netEvent(Snap, {
				id = "g/Snap", name = "Snap", direction = "serverToClient",
				channel = "reliable", receive = "send", fields = { "tick" },
			})
			rovy:__event(Ping, {})
			rovy:__schedule(Update, { runOnStart = false })

			local seen = {}
			local Reader = {}
			Reader.__index = Reader
			function Reader.new()
				return setmetatable({}, Reader)
			end
			function Reader:run(reader)
				reader:forEach(function(e)
					table.insert(seen, e.seq)
				end)
			end

			local Sender = {}
			Sender.__index = Sender
			function Sender.new()
				return setmetatable({}, Sender)
			end
			function Sender:run(server)
				server:broadcast(Snap.new(99))
			end

			rovy:__system(Reader, {
				id = "t/Reader", schedule = Update, set = AppSet,
				params = { { kind = "eventReader", ctor = Ping } },
			})
			rovy:__system(Sender, {
				id = "t/Sender", schedule = Update, set = AppSet,
				params = { { kind = "external", id = net.NET_SERVER_PARAM } },
			})

			local pluginT = net.LoopbackTransport.new()
			local peer = net.LoopbackTransport.new({ Name = "client" })
			net.connectLoopback(pluginT, peer)
			peer:start({ boundary = "client", deliver = function() end })

			local plugin = net.NetPlugin.new({
				schedule = Update,
				transport = pluginT,
				boundary = "server",
			})
			local app = App.new()
			app:addPlugin(plugin)
			app:configureSets(Update, { AppSet })
			app:start()

			-- receive + flush systems auto-registered into the given schedule.
			local ids = {}
			for _, s in rovy.registry.systems do
				ids[s.id] = true
			end
			t.expect(ids["@rovy/networking/RovyNetReceive:" .. tostring(Update)]).toBeTruthy()
			t.expect(ids["@rovy/networking/RovyNetFlush:" .. tostring(Update)]).toBeTruthy()

			-- A simulated client sends Ping before tick 1.
			peer:send({ meta = { name = "Ping" }, target = { kind = "server" } }, { seq = 7 })

			-- One tick: receive (before gameplay) → reader sees Ping;
			-- gameplay broadcast → flush (after gameplay) → Snap on the wire.
			app:runSchedule(Update)
			t.expect(#pluginT.sent).toBe(1)
			t.expect(pluginT.sent[1].payload.tick).toBe(99)
			t.expect(#seen).toBe(1)
			t.expect(seen[1]).toBe(7)
		end)
	end)

	t.describe("App.start auto-install", function()
		t.it("injects net params and wires receive/flush without manual plugin setup", function()
			rovy:__reset()
			net.rovyNet:__reset()

			local Update = {}
			local AppSet = {}
			local Ping = nethelp.eventClass({ "seq" })
			net.rovyNet:__netEvent(Ping, {
				id = "g/Ping", name = "Ping", direction = "serverToClient",
				channel = "reliable", receive = "send", fields = { "seq" },
			})
			rovy:__event(Ping, {})
			rovy:__schedule(Update, { runOnStart = false })

			local seenNet = false
			local Sender = {}
			Sender.__index = Sender
			function Sender.new()
				return setmetatable({}, Sender)
			end
			function Sender:run(_server)
				seenNet = true
			end

			rovy:__system(Sender, {
				id = "t/Sender", schedule = Update, set = AppSet,
				params = { { kind = "external", id = net.NET_SERVER_PARAM } },
			})

			local app = App.new()
			app:configureSets(Update, { AppSet })
			app:start()
			app:runSchedule(Update)

			local ids = {}
			for _, s in rovy.registry.systems do
				ids[s.id] = true
			end
			t.expect(ids["@rovy/networking/RovyNetReceive:" .. tostring(Update)]).toBeTruthy()
			t.expect(ids["@rovy/networking/RovyNetFlush:" .. tostring(Update)]).toBeTruthy()
			t.expect(seenNet).toBeTruthy()
		end)
	end)
end
