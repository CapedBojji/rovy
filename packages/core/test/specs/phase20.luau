--!nocheck
-- Phase 20 — per-world entity ref registry. Unknown keys map to stable
-- entities, can be queried, and can be deleted without despawning.

return function(TS, t)
	local RovyWorld = (TS.loadPath("out/runtime/world") :: any).RovyWorld

	t.describe("Phase 20 — world refs", function()
		t.it("creates once per key and reuses the same entity", function()
			local world = RovyWorld.new()
			local key = {}

			t.expect(world:hasRef(key)).toBeFalsy()
			t.expect(world:getRef(key)).toBeUndefined()

			local first = world:ref(key)
			local second = world:ref(key)

			t.expect(world:hasRef(key)).toBeTruthy()
			t.expect(world:getRef(key)).toBe(first)
			t.expect(second).toBe(first)
		end)

		t.it("gives different keys different entities", function()
			local world = RovyWorld.new()
			local a = {}
			local b = {}

			t.expect(world:ref(a)).never.toBe(world:ref(b))
		end)

		t.it("deleteRef removes only the mapping by default and returns status", function()
			local world = RovyWorld.new()
			local destroyed = 0
			local key = {
				destroy = function(self)
					destroyed += 1
				end,
			}
			local entity = world:ref(key)

			t.expect(world:deleteRef(key)).toBeTruthy()
			t.expect(world:deleteRef(key)).toBeFalsy()
			t.expect(world:hasRef(key)).toBeFalsy()
			t.expect(world:getRef(key)).toBeUndefined()
			t.expect(world.jecs:contains(entity)).toBeTruthy()
			t.expect(destroyed).toBe(0)

			local fresh = world:ref(key)
			t.expect(fresh).never.toBe(entity)
		end)

		t.it("despawn keeps ref mapping by default", function()
			local world = RovyWorld.new()
			local key = {}
			local entity = world:ref(key)

			world:despawn(entity)

			t.expect(world:hasRef(key)).toBeTruthy()
			t.expect(world:getRef(key)).toBe(entity)
			t.expect(world.jecs:contains(entity)).toBeFalsy()
		end)

		t.it("despawn with cleanupRefs removes ref mapping and cleans key object", function()
			local world = RovyWorld.new()
			local destroyed = 0
			local key = {
				destroy = function(self)
					destroyed += 1
				end,
			}
			local entity = world:ref(key)

			world:despawn(entity, { cleanupRefs = true })

			t.expect(world:hasRef(key)).toBeFalsy()
			t.expect(world:getRef(key)).toBeUndefined()
			t.expect(world.jecs:contains(entity)).toBeFalsy()
			t.expect(destroyed).toBe(1)
		end)

		t.it("despawn with cleanupRefs can use explicit destroy method", function()
			local world = RovyWorld.new()
			local destroyed = 0
			local key = {
				release = function(self)
					destroyed += 1
				end,
			}
			local entity = world:ref(key, { destroyMethod = "release" })

			world:despawn(entity, { cleanupRefs = true })

			t.expect(world:hasRef(key)).toBeFalsy()
			t.expect(world:getRef(key)).toBeUndefined()
			t.expect(world.jecs:contains(entity)).toBeFalsy()
			t.expect(destroyed).toBe(1)
		end)

		t.it("keeps refs isolated per world", function()
			local key = {}
			local worldA = RovyWorld.new()
			local worldB = RovyWorld.new()

			local entityA = worldA:ref(key)

			t.expect(worldB:hasRef(key)).toBeFalsy()

			local entityB = worldB:ref(key)
			t.expect(worldA:getRef(key)).toBe(entityA)
			t.expect(worldB:getRef(key)).toBe(entityB)
			t.expect(worldA:deleteRef(key)).toBeTruthy()
			t.expect(worldA:hasRef(key)).toBeFalsy()
			t.expect(worldB:hasRef(key)).toBeTruthy()
			t.expect(worldB:getRef(key)).toBe(entityB)
		end)
	end)
end
