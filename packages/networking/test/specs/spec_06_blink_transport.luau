--!nocheck
-- BlinkTransport: dispatches to the right Blink Fire* per target/boundary and
-- drains Iter() inbound on pump(); commit() calls StepReplication.

local nethelp = require("../harness/net")

local function fakeEvent()
	local ev = { sent = {}, queue = {} }
	ev.Fire = function(a, b)
		table.insert(ev.sent, { kind = "fire", a = a, b = b })
	end
	ev.FireAll = function(d)
		table.insert(ev.sent, { kind = "all", data = d })
	end
	ev.FireList = function(list, d)
		table.insert(ev.sent, { kind = "list", list = list, data = d })
	end
	ev.FireExcept = function(ex, d)
		table.insert(ev.sent, { kind = "except", except = ex, data = d })
	end
	ev.Iter = function()
		local i = 0
		return function()
			i += 1
			local item = ev.queue[i]
			if item == nil then
				return nil
			end
			return i, item[1], item[2]
		end
	end
	return ev
end

return function(TS, t)
	local net = TS.loadPath("out/init")

	local C2S = nethelp.eventClass({ "n" })
	local c2sReg = nethelp.reg(C2S, { name = "C2S", direction = "clientToServer", fields = { "n" } })
	local S2C = nethelp.eventClass({ "n" })
	local s2cReg = nethelp.reg(S2C, { name = "S2C", direction = "serverToClient", fields = { "n" } })

	t.describe("BlinkTransport server send", function()
		local function setup()
			local mod = { C2S = fakeEvent(), S2C = fakeEvent(), steps = 0 }
			mod.StepReplication = function()
				mod.steps += 1
			end
			local tr = net.BlinkTransport.new(mod, { c2sReg, s2cReg })
			tr:start({ boundary = "server", deliver = function() end })
			return mod, tr
		end

		t.it("player target → Fire(player,payload)", function()
			local mod, tr = setup()
			local p = { Name = "p" }
			tr:send({ meta = s2cReg, target = { kind = "player", player = p } }, { n = 1 })
			t.expect(mod.S2C.sent[1].kind).toBe("fire")
			t.expect(mod.S2C.sent[1].a).toBe(p)
		end)

		t.it("broadcast → FireAll", function()
			local mod, tr = setup()
			tr:send({ meta = s2cReg, target = { kind = "broadcast" } }, { n = 2 })
			t.expect(mod.S2C.sent[1].kind).toBe("all")
		end)

		t.it("players → FireList; except → FireExcept", function()
			local mod, tr = setup()
			tr:send({ meta = s2cReg, target = { kind = "players", players = { 1, 2 } } }, { n = 3 })
			tr:send({ meta = s2cReg, target = { kind = "broadcastExcept", except = "x" } }, { n = 4 })
			t.expect(mod.S2C.sent[1].kind).toBe("list")
			t.expect(mod.S2C.sent[2].kind).toBe("except")
		end)

		t.it("commit calls StepReplication", function()
			local mod, tr = setup()
			tr:commit()
			t.expect(mod.steps).toBe(1)
		end)
	end)

	t.describe("BlinkTransport client send + pump", function()
		t.it("client send uses Fire(payload) only", function()
			local mod = { C2S = fakeEvent(), S2C = fakeEvent() }
			local tr = net.BlinkTransport.new(mod, { c2sReg, s2cReg })
			tr:start({ boundary = "client", deliver = function() end })
			tr:send({ meta = c2sReg, target = { kind = "server" } }, { n = 9 })
			t.expect(mod.C2S.sent[1].kind).toBe("fire")
			t.expect(mod.C2S.sent[1].a.n).toBe(9)
			t.expect(mod.C2S.sent[1].b).toBeUndefined()
		end)

		t.it("server pump delivers inbound clientToServer with player", function()
			local mod = { C2S = fakeEvent(), S2C = fakeEvent() }
			local p = { Name = "sender" }
			mod.C2S.queue = { { p, { n = 5 } } }
			local got = {}
			local tr = net.BlinkTransport.new(mod, { c2sReg, s2cReg })
			tr:start({
				boundary = "server",
				deliver = function(name, payload, sender)
					table.insert(got, { name = name, payload = payload, sender = sender })
				end,
			})
			tr:pump()
			t.expect(#got).toBe(1)
			t.expect(got[1].name).toBe("C2S")
			t.expect(got[1].payload.n).toBe(5)
			t.expect(got[1].sender).toBe(p)
		end)

		t.it("client pump delivers inbound serverToClient without sender", function()
			local mod = { C2S = fakeEvent(), S2C = fakeEvent() }
			mod.S2C.queue = { { { n = 8 } } }
			local got
			local tr = net.BlinkTransport.new(mod, { c2sReg, s2cReg })
			tr:start({
				boundary = "client",
				deliver = function(name, payload, sender)
					got = { name = name, payload = payload, sender = sender }
				end,
			})
			tr:pump()
			t.expect(got.name).toBe("S2C")
			t.expect(got.payload.n).toBe(8)
			t.expect(got.sender).toBeUndefined()
		end)
	end)
end
