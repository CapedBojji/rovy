--!nocheck
-- Phase 4 exit: scheduler runs systems with resolved params; after/before
-- topo order; Local<T> persists across runs; runOnStart fires once;
-- changeTick bumps per run; commands.runSchedule re-entrancy.

return function(TS, t)
	local rovy = (TS.loadPath("out/rovy") :: any).rovy
	local App = (TS.loadPath("out/runtime/app") :: any).App

	-- roblox-ts-shaped class: methods take self; .new() constructs
	local function sysClass(runFn)
		local C = {}
		C.__index = C
		C.new = function()
			return setmetatable({}, C)
		end
		C.run = function(self, ...)
			return runFn(self, ...)
		end
		return C
	end
	local function plain()
		local C = {}
		C.__index = C
		C.new = function(...)
			local a = { ... }
			return setmetatable({ tick = a[1] or 0 }, C)
		end
		return C
	end

	t.describe("Phase 4 — scheduler + param injection", function()
		t.it("runOnStart fires once; system gets resolved Commands+Res", function()
			rovy:__reset()
			local Update = {}
			local Startup = {}
			local Clock = plain()
			local seen = { count = 0, hadCommands = false, tick = -1 }
			local Boot = sysClass(function(_, commands, clock)
				seen.count += 1
				seen.hadCommands = commands ~= nil and type(commands.spawn) == "function"
				seen.tick = clock.tick
			end)
			rovy:__schedule(Startup, { runOnStart = true })
			rovy:__schedule(Update, { runOnStart = false })
			rovy:__resource(Clock, "t/Clock")
			rovy:__system(Boot, {
				id = "t/Boot",
				schedule = Startup,
				params = { { kind = "commands" }, { kind = "res", ctor = Clock } },
			})

			local app = App.new()
			app:start()
			t.expect(seen.count).toBe(1)
			t.expect(seen.hadCommands).toBeTruthy()
			t.expect(seen.tick).toBe(0)
			-- not re-fired by an Update run
			app:runSchedule(Update)
			t.expect(seen.count).toBe(1)
		end)

		t.it("after/before produce topological order within a set", function()
			rovy:__reset()
			local Update = {}
			rovy:__schedule(Update, { runOnStart = false })
			local order = {}
			local A = sysClass(function() table.insert(order, "A") end)
			local B = sysClass(function() table.insert(order, "B") end)
			local C = sysClass(function() table.insert(order, "C") end)
			-- register C,B,A out of order; constraints force A,B,C
			rovy:__system(C, { id = "t/C", schedule = Update, after = { B }, params = {} })
			rovy:__system(B, { id = "t/B", schedule = Update, after = { A }, params = {} })
			rovy:__system(A, { id = "t/A", schedule = Update, before = { B }, params = {} })

			local app = App.new()
			app:start()
			app:runSchedule(Update)
			t.expect(table.concat(order, ",")).toBe("A,B,C")
		end)

		t.it("Local<T> persists across runs (same instance slot)", function()
			rovy:__reset()
			local Update = {}
			rovy:__schedule(Update, { runOnStart = false })
			local lastSeen = -1
			local Counter = sysClass(function(_, localState)
				localState.n = (localState.n or 0) + 1
				lastSeen = localState.n
			end)
			rovy:__system(Counter, {
				id = "t/Counter",
				schedule = Update,
				params = { { kind = "local", index = 0 } },
			})
			local app = App.new()
			app:start()
			app:runSchedule(Update)
			app:runSchedule(Update)
			app:runSchedule(Update)
			t.expect(lastSeen).toBe(3)
		end)

		t.it("changeTick bumps once per schedule run", function()
			rovy:__reset()
			local Update = {}
			rovy:__schedule(Update, { runOnStart = false })
			local Probe = sysClass(function() end)
			rovy:__system(Probe, { id = "t/Probe", schedule = Update, params = {} })
			local app = App.new()
			app:start()
			local before = app.world.changeTick
			app:runSchedule(Update)
			app:runSchedule(Update)
			t.expect(app.world.changeTick - before).toBe(2)
		end)

		t.it("commands.runSchedule re-entrancy defers tick bump to outer run", function()
			rovy:__reset()
			local Outer = {}
			local Inner = {}
			rovy:__schedule(Outer, { runOnStart = false })
			rovy:__schedule(Inner, { runOnStart = false })
			local innerRuns = 0
			local InnerSys = sysClass(function() innerRuns += 1 end)
			local OuterSys = sysClass(function(_, commands)
				commands:runSchedule(Inner)
			end)
			rovy:__system(InnerSys, { id = "t/InnerSys", schedule = Inner, params = {} })
			rovy:__system(OuterSys, {
				id = "t/OuterSys",
				schedule = Outer,
				params = { { kind = "commands" } },
			})
			local app = App.new()
			app:start()
			local before = app.world.changeTick
			app:runSchedule(Outer)
			t.expect(innerRuns).toBe(1)
			-- inner ran via deferred flush inside outer depth → only the outer
			-- run bumps changeTick (re-entrant inner does not)
			t.expect(app.world.changeTick - before).toBe(1)
		end)
	end)
end
