--!nocheck
-- NetClient / NetServer: every method enqueues the right mode + target.

local nethelp = require("../harness/net")

return function(TS, t)
	local clientNet = nethelp.load(TS, "client")
	local serverNet = nethelp.load(TS, "server")

	local Snap = nethelp.eventClass({ "n" })
	local snapSend = nethelp.reg(Snap, { id = "g/Snap", name = "Snap", direction = "serverToClient", receive = "send", fields = { "n" } })
	local Fx = nethelp.eventClass({ "n" })
	local fxTrig = nethelp.reg(Fx, { id = "g/Fx", name = "Fx", direction = "serverToClient", receive = "trigger", fields = { "n" } })
	local Cmd = nethelp.eventClass({ "n" })
	local cmdSend = nethelp.reg(Cmd, { id = "g/Cmd", name = "Cmd", direction = "clientToServer", receive = "send", fields = { "n" } })
	local Ping = nethelp.eventClass({ "n" })
	local pingTrig = nethelp.reg(Ping, { id = "g/Ping", name = "Ping", direction = "clientToServer", receive = "trigger", fields = { "n" } })

	local function clientRuntime()
		return clientNet.NetClientRuntime.new({ snapSend, fxTrig, cmdSend, pingTrig })
	end
	local function serverRuntime()
		return serverNet.NetServerRuntime.new({ snapSend, fxTrig, cmdSend, pingTrig })
	end
	local p1 = { Name = "p1" }
	local p2 = { Name = "p2" }

	t.describe("NetClient", function()
		t.it("send enqueues mode=send target=server", function()
			local r = clientRuntime()
			r.client:send(Cmd.new(1))
			local item = r:drainOutbox()[1]
			t.expect(item.mode).toBe("send")
			t.expect(item.target.kind).toBe("server")
		end)

		t.it("trigger enqueues mode=trigger", function()
			local r = clientRuntime()
			r.client:trigger(Ping.new(1))
			t.expect(r:drainOutbox()[1].mode).toBe("trigger")
		end)
	end)

	t.describe("NetServer targets", function()
		local function only(r)
			local out = r:drainOutbox()
			t.expect(#out).toBe(1)
			return out[1]
		end

		t.it("send → player", function()
			local r = serverRuntime()
			r.server:send(p1, Snap.new(1))
			local i = only(r)
			t.expect(i.mode).toBe("send")
			t.expect(i.target.kind).toBe("player")
			t.expect(i.target.player).toBe(p1)
		end)

		t.it("trigger → player", function()
			local r = serverRuntime()
			r.server:trigger(p1, Fx.new(1))
			local i = only(r)
			t.expect(i.mode).toBe("trigger")
			t.expect(i.target.player).toBe(p1)
		end)

		t.it("broadcast → broadcast/send", function()
			local r = serverRuntime()
			r.server:broadcast(Snap.new(1))
			local i = only(r)
			t.expect(i.target.kind).toBe("broadcast")
			t.expect(i.mode).toBe("send")
		end)

		t.it("broadcastTrigger → broadcast/trigger", function()
			local r = serverRuntime()
			r.server:broadcastTrigger(Fx.new(1))
			local i = only(r)
			t.expect(i.target.kind).toBe("broadcast")
			t.expect(i.mode).toBe("trigger")
		end)

		t.it("sendList → players", function()
			local r = serverRuntime()
			r.server:sendList({ p1, p2 }, Snap.new(1))
			local i = only(r)
			t.expect(i.target.kind).toBe("players")
			t.expect(#i.target.players).toBe(2)
		end)

		t.it("triggerList → players/trigger", function()
			local r = serverRuntime()
			r.server:triggerList({ p1 }, Fx.new(1))
			local i = only(r)
			t.expect(i.target.kind).toBe("players")
			t.expect(i.mode).toBe("trigger")
		end)

		t.it("broadcastExcept → broadcastExcept", function()
			local r = serverRuntime()
			r.server:broadcastExcept(p2, Snap.new(1))
			local i = only(r)
			t.expect(i.target.kind).toBe("broadcastExcept")
			t.expect(i.target.except).toBe(p2)
		end)

		t.it("broadcastTriggerExcept → broadcastExcept/trigger", function()
			local r = serverRuntime()
			r.server:broadcastTriggerExcept(p1, Fx.new(1))
			local i = only(r)
			t.expect(i.target.kind).toBe("broadcastExcept")
			t.expect(i.mode).toBe("trigger")
		end)
	end)
end
