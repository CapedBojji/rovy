--!nocheck
-- codec: instance ↔ flat payload round-trips by field order, including
-- optional, array, and nested-object value fields.

local nethelp = require("../harness/net")

return function(TS, t)
	local net = TS.loadPath("out/init")
	local C = net.NetCodec

	local Snapshot = nethelp.eventClass({ "tick", "pos", "ids", "phase" })
	local meta = nethelp.reg(Snapshot, {
		name = "Snapshot",
		direction = "serverToClient",
		fields = { "tick", "pos", "ids", "phase" },
	})

	t.describe("codec", function()
		t.it("encode copies exactly the registered fields", function()
			local event = Snapshot.new(7, { x = 1, y = 2, z = 3 }, { 4, 5 }, "wave")
			local payload = C:encode(meta, event)
			t.expect(payload.tick).toBe(7)
			t.expect(payload.pos.x).toBe(1)
			t.expect(payload.ids[2]).toBe(5)
			t.expect(payload.phase).toBe("wave")
		end)

		t.it("decode reconstructs an instance via the ctor in field order", function()
			local payload = { tick = 9, pos = { x = 0, y = 8, z = 0 }, ids = { 1 }, phase = "intermission" }
			local event = C:decode(meta, payload)
			t.expect(getmetatable(event)).toBe(Snapshot)
			t.expect(event.tick).toBe(9)
			t.expect(event.pos.y).toBe(8)
			t.expect(event.phase).toBe("intermission")
		end)

		t.it("encode→decode is a faithful round-trip", function()
			local original = Snapshot.new(42, { x = -1, y = 0, z = 2 }, { 9, 8, 7 }, "defeat")
			local back = C:decode(meta, C:encode(meta, original))
			t.expect(back.tick).toBe(42)
			t.expect(back.pos.z).toBe(2)
			t.expect(back.ids[1]).toBe(9)
			t.expect(back.phase).toBe("defeat")
		end)

		t.it("optional trailing field round-trips as nil", function()
			local Opt = nethelp.eventClass({ "a", "b" })
			local optMeta = nethelp.reg(Opt, { name = "Opt", direction = "clientToServer", fields = { "a", "b" } })
			local back = C:decode(optMeta, C:encode(optMeta, Opt.new(1)))
			t.expect(back.a).toBe(1)
			t.expect(back.b).toBeUndefined()
		end)
	end)
end
