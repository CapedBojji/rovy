--!nocheck
-- LoopbackTransport: records sent items, buffers inbound until pump(), and
-- carries client→server sender identity. connectLoopback links a pair.

local nethelp = require("../harness/net")

return function(TS, t)
	local net = TS.loadPath("out/init")

	local Move = nethelp.eventClass({ "x" })
	local moveReg = nethelp.reg(Move, { name = "Move", direction = "clientToServer", fields = { "x" } })

	t.describe("LoopbackTransport", function()
		t.it("records sent items without a peer", function()
			local tr = net.LoopbackTransport.new()
			tr:start({ boundary = "client", deliver = function() end })
			tr:send({ meta = moveReg, target = { kind = "server" } }, { x = 1 })
			t.expect(#tr.sent).toBe(1)
			t.expect(tr.sent[1].payload.x).toBe(1)
		end)

		t.it("delivers buffered inbound only on pump()", function()
			local client = net.LoopbackTransport.new()
			local server = net.LoopbackTransport.new()
			net.connectLoopback(client, server)

			local received = {}
			server:start({
				boundary = "server",
				deliver = function(name, payload, sender)
					table.insert(received, { name = name, payload = payload, sender = sender })
				end,
			})
			client:start({ boundary = "client", deliver = function() end })

			client:send({ meta = moveReg, target = { kind = "server" } }, { x = 7 })
			t.expect(#received).toBe(0)
			server:pump()
			t.expect(#received).toBe(1)
			t.expect(received[1].name).toBe("Move")
			t.expect(received[1].payload.x).toBe(7)
		end)

		t.it("client→server carries sender; server→client does not", function()
			local player = { Name = "P" }
			local client = net.LoopbackTransport.new(player)
			local server = net.LoopbackTransport.new()
			net.connectLoopback(client, server)

			local got
			server:start({ boundary = "server", deliver = function(_, _, sender) got = sender end })
			client:start({ boundary = "client", deliver = function() end })
			client:send({ meta = moveReg, target = { kind = "server" } }, { x = 1 })
			server:pump()
			t.expect(got).toBe(player)
		end)
	end)
end
