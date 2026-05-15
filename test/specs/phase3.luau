--!nocheck
-- Phase 3 exit: commands are deferred — invisible until flush, then
-- materialized; in-order application; queued send/trigger/relate are
-- harmless no-ops until their owning phase.

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
	local Position = class(function(x) return { x = x } end)
	local Unit = class(function() return {} end)

	local function freshApp()
		rovy:__reset()
		rovy:__component(Position, "t/Position")
		rovy:__component(Unit, "t/Unit")
		local app = App.new()
		app:start()
		return app
	end

	local function countWith(app, cls)
		local id = app.world.componentMap[cls]
		local n = 0
		for _ in app.world.jecs:query(id) do
			n += 1
		end
		return n
	end

	t.describe("Phase 3 — commands buffer + flush", function()
		t.it("deferred set invisible until flush, then applied", function()
			local app = freshApp()
			local e = app.world:spawn(Position.new(1))
			app.commands:set(e, Position, Position.new(2))
			t.expect(app.world:get(e, Position).x).toBe(1) -- not yet
			app:flush()
			t.expect(app.world:get(e, Position).x).toBe(2) -- materialized
		end)

		t.it("deferred spawn invisible until flush", function()
			local app = freshApp()
			t.expect(countWith(app, Unit)).toBe(0)
			app.commands:spawn(Unit)
			app.commands:spawn(Unit)
			t.expect(countWith(app, Unit)).toBe(0) -- still deferred
			app:flush()
			t.expect(countWith(app, Unit)).toBe(2)
		end)

		t.it("commands apply in FIFO order (set then remove → removed)", function()
			local app = freshApp()
			local e = app.world:spawn(Position.new(1))
			app.commands:set(e, Position, Position.new(9))
			app.commands:remove(e, Position)
			app:flush()
			t.expect(app.world:has(e, Position)).toBeFalsy()
		end)

		t.it("despawn deferred", function()
			local app = freshApp()
			local e = app.world:spawn(Unit)
			app.commands:despawn(e)
			t.expect(app.world.jecs:contains(e)).toBeTruthy()
			app:flush()
			t.expect(app.world.jecs:contains(e)).toBeFalsy()
		end)

		t.it("queued send/trigger/relate/runSchedule are harmless pre-phase", function()
			local app = freshApp()
			app.commands:send({})
			app.commands:trigger({})
			app.commands:runSchedule({})
			-- flush must not throw with no deferred handlers wired
			app:flush()
			t.expect(app.commands:hasPending()).toBeFalsy()
		end)

		t.it("flush converges (empty queue after)", function()
			local app = freshApp()
			app.commands:spawn(Unit)
			app:flush()
			t.expect(app.commands:hasPending()).toBeFalsy()
		end)
	end)
end
