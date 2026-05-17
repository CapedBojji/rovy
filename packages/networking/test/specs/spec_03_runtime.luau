--!nocheck
-- runtime: boundary / direction / receive-mode guards, outbox draining,
-- receive() dispatch + sender context.

local nethelp = require("../harness/net")

return function(TS, t)
	local net = TS.loadPath("out/init")

	local Intent = nethelp.eventClass({ "value" })
	local intentReg = nethelp.reg(Intent, {
		id = "g/Intent",
		name = "Intent",
		direction = "clientToServer",
		receive = "send",
		fields = { "value" },
	})
	local Effect = nethelp.eventClass({ "kind" })
	local effectReg = nethelp.reg(Effect, {
		id = "g/Effect",
		name = "Effect",
		direction = "serverToClient",
		receive = "trigger",
		fields = { "kind" },
	})

	local function runtime()
		return net.NetRuntime.new({ intentReg, effectReg })
	end

	t.describe("runtime guards", function()
		t.it("unknown boundary skips boundary assertion", function()
			local rt = runtime()
			rt.client:send(Intent.new(1))
			t.expect(#rt:drainClientOutbox()).toBe(1)
		end)

		t.it("client boundary rejects NetServer use", function()
			local rt = runtime()
			rt:setBoundary("client")
			t.expect(function()
				rt.server:broadcast(Effect.new("x"))
			end).toThrow()
		end)

		t.it("server boundary rejects NetClient use", function()
			local rt = runtime()
			rt:setBoundary("server")
			t.expect(function()
				rt.client:send(Intent.new(1))
			end).toThrow()
		end)

		t.it("direction mismatch throws", function()
			local rt = runtime()
			t.expect(function()
				rt.client:send(Effect.new("x"))
			end).toThrow()
		end)

		t.it("receive-mode mismatch throws (send vs trigger)", function()
			local rt = runtime()
			t.expect(function()
				rt.server:send({}, Effect.new("x"))
			end).toThrow()
		end)

		t.it("unregistered event throws on enqueue", function()
			local rt = runtime()
			local Stray = nethelp.eventClass({ "n" })
			t.expect(function()
				rt.client:send(Stray.new(1))
			end).toThrow()
		end)
	end)

	t.describe("runtime receive", function()
		t.it("send-mode event lands via commands:send", function()
			local rt = runtime()
			local cmd = nethelp.commands()
			local e = Intent.new(5)
			rt:receive(e, cmd)
			t.expect(cmd.sent[1]).toBe(e)
			t.expect(#cmd.triggered).toBe(0)
		end)

		t.it("trigger-mode event lands via commands:trigger", function()
			local rt = runtime()
			local cmd = nethelp.commands()
			local e = Effect.new("boom")
			rt:receive(e, cmd)
			t.expect(cmd.triggered[1]).toBe(e)
		end)

		t.it("sender is recorded in NetEventContext", function()
			local rt = runtime()
			local cmd = nethelp.commands()
			local player = { Name = "P1" }
			local e = Intent.new(2)
			rt:receive(e, cmd, player)
			t.expect(rt.context:senderOf(e)).toBe(player)
		end)

		t.it("drainClientOutbox empties the buffer", function()
			local rt = runtime()
			rt.client:send(Intent.new(1))
			rt.client:send(Intent.new(2))
			t.expect(#rt:drainClientOutbox()).toBe(2)
			t.expect(#rt:drainClientOutbox()).toBe(0)
		end)
	end)
end
