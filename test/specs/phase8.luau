--!nocheck
-- Phase 8 exit: monitor onEnter once when entity enters match; onExit on
-- losing a required term, on gaining a Without term, and on despawn;
-- onChange while matching; runtime-created archetypes tracked.
-- Reconcile runs at flush + set boundaries (public cached-query design).

return function(TS, t)
	local rovy = (TS.loadPath("out/rovy") :: any).rovy
	local App = (TS.loadPath("out/runtime/app") :: any).App

	local function class(ctor)
		local C = {}
		C.__index = C
		C.new = function(...) return setmetatable(ctor(...) or {}, C) end
		return C
	end
	local function monClass(handlers)
		local C = {}
		C.__index = C
		C.new = function() return setmetatable({}, C) end
		C.onEnter = function(self, ...) if handlers.onEnter then handlers.onEnter(...) end end
		C.onExit = function(self, ...) if handlers.onExit then handlers.onExit(...) end end
		C.onChange = function(self, ...) if handlers.onChange then handlers.onChange(...) end end
		return C
	end

	local Health = class(function(v) return { v = v } end)
	local Position = class(function(x) return { x = x } end)
	local Unit = class(function() return {} end)
	local Dead = class(function() return {} end)

	local function setup(handlers)
		rovy:__reset()
		rovy:__component(Health, "t/Health")
		rovy:__component(Position, "t/Position")
		rovy:__component(Unit, "t/Unit")
		rovy:__component(Dead, "t/Dead")
		rovy:__query({
			id = "qm",
			terms = { { t = "component", ctor = Health }, { t = "component", ctor = Position } },
			filters = { with = { Unit }, without = { Dead } },
		})
		local Mon = monClass(handlers)
		rovy:__monitor(Mon, {
			match = "qm",
			methods = { "onEnter", "onExit", "onChange" },
			params = { { kind = "entity" }, { kind = "term", index = 0 }, { kind = "term", index = 1 } },
		})
		local app = App.new()
		app:start()
		return app
	end

	t.describe("Phase 8 — monitors", function()
		t.it("onEnter fires once when entity enters the match", function()
			local enters = {}
			local app = setup({ onEnter = function(e, h, p) table.insert(enters, { e = e, hv = h.v, px = p.x }) end })
			local e = app.world:spawn(Health.new(10), Position.new(3), Unit)
			app:flush() -- triggers reconcile
			t.expect(#enters).toBe(1)
			t.expect(enters[1].hv).toBe(10)
			t.expect(enters[1].px).toBe(3)
			app:flush() -- idempotent: no duplicate enter
			t.expect(#enters).toBe(1)
		end)

		t.it("onExit when a required term is removed", function()
			local exits = 0
			local app = setup({ onExit = function() exits += 1 end })
			local e = app.world:spawn(Health.new(1), Position.new(1), Unit)
			app:flush()
			app.world:remove(e, Health)
			app:flush()
			t.expect(exits).toBe(1)
		end)

		t.it("onExit when a Without component is gained", function()
			local exits = 0
			local app = setup({ onExit = function() exits += 1 end })
			local e = app.world:spawn(Health.new(1), Position.new(1), Unit)
			app:flush()
			app.world:insert(e, Dead)
			app:flush()
			t.expect(exits).toBe(1)
		end)

		t.it("onExit on despawn", function()
			local exits = 0
			local app = setup({ onExit = function() exits += 1 end })
			local e = app.world:spawn(Health.new(1), Position.new(1), Unit)
			app:flush()
			app.world:despawn(e)
			app:flush()
			t.expect(exits).toBe(1)
		end)

		t.it("onChange while matching; not after exit", function()
			local changes = 0
			local app = setup({ onChange = function() changes += 1 end })
			local e = app.world:spawn(Health.new(1), Position.new(1), Unit)
			app:flush()
			app.world:set(e, Health, Health.new(2)) -- jecs changed hook → onChange
			t.expect(changes).toBe(1)
			app.world:remove(e, Health)
			app:flush()
			app.world:set(e, Position, Position.new(9)) -- no longer matching
			t.expect(changes).toBe(1)
		end)

		t.it("re-enter after exit fires onEnter again", function()
			local enters, exits = 0, 0
			local app = setup({
				onEnter = function() enters += 1 end,
				onExit = function() exits += 1 end,
			})
			local e = app.world:spawn(Health.new(1), Position.new(1), Unit)
			app:flush()
			app.world:insert(e, Dead)
			app:flush()
			app.world:remove(e, Dead)
			app:flush()
			t.expect(enters).toBe(2)
			t.expect(exits).toBe(1)
		end)
	end)
end
