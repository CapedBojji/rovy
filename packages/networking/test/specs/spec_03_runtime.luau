--!nocheck
local nethelp = require("../harness/net")

return function(TS, t)
	local clientNet = nethelp.load(TS, "client")
	local serverNet = nethelp.load(TS, "server")

	local Intent = nethelp.eventClass({ "value" })
	local intentReg = nethelp.reg(Intent, {
		id = "g/Intent", name = "Intent", direction = "clientToServer",
		receive = "send", fields = { "value" },
	})
	local Effect = nethelp.eventClass({ "kind" })
	local effectReg = nethelp.reg(Effect, {
		id = "g/Effect", name = "Effect", direction = "serverToClient",
		receive = "trigger", fields = { "kind" },
	})

	local function clientRuntime()
		return clientNet.NetClientRuntime.new({ intentReg, effectReg })
	end
	local function serverRuntime()
		return serverNet.NetServerRuntime.new({ intentReg, effectReg })
	end

	t.describe("split runtime guards", function()
		t.it("runtimes have fixed boundaries", function()
			t.expect(clientRuntime():getBoundary()).toBe("client")
			t.expect(serverRuntime():getBoundary()).toBe("server")
		end)

		t.it("direction mismatch throws on each side", function()
			t.expect(function()
				clientRuntime().client:send(Effect.new("x"))
			end).toThrow()
			t.expect(function()
				serverRuntime().server:broadcast(Intent.new(1))
			end).toThrow()
		end)

		t.it("receive-mode mismatch throws", function()
			t.expect(function()
				serverRuntime().server:send({}, Effect.new("x"))
			end).toThrow()
		end)

		t.it("unregistered event throws", function()
			local Stray = nethelp.eventClass({ "n" })
			t.expect(function()
				clientRuntime().client:send(Stray.new(1))
			end).toThrow()
		end)
	end)

	t.describe("split runtime receive", function()
		t.it("client dispatches inbound server event", function()
			local rt = clientRuntime()
			local cmd = nethelp.commands()
			local event = Effect.new("boom")
			rt:receive(event, cmd)
			t.expect(cmd.triggered[1]).toBe(event)
		end)

		t.it("server records sender context", function()
			local rt = serverRuntime()
			local cmd = nethelp.commands()
			local player = { Name = "P1" }
			local event = Intent.new(2)
			rt:receive(event, cmd, player)
			t.expect(rt.context:senderOf(event)).toBe(player)
		end)

		t.it("client drain empties buffer", function()
			local rt = clientRuntime()
			rt.client:send(Intent.new(1))
			rt.client:send(Intent.new(2))
			t.expect(#rt:drainOutbox()).toBe(2)
			t.expect(#rt:drainOutbox()).toBe(0)
		end)
	end)
end
