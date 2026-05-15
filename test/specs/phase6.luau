--!nocheck
-- Phase 6 exit: send→EventReader drains for the run (cleared next run);
-- observer priority order; commands.trigger deferred chain converges in one
-- flush; world.trigger immediate; capacity drops oldest; observer param
-- injection.

return function(TS, t)
	local rovy = (TS.loadPath("out/rovy") :: any).rovy
	local App = (TS.loadPath("out/runtime/app") :: any).App

	local function class(ctor)
		local C = {}
		C.__index = C
		C.new = function(...) return setmetatable(ctor(...) or {}, C) end
		return C
	end
	local function sysClass(runFn)
		local C = {}
		C.__index = C
		C.new = function() return setmetatable({}, C) end
		C.run = function(self, ...) return runFn(self, ...) end
		return C
	end

	local Update = {}
	local DamageTaken = class(function(amt) return { amount = amt } end)
	local UnitDied = class(function(who) return { who = who } end)

	t.describe("Phase 6 — events + observers", function()
		t.it("send → EventReader drains this run; empty next run", function()
			rovy:__reset()
			rovy:__schedule(Update, { runOnStart = false })
			rovy:__event(DamageTaken, {})
			local seen = {}
			local Producer = sysClass(function(_, w)
				w:send(DamageTaken.new(5))
				w:send(DamageTaken.new(7))
			end)
			local Consumer = sysClass(function(_, r)
				r:forEach(function(e) table.insert(seen, e.amount) end)
			end)
			rovy:__system(Producer, {
				id = "t/Producer", schedule = Update,
				params = { { kind = "eventWriter", ctor = DamageTaken } },
			})
			rovy:__system(Consumer, {
				id = "t/Consumer", schedule = Update, after = { Producer },
				params = { { kind = "eventReader", ctor = DamageTaken } },
			})
			local app = App.new()
			app:start()
			app:runSchedule(Update)
			t.expect(#seen).toBe(2)
			-- next run: producer sends 2 more, buffer was cleared at boundary
			app:runSchedule(Update)
			t.expect(#seen).toBe(4)
		end)

		t.it("observers run in priority order; not consumed", function()
			rovy:__reset()
			rovy:__schedule(Update, { runOnStart = false })
			rovy:__event(DamageTaken, {})
			local order = {}
			local Hi = sysClass(function() end)
			local Lo = sysClass(function() end)
			-- observers are classes too
			local A = sysClass(function() table.insert(order, "A100") end)
			local B = sysClass(function() table.insert(order, "B0") end)
			local C = sysClass(function() table.insert(order, "Cneg") end)
			rovy:__observer(A, { event = DamageTaken, priority = 100, params = {} })
			rovy:__observer(B, { event = DamageTaken, priority = 0, params = {} })
			rovy:__observer(C, { event = DamageTaken, priority = -50, params = {} })
			local app = App.new()
			app:start()
			app.world:trigger(DamageTaken.new(1)) -- immediate
			t.expect(table.concat(order, ",")).toBe("A100,B0,Cneg")
		end)

		t.it("observer param injection: event + commands + world", function()
			rovy:__reset()
			rovy:__schedule(Update, { runOnStart = false })
			rovy:__event(DamageTaken, {})
			local got = {}
			local Obs = sysClass(function(_, event, commands, world)
				got.amount = event.amount
				got.hasCommands = type(commands.spawn) == "function"
				got.hasWorld = type(world.spawn) == "function"
			end)
			rovy:__observer(Obs, {
				event = DamageTaken, priority = 0,
				params = { { kind = "event" }, { kind = "commands" }, { kind = "world" } },
			})
			local app = App.new()
			app:start()
			app.world:trigger(DamageTaken.new(42))
			t.expect(got.amount).toBe(42)
			t.expect(got.hasCommands).toBeTruthy()
			t.expect(got.hasWorld).toBeTruthy()
		end)

		t.it("commands.trigger deferred; observer chain converges in one flush", function()
			rovy:__reset()
			rovy:__schedule(Update, { runOnStart = false })
			rovy:__event(DamageTaken, {})
			rovy:__event(UnitDied, {})
			local chain = {}
			-- DamageTaken observer triggers UnitDied
			local OnDmg = sysClass(function(_, event, commands)
				table.insert(chain, "dmg" .. event.amount)
				commands:trigger(UnitDied.new("x"))
			end)
			local OnDied = sysClass(function(_, event)
				table.insert(chain, "died" .. tostring(event.who))
			end)
			rovy:__observer(OnDmg, {
				event = DamageTaken, priority = 0,
				params = { { kind = "event" }, { kind = "commands" } },
			})
			rovy:__observer(OnDied, {
				event = UnitDied, priority = 0,
				params = { { kind = "event" } },
			})
			local Kick = sysClass(function(_, commands)
				commands:trigger(DamageTaken.new(9))
			end)
			rovy:__system(Kick, {
				id = "t/Kick", schedule = Update,
				params = { { kind = "commands" } },
			})
			local app = App.new()
			app:start()
			app:runSchedule(Update)
			t.expect(table.concat(chain, ",")).toBe("dmg9,diedx")
		end)

		t.it("capacity ring drops oldest", function()
			rovy:__reset()
			rovy:__schedule(Update, { runOnStart = false })
			rovy:__event(DamageTaken, { capacity = 2 })
			local seen = {}
			local P = sysClass(function(_, w)
				w:send(DamageTaken.new(1))
				w:send(DamageTaken.new(2))
				w:send(DamageTaken.new(3)) -- evicts 1
			end)
			local Cn = sysClass(function(_, r)
				r:forEach(function(e) table.insert(seen, e.amount) end)
			end)
			rovy:__system(P, { id = "t/P", schedule = Update, params = { { kind = "eventWriter", ctor = DamageTaken } } })
			rovy:__system(Cn, { id = "t/Cn", schedule = Update, after = { P }, params = { { kind = "eventReader", ctor = DamageTaken } } })
			local app = App.new()
			app:start()
			app:runSchedule(Update)
			t.expect(table.concat(seen, ",")).toBe("2,3")
		end)
	end)
end
