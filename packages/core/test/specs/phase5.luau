--!nocheck
-- Phase 5 exit: Query<[...],With,Without> resolves + iterates correct rows;
-- Entity + component + Optional binding order; size/first; multiple query
-- params independent; tick/trait/pair terms rejected loudly.

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
	local function sysClass(runFn)
		local C = {}
		C.__index = C
		C.new = function() return setmetatable({}, C) end
		C.run = function(self, ...) return runFn(self, ...) end
		return C
	end

	local Position = class(function(x) return { x = x } end)
	local Velocity = class(function(d) return { d = d } end)
	local Shield = class(function(a) return { a = a } end)
	local Unit = class(function() return {} end)
	local Dead = class(function() return {} end)
	local WithMethod = class(function(v) return { value = v } end)
	WithMethod.double = function(self)
		return self.value * 2
	end
	local Update = {}

	t.describe("Phase 5 — query runtime", function()
		t.it("binds [Entity, Position, Optional<Shield>] with/without filters", function()
			rovy:__reset()
			rovy:__component(Position, "t/Position")
			rovy:__component(Velocity, "t/Velocity")
			rovy:__component(Shield, "t/Shield")
			rovy:__component(Unit, "t/Unit")
			rovy:__component(Dead, "t/Dead")
			rovy:__schedule(Update, { runOnStart = false })
			rovy:__query({
				id = "q#0",
				terms = {
					{ t = "entity" },
					{ t = "component", ctor = Position },
					{ t = "optional", ctor = Shield },
				},
				filters = { with = { Unit }, without = { Dead } },
			})

			local rows = {}
			local Sys = sysClass(function(_, q)
				q:forEach(function(entity, pos, shield)
					table.insert(rows, { e = entity, x = pos.x, s = shield and shield.a or nil })
				end)
			end)
			rovy:__system(Sys, {
				id = "t/Sys",
				schedule = Update,
				params = { { kind = "query", handle = "q#0" } },
			})

			local app = App.new()
			app:start()
			local w = app.world
			local e1 = w:spawn(Position.new(10), Unit, Shield.new(5)) -- match + shield
			local e2 = w:spawn(Position.new(20), Unit) -- match, no shield
			local e3 = w:spawn(Position.new(30), Unit, Dead) -- excluded (Dead)
			local e4 = w:spawn(Position.new(40)) -- excluded (no Unit)

			app:runSchedule(Update)

			t.expect(#rows).toBe(2)
			-- find by x
			local byX = {}
			for _, r in rows do byX[r.x] = r end
			t.expect(byX[10]).toBeDefined()
			t.expect(byX[10].s).toBe(5)
			t.expect(byX[20]).toBeDefined()
			t.expect(byX[20].s).toBeUndefined()
			t.expect(byX[30]).toBeUndefined()
			t.expect(byX[40]).toBeUndefined()
		end)

		t.it("size() and first() reflect matches", function()
			rovy:__reset()
			rovy:__component(Position, "t/Position")
			rovy:__schedule(Update, { runOnStart = false })
			rovy:__query({ id = "q#1", terms = { { t = "entity" }, { t = "component", ctor = Position } }, filters = {} })
			local sz, fx = -1, -1
			local Sys = sysClass(function(_, q)
				sz = q:size()
				local e, p = q:first()
				fx = p and p.x or -999
			end)
			rovy:__system(Sys, { id = "t/Sz", schedule = Update, params = { { kind = "query", handle = "q#1" } } })
			local app = App.new()
			app:start()
			app.world:spawn(Position.new(7))
			app.world:spawn(Position.new(8))
			app:runSchedule(Update)
			t.expect(sz).toBe(2)
			t.expect(fx == 7 or fx == 8).toBeTruthy()
		end)

		t.it("component query returns rovy component instances with class methods intact", function()
			rovy:__reset()
			rovy:__component(WithMethod, "t/WithMethod")
			rovy:__schedule(Update, { runOnStart = false })
			rovy:__query({ id = "qMethod", terms = { { t = "component", ctor = WithMethod } }, filters = {} })

			local seen = {}
			local Sys = sysClass(function(_, q)
				q:forEach(function(comp)
					table.insert(seen, comp:double())
				end)
			end)
			rovy:__system(Sys, { id = "t/MethodSys", schedule = Update, params = { { kind = "query", handle = "qMethod" } } })

			local app = App.new()
			app:start()
			app.world:spawn(WithMethod.new(4))
			app.world:spawn(WithMethod.new(9))
			app:runSchedule(Update)

			table.sort(seen)
			t.expect(#seen).toBe(2)
			t.expect(seen[1]).toBe(8)
			t.expect(seen[2]).toBe(18)
		end)

		t.it("multiple query params resolve independently", function()
			rovy:__reset()
			rovy:__component(Position, "t/Position")
			rovy:__component(Velocity, "t/Velocity")
			rovy:__schedule(Update, { runOnStart = false })
			rovy:__query({ id = "qa", terms = { { t = "component", ctor = Position } }, filters = {} })
			rovy:__query({ id = "qb", terms = { { t = "component", ctor = Velocity } }, filters = {} })
			local na, nb = -1, -1
			local Sys = sysClass(function(_, qa, qb)
				na = qa:size()
				nb = qb:size()
			end)
			rovy:__system(Sys, {
				id = "t/Multi",
				schedule = Update,
				params = { { kind = "query", handle = "qa" }, { kind = "query", handle = "qb" } },
			})
			local app = App.new()
			app:start()
			app.world:spawn(Position.new(1))
			app.world:spawn(Position.new(2))
			app.world:spawn(Velocity.new(9))
			app:runSchedule(Update)
			t.expect(na).toBe(2)
			t.expect(nb).toBe(1)
		end)

		t.it("query on an unregistered component errors at start", function()
			rovy:__reset()
			rovy:__component(Position, "t/Position")
			rovy:__schedule(Update, { runOnStart = false })
			-- Velocity referenced by the query but never @component-registered
			rovy:__query({ id = "qc", terms = { { t = "component", ctor = Velocity } }, filters = {} })
			local app = App.new()
			t.expect(function() app:start() end).toThrow()
		end)
	end)
end
