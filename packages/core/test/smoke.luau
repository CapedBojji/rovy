--!strict
-- Phase 0 substrate smoke test.
-- Proves jecs runs headless under Zune AND empirically verifies the spike's
-- load-bearing claim: world.added forwards a 4th `oldarchetype` arg at
-- runtime (the published .d.ts only types 3). Run: `zune run test/smoke`.

local jecs = require("../node_modules/@rbxts/jecs/src/jecs")
local process = zune.process
local testing = zune.testing
local expect = testing.expect

testing.test("core substrate smoke", function()
	local world = jecs.world()

	-- entity / component / set / get round-trip
	local Position = world:component()
	local e = world:entity()
	world:set(e, Position, { x = 1, y = 2 })
	local got = world:get(e, Position) :: any
	expect(got ~= nil and got.x == 1 and got.y == 2).toBeTruthy()

	-- has / remove / contains
	expect(world:has(e, Position)).toBeTruthy()
	world:remove(e, Position)
	expect(world:has(e, Position)).toBeFalsy()
	expect(world:contains(e)).toBeTruthy()

	-- query with()/without()
	local Health = world:component()
	local Dead = world:component()
	local a = world:entity()
	world:set(a, Position, { x = 0, y = 0 })
	world:set(a, Health, 100)
	local b = world:entity()
	world:set(b, Position, { x = 5, y = 5 })
	world:set(b, Health, 50)
	world:add(b, Dead)
	local matched = {}
	for ent in world:query(Position, Health):without(Dead) do
		matched[ent] = true
	end
	expect(matched[a] == true and matched[b] == nil).toBeTruthy()

	-- cached query: has() membership (Phase 8 monitor substrate)
	local cq = world:query(Position, Health):without(Dead):cached()
	expect(cq:has(a)).toBeTruthy()
	expect(cq:has(b)).toBeFalsy()

	-- SPIKE CLAIM: world.added forwards 4th `oldarchetype` arg at runtime
	local capturedArgc = 0
	local Tag = world:component()
	local disconnect = world:added(Tag, function(...)
		capturedArgc = select("#", ...)
	end)
	local c = world:entity()
	world:set(c, Tag, true)
	disconnect()
	expect(capturedArgc).toBe(4)

	-- record() exported + archetype field
	local rec = jecs.record(world, a) :: any
	expect(rec ~= nil and rec.archetype ~= nil).toBeTruthy()
end)

process.exit(testing._failed)
