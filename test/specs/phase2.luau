--!nocheck
-- Phase 2 exit: register components+resource → app:start() finalize →
-- spawn/get round-trip; resource auto-instantiated from default ctor;
-- app:insertResource overrides the default (before and after start).

return function(TS, t)
	local rovy = (TS.loadPath("out/rovy") :: any).rovy
	local App = (TS.loadPath("out/runtime/app") :: any).App

	-- roblox-ts-shaped classes: metatable of an instance == the class table
	local function class(ctor)
		local C = {}
		C.__index = C
		C.new = function(...)
			return setmetatable(ctor(...) or {}, C)
		end
		return C
	end

	local Position = class(function(x, y) return { x = x, y = y } end)
	local Unit = class(function() return {} end) -- tag
	local BattleClock = class(function(tick) return { tick = tick or 0 } end)

	t.describe("Phase 2 — world wrapper + finalize", function()
		t.it("start() errors on empty registry", function()
			rovy:__reset()
			local app = App.new()
			t.expect(function() app:start() end).toThrow()
		end)

		t.it("components get jecs ids; spawn/get round-trips", function()
			rovy:__reset()
			rovy:__component(Position, "t/Position")
			rovy:__component(Unit, "t/Unit")
			rovy:__resource(BattleClock, "t/BattleClock")

			local app = App.new()
			app:start()
			local w = app.world

			local e = w:spawn(Position.new(3, 4), Unit)
			local p = w:get(e, Position)
			t.expect(p).toBeDefined()
			t.expect(p.x).toBe(3)
			t.expect(p.y).toBe(4)
			t.expect(w:has(e, Unit)).toBeTruthy()

			w:remove(e, Unit)
			t.expect(w:has(e, Unit)).toBeFalsy()
			w:despawn(e)
		end)

		t.it("resource auto-instantiated from default ctor", function()
			rovy:__reset()
			rovy:__component(Position, "t/Position")
			rovy:__resource(BattleClock, "t/BattleClock")
			local app = App.new()
			app:start()
			local clock = app.world:resource(BattleClock)
			t.expect(clock).toBeDefined()
			t.expect(clock.tick).toBe(0)
		end)

		t.it("insertResource before start overrides the default", function()
			rovy:__reset()
			rovy:__component(Position, "t/Position")
			rovy:__resource(BattleClock, "t/BattleClock")
			local app = App.new()
			app:insertResource(BattleClock.new(99))
			app:start()
			t.expect(app.world:resource(BattleClock).tick).toBe(99)
		end)

		t.it("insertResource after start overrides live", function()
			rovy:__reset()
			rovy:__component(Position, "t/Position")
			rovy:__resource(BattleClock, "t/BattleClock")
			local app = App.new()
			app:start()
			t.expect(app.world:resource(BattleClock).tick).toBe(0)
			app:insertResource(BattleClock.new(42))
			t.expect(app.world:resource(BattleClock).tick).toBe(42)
		end)

		t.it("get on unregistered component errors", function()
			rovy:__reset()
			rovy:__component(Position, "t/Position")
			local app = App.new()
			app:start()
			local e = app.world:spawn(Position.new(1, 1))
			t.expect(function() app.world:get(e, Unit) end).toThrow()
		end)
	end)
end
