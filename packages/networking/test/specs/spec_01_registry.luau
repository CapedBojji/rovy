--!nocheck
-- registry: @netEvent decorator is an inert no-op; rovyNet collects metadata
-- and looks it up by name/ctor.

local nethelp = require("../harness/net")

return function(TS, t)
	local net = TS.loadPath("out/init")

	t.describe("registry", function()
		t.it("netEvent decorator is a runtime no-op", function()
			local C = nethelp.eventClass({ "a" })
			local decorate = net.netEvent({ direction = "clientToServer" })
			t.expect(decorate(C)).toBeUndefined()
		end)

		t.it("__netEvent pushes metadata; byName/byCtor resolve it", function()
			net.rovyNet:__reset()
			local Move = nethelp.eventClass({ "x", "y" })
			net.rovyNet:__netEvent(Move, {
				id = "game/Move",
				name = "Move",
				direction = "clientToServer",
				channel = "reliable",
				receive = "send",
				fields = { "x", "y" },
			})
			t.expect(#net.rovyNet.registry).toBe(1)
			local byName = net.rovyNet:byName("Move")
			t.expect(byName).toBeDefined()
			t.expect(byName.ctor).toBe(Move)
			t.expect(net.rovyNet:byCtor(Move).id).toBe("game/Move")
			t.expect(net.rovyNet:byName("Nope")).toBeUndefined()
		end)

		t.it("__reset clears the registry", function()
			net.rovyNet:__reset()
			t.expect(#net.rovyNet.registry).toBe(0)
		end)
	end)
end
