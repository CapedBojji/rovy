--!nocheck
-- Phase 12 — end-to-end integration. Hand-wires a combat scenario through
-- the full surface (proving the transformer is unnecessary for core):
-- resource + schedule/sets + system ordering + EventWriter/Reader +
-- deferred commands + change detection + monitor lifecycle. Deterministic
-- across N ticks.

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
	local function monClass(h)
		local C = {}
		C.__index = C
		C.new = function() return setmetatable({}, C) end
		C.onEnter = function(self, ...) if h.onEnter then h.onEnter(...) end end
		return C
	end

	-- world model
	local Health = class(function(cur, max) return { cur = cur, max = max } end)
	local Attacker = class(function(dmg, target) return { dmg = dmg, target = target } end)
	local Dead = class(function() return {} end)
	local Clock = class(function() return { tick = 0 } end)
	local DamageTaken = class(function(target, amount) return { target = target, amount = amount } end)

	local Update = {}
	local ClockSet, AttackSet, DamageSet, DeathSet = {}, {}, {}, {}

	t.describe("Phase 12 — combat integration", function()
		t.it("attacker kills target deterministically; death monitor despawns once", function()
			rovy:__reset()
			rovy:__component(Health, "g/Health")
			rovy:__component(Attacker, "g/Attacker")
			rovy:__component(Dead, "g/Dead")
			rovy:__resource(Clock, "g/Clock")
			rovy:__event(DamageTaken, {})
			rovy:__schedule(Update, { runOnStart = false })

			-- systems
			local TickClock = sysClass(function(_, clock)
				clock.tick += 1
			end)
			local Attack = sysClass(function(_, q, dmg)
				q:forEach(function(_e, atk)
					dmg:send(DamageTaken.new(atk.target, atk.dmg))
				end)
			end)
			local ApplyDamage = sysClass(function(_, commands, reader, world)
				reader:forEach(function(ev)
					local hp = world:get(ev.target, Health)
					if hp == nil then return end
					local nextHp = math.max(0, hp.cur - ev.amount)
					commands:set(ev.target, Health, Health.new(nextHp, hp.max))
					if nextHp <= 0 and not world:has(ev.target, Dead) then
						commands:insert(ev.target, Dead)
					end
				end)
			end)

			rovy:__query({ id = "qAtk", terms = { { t = "entity" }, { t = "component", ctor = Attacker } }, filters = {} })
			rovy:__system(TickClock, {
				id = "g/TickClock", schedule = Update, set = ClockSet,
				params = { { kind = "resMut", ctor = Clock } },
			})
			rovy:__system(Attack, {
				id = "g/Attack", schedule = Update, set = AttackSet,
				params = { { kind = "query", handle = "qAtk" }, { kind = "eventWriter", ctor = DamageTaken } },
			})
			rovy:__system(ApplyDamage, {
				id = "g/ApplyDamage", schedule = Update, set = DamageSet,
				params = { { kind = "commands" }, { kind = "eventReader", ctor = DamageTaken }, { kind = "world" } },
			})

			-- death monitor: entity gains Dead → despawn, count
			local deaths = {}
			local DeathMon = monClass({
				onEnter = function(e) table.insert(deaths, e) end,
			})
			rovy:__query({ id = "qDead", terms = { { t = "entity" } }, filters = { with = { Dead } } })
			rovy:__monitor(DeathMon, {
				match = "qDead",
				methods = { "onEnter" },
				params = { { kind = "entity" }, { kind = "commands" } },
			})
			-- monitor that despawns the dead (separate so onEnter capture is clean)
			local Reaper = monClass({
				onEnter = function(e, commands) commands:despawn(e) end,
			})
			rovy:__monitor(Reaper, {
				match = "qDead",
				methods = { "onEnter" },
				params = { { kind = "entity" }, { kind = "commands" } },
			})

			local app = App.new()
			app:configureSets(Update, { ClockSet, AttackSet, DamageSet, DeathSet })
			app:start()

			local target = app.world:spawn(Health.new(25, 25))
			app.world:spawn(Attacker.new(10, target)) -- 10 dmg/tick → dies on tick 3 (25→15→5→0)

			local function aliveTarget()
				return app.world.jecs:contains(target) and not app.world:has(target, Dead)
			end

			-- tick 1: 25→15
			app:runSchedule(Update)
			t.expect(app.world:get(target, Health).cur).toBe(15)
			t.expect(#deaths).toBe(0)
			-- tick 2: 15→5
			app:runSchedule(Update)
			t.expect(app.world:get(target, Health).cur).toBe(5)
			t.expect(#deaths).toBe(0)
			-- tick 3: 5→0 → Dead inserted (DamageSet flush) → DeathSet boundary
			-- reconcile fires monitor onEnter → reaper despawns
			app:runSchedule(Update)
			t.expect(#deaths).toBe(1)
			t.expect(deaths[1]).toBe(target)
			t.expect(app.world.jecs:contains(target)).toBeFalsy() -- despawned

			-- clock advanced 3 ticks (resMut mutation persisted)
			t.expect(app.world:resource(Clock).tick).toBe(3)

			-- determinism: further ticks are no-ops (no attackers' target left)
			app:runSchedule(Update)
			t.expect(#deaths).toBe(1)
		end)
	end)
end
