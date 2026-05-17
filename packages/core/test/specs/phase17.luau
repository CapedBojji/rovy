--!nocheck
-- Phase 17 — prefab runtime. Prefabs are singleton entity builders that
-- integrate into the bundle API (world.spawn, world.insert, commands.spawn,
-- commands.insert). They use param injection for build() like systems do.

return function(TS, t)
	local rovy = (TS.loadPath("out/rovy") :: any).rovy
	local App = (TS.loadPath("out/runtime/app") :: any).App

	local function class(ctor)
		local C = {}
		C.__index = C
		C.new = function(...)
			return setmetatable(ctor(...) or {}, C)
		end
		return C
	end

	local function prefabClass(buildFn)
		local C = {}
		C.__index = C
		C.new = function()
			return setmetatable({ __rovyTarget = nil }, C)
		end
		C.entity = function(self)
			assert(self.__rovyTarget ~= nil, "[rovy] Prefab.entity() called outside a build() invocation")
			return self.__rovyTarget
		end
		C.build = function(self, ...)
			return buildFn(self, ...)
		end
		return C
	end

	local function sysClass(runFn)
		local C = {}
		C.__index = C
		C.new = function() return setmetatable({}, C) end
		C.run = function(self, ...) return runFn(self, ...) end
		return C
	end

	local Health = class(function(current, max) return { current = current, max = max } end)
	local Position = class(function(x, y) return { x = x, y = y } end)
	local Unit = class(function() return {} end)
	local Update = {}
	local Clock = class(function() return { tick = 0 } end)

	t.describe("Phase 17 — prefab runtime", function()
		t.it("registry.prefabs populated after __prefab call", function()
			rovy:__reset()
			local Pf = prefabClass(function(self) return self:entity() end)
			rovy:__prefab(Pf, { id = "t/Pf", params = {} })
			t.expect(#rovy.registry.prefabs).toBe(1)
			t.expect(rovy.registry.prefabs[1].ctor).toBe(Pf)
			t.expect(rovy.registry.prefabs[1].id).toBe("t/Pf")
		end)

		t.it("__reset clears prefabs registry", function()
			rovy:__reset()
			local Pf = prefabClass(function(self) return self:entity() end)
			rovy:__prefab(Pf, { id = "t/Pf", params = {} })
			rovy:__reset()
			t.expect(#rovy.registry.prefabs).toBe(0)
		end)

		t.it("world.spawn(PrefabCtor) creates entity with prefab components", function()
			rovy:__reset()
			rovy:__component(Health, "t/Health")
			rovy:__component(Unit, "t/Unit")
			rovy:__schedule(Update, { runOnStart = false })

			local Pf = prefabClass(function(self, commands)
				local entity = self:entity()
				commands:insert(entity, Unit)
				commands:set(entity, Health, Health.new(100, 100))
				return entity
			end)
			rovy:__prefab(Pf, { id = "t/Pf", params = { { kind = "commands" } } })

			local app = App.new()
			app:start()
			local entity = app.world:spawn(Pf)
			app:flush()

			t.expect(app.world:has(entity, Unit)).toBeTruthy()
			t.expect(app.world:get(entity, Health).current).toBe(100)
		end)

		t.it("world.insert(entity, PrefabCtor) builds into existing entity", function()
			rovy:__reset()
			rovy:__component(Health, "t/Health")
			rovy:__component(Position, "t/Position")
			rovy:__schedule(Update, { runOnStart = false })

			local Pf = prefabClass(function(self, commands)
				local entity = self:entity()
				commands:set(entity, Health, Health.new(50, 50))
				return entity
			end)
			rovy:__prefab(Pf, { id = "t/Pf", params = { { kind = "commands" } } })

			local app = App.new()
			app:start()
			local entity = app.world:spawn(Position.new(5, 10))
			app.world:insert(entity, Pf)
			app:flush()

			t.expect(app.world:has(entity, Position)).toBeTruthy()
			t.expect(app.world:get(entity, Health).current).toBe(50)
		end)

		t.it("commands.spawn(PrefabCtor) deferred — entity exists after flush", function()
			rovy:__reset()
			rovy:__component(Health, "t/Health")
			rovy:__schedule(Update, { runOnStart = false })

			local buildCount = 0
			local Pf = prefabClass(function(self, commands)
				buildCount = buildCount + 1
				local entity = self:entity()
				commands:set(entity, Health, Health.new(75, 75))
				return entity
			end)
			rovy:__prefab(Pf, { id = "t/Pf", params = { { kind = "commands" } } })

			local app = App.new()
			app:start()
			app.commands:spawn(Pf)
			t.expect(buildCount).toBe(0)
			app:flush()
			t.expect(buildCount).toBe(1)
		end)

		t.it("commands.insert(entity, PrefabCtor) applies after flush", function()
			rovy:__reset()
			rovy:__component(Health, "t/Health")
			rovy:__component(Position, "t/Position")
			rovy:__schedule(Update, { runOnStart = false })

			local Pf = prefabClass(function(self, commands)
				local entity = self:entity()
				commands:set(entity, Health, Health.new(25, 25))
				return entity
			end)
			rovy:__prefab(Pf, { id = "t/Pf", params = { { kind = "commands" } } })

			local app = App.new()
			app:start()
			local entity = app.world:spawn(Position.new(1, 2))
			app.commands:insert(entity, Pf)
			app:flush()

			t.expect(app.world:get(entity, Health).current).toBe(25)
		end)

		t.it("this.entity() returns correct target during build", function()
			rovy:__reset()
			rovy:__component(Unit, "t/Unit")
			rovy:__schedule(Update, { runOnStart = false })

			local capturedTarget = nil
			local Pf = prefabClass(function(self, world)
				capturedTarget = self:entity()
				world:insert(capturedTarget, Unit)
				return capturedTarget
			end)
			rovy:__prefab(Pf, { id = "t/Pf", params = { { kind = "world" } } })

			local app = App.new()
			app:start()
			local entity = app.world:spawn(Pf)
			t.expect(capturedTarget).toBe(entity)
		end)

		t.it("prefab + extra bundle items: both apply to same entity", function()
			rovy:__reset()
			rovy:__component(Health, "t/Health")
			rovy:__component(Unit, "t/Unit")
			rovy:__component(Position, "t/Position")
			rovy:__schedule(Update, { runOnStart = false })

			local Pf = prefabClass(function(self, world)
				local entity = self:entity()
				world:set(entity, Health, Health.new(80, 80))
				return entity
			end)
			rovy:__prefab(Pf, { id = "t/Pf", params = { { kind = "world" } } })

			local app = App.new()
			app:start()
			local entity = app.world:spawn(Pf, Unit, Position.new(3, 4))

			t.expect(app.world:get(entity, Health).current).toBe(80)
			t.expect(app.world:has(entity, Unit)).toBeTruthy()
			t.expect(app.world:get(entity, Position).x).toBe(3)
		end)

		t.it("Res<T> param resolves correctly in build()", function()
			rovy:__reset()
			rovy:__component(Health, "t/Health")
			rovy:__resource(Clock, "t/Clock")
			rovy:__schedule(Update, { runOnStart = false })

			local capturedTick = nil
			local Pf = prefabClass(function(self, world, clock)
				capturedTick = clock.tick
				local entity = self:entity()
				world:set(entity, Health, Health.new(clock.tick, 100))
				return entity
			end)
			rovy:__prefab(Pf, {
				id = "t/Pf",
				params = { { kind = "world" }, { kind = "res", ctor = Clock } },
			})

			local app = App.new()
			app:start()
			-- set a non-default tick value on the resource
			local clock = app.world:resource(Clock)
			clock.tick = 42
			local entity = app.world:spawn(Pf)
			t.expect(capturedTick).toBe(42)
			t.expect(app.world:get(entity, Health).current).toBe(42)
		end)

		t.it("singleton: same prefab instance reused across spawns", function()
			rovy:__reset()
			rovy:__component(Unit, "t/Unit")
			rovy:__schedule(Update, { runOnStart = false })

			local instanceIds = {}
			local Pf = prefabClass(function(self, world)
				table.insert(instanceIds, tostring(self))
				local entity = self:entity()
				world:insert(entity, Unit)
				return entity
			end)
			rovy:__prefab(Pf, { id = "t/Pf", params = { { kind = "world" } } })

			local app = App.new()
			app:start()
			app.world:spawn(Pf)
			app.world:spawn(Pf)
			t.expect(#instanceIds).toBe(2)
			t.expect(instanceIds[1]).toBe(instanceIds[2])
		end)

		t.it("nested prefab: inner build restores outer target", function()
			rovy:__reset()
			rovy:__component(Health, "t/Health")
			rovy:__component(Unit, "t/Unit")
			rovy:__schedule(Update, { runOnStart = false })

			local InnerPf = prefabClass(function(self, world)
				local entity = self:entity()
				world:insert(entity, Unit)
				return entity
			end)
			rovy:__prefab(InnerPf, { id = "t/InnerPf", params = { { kind = "world" } } })

			local outerTarget = nil
			local OuterPf = prefabClass(function(self, world)
				local entity = self:entity()
				world:set(entity, Health, Health.new(99, 99))
				-- spawn a nested prefab inside build
				world:spawn(InnerPf)
				-- outer target should still be correct after nested call
				t.expect(self:entity()).toBe(entity)
				outerTarget = entity
				return entity
			end)
			rovy:__prefab(OuterPf, { id = "t/OuterPf", params = { { kind = "world" } } })

			local app = App.new()
			app:start()
			local entity = app.world:spawn(OuterPf)
			t.expect(outerTarget).toBe(entity)
			t.expect(app.world:get(entity, Health).current).toBe(99)
		end)

		t.it("build() returning wrong entity asserts", function()
			rovy:__reset()
			rovy:__component(Unit, "t/Unit")
			rovy:__schedule(Update, { runOnStart = false })

			local Pf = prefabClass(function(self, world)
				-- return a different entity than this.entity()
				return world:spawn(Unit)
			end)
			rovy:__prefab(Pf, { id = "t/BadPf", params = { { kind = "world" } } })

			local app = App.new()
			app:start()
			local ok, err = pcall(function()
				app.world:spawn(Pf)
			end)
			t.expect(ok).toBeFalsy()
			t.expect(tostring(err):find("must return this.entity()") ~= nil).toBeTruthy()
		end)

		t.it("entity() called outside build() throws", function()
			local Pf = prefabClass(function(self) return self:entity() end)
			local inst = Pf.new()
			local ok, err = pcall(function()
				inst:entity()
			end)
			t.expect(ok).toBeFalsy()
			t.expect(tostring(err):find("outside a build()") ~= nil).toBeTruthy()
		end)

		t.it("app.start() with no prefabs is fine", function()
			rovy:__reset()
			rovy:__component(Unit, "t/Unit")
			rovy:__schedule(Update, { runOnStart = false })
			local app = App.new()
			app:start()
			local entity = app.world:spawn(Unit)
			t.expect(app.world:has(entity, Unit)).toBeTruthy()
		end)
	end)
end
