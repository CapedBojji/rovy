--!strict
-- Phase 0 substrate smoke test.
-- Proves jecs runs headless under Lune AND empirically verifies the spike's
-- load-bearing claim: world.added forwards a 4th `oldarchetype` arg at
-- runtime (the published .d.ts only types 3). Run: `lune run test/smoke`.

local jecs = require("../node_modules/@rbxts/jecs/src/jecs")

local failures = 0
local function check(name: string, cond: boolean)
	if cond then
		print("  ok  " .. name)
	else
		failures += 1
		print("FAIL  " .. name)
	end
end

local world = jecs.world()

-- entity / component / set / get round-trip
local Position = world:component()
local e = world:entity()
world:set(e, Position, { x = 1, y = 2 })
local got = world:get(e, Position) :: any
check("entity/component/set/get round-trip", got ~= nil and got.x == 1 and got.y == 2)

-- has / remove / contains
check("has component", world:has(e, Position))
world:remove(e, Position)
check("remove drops component", not world:has(e, Position))
check("contains entity", world:contains(e))

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
check("query with/without filters correctly", matched[a] == true and matched[b] == nil)

-- cached query: has() membership (Phase 8 monitor substrate)
local cq = world:query(Position, Health):without(Dead):cached()
check("cached query has(a)=true", cq:has(a))
check("cached query has(b)=false", not cq:has(b))

-- SPIKE CLAIM: world.added forwards 4th `oldarchetype` arg at runtime
local capturedArgc = 0
local Tag = world:component()
local disconnect = world:added(Tag, function(...)
	capturedArgc = select("#", ...)
end)
local c = world:entity()
world:set(c, Tag, true)
disconnect()
check("world.added passes 4 args (e,id,value,oldarchetype) — spike claim", capturedArgc == 4)

-- record() exported + archetype field
local rec = jecs.record(world, a) :: any
check("record(world,e).archetype present", rec ~= nil and rec.archetype ~= nil)

if failures > 0 then
	error(string.format("smoke: %d failure(s)", failures))
end
print(string.format("smoke: all checks passed"))
