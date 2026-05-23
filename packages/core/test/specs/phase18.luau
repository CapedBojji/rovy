--!nocheck
-- Phase 18 — built-in ScheduleContext resource and schedule-bound dt.

return function(TS, t)
	local rovy = (TS.loadPath("out/rovy") :: any).rovy
	local App = (TS.loadPath("out/runtime/app") :: any).App
	local ScheduleContext = (TS.loadPath("out/runtime/schedule-context") :: any).ScheduleContext

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

	local function near(a, b)
		return math.abs(a - b) < 1e-6
	end

	t.describe("Phase 18 — ScheduleContext", function()
		t.it("systems that do not request ScheduleContext receive no extra injected arg", function()
			rovy:__reset()
			local Update = {}
			rovy:__schedule(Update, { runOnStart = false })
			local argCount = nil
			local Sys = sysClass(function(_, ...)
				argCount = select("#", ...)
			end)
			rovy:__system(Sys, {
				id = "t/SysNoCtx",
				schedule = Update,
				params = {},
			})
			local app = App.new()
			app:start()
			app:runSchedule(Update, 0.016)
			t.expect(argCount).toBe(0)
		end)

		t.it("captures dt and rawDt from app.runSchedule", function()
			rovy:__reset()
			local Update = {}
			rovy:__schedule(Update, { runOnStart = false })
			local seenDt = nil
			local seenRawDt = nil
			local Sys = sysClass(function(_, ctx)
				seenDt = ctx.dt
				seenRawDt = ctx.rawDt
			end)
			rovy:__system(Sys, {
				id = "t/Sys",
				schedule = Update,
				params = { { kind = "res", ctor = ScheduleContext } },
			})
			local app = App.new()
			app:start()
			app:runSchedule(Update, 0.016)
			t.expect(near(seenDt, 0.016)).toBeTruthy()
			t.expect(near(seenRawDt, 0.016)).toBeTruthy()
		end)

		t.it("clamps negative dt but preserves rawDt", function()
			rovy:__reset()
			local Update = {}
			rovy:__schedule(Update, { runOnStart = false })
			local seenDt = nil
			local seenRawDt = nil
			local Sys = sysClass(function(_, ctx)
				seenDt = ctx.dt
				seenRawDt = ctx.rawDt
			end)
			rovy:__system(Sys, {
				id = "t/Sys",
				schedule = Update,
				params = { { kind = "res", ctor = ScheduleContext } },
			})
			local app = App.new()
			app:start()
			app:runSchedule(Update, -1)
			t.expect(seenDt).toBe(0)
			t.expect(seenRawDt).toBe(-1)
		end)

		t.it("defaults missing dt to zero", function()
			rovy:__reset()
			local Update = {}
			rovy:__schedule(Update, { runOnStart = false })
			local seenDt = nil
			local seenRawDt = nil
			local Sys = sysClass(function(_, ctx)
				seenDt = ctx.dt
				seenRawDt = ctx.rawDt
			end)
			rovy:__system(Sys, {
				id = "t/Sys",
				schedule = Update,
				params = { { kind = "res", ctor = ScheduleContext } },
			})
			local app = App.new()
			app:start()
			app:runSchedule(Update)
			t.expect(seenDt).toBe(0)
			t.expect(seenRawDt).toBe(0)
		end)

		t.it("frame increments per run and elapsed accumulates clamped dt", function()
			rovy:__reset()
			local Update = {}
			rovy:__schedule(Update, { runOnStart = false })
			local app = App.new()
			app:start()
			local ctx = app.world:resource(ScheduleContext)
			t.expect(ctx.frame).toBe(0)
			t.expect(ctx.elapsed).toBe(0)
			app:runSchedule(Update, 0.01)
			app:runSchedule(Update, -1)
			app:runSchedule(Update, 0.02)
			t.expect(ctx.frame).toBe(3)
			t.expect(near(ctx.elapsed, 0.03)).toBeTruthy()
		end)

		t.it("nested runs swap schedule view and restore outer dt after inner completes", function()
			rovy:__reset()
			local Outer = {}
			local Inner = {}
			local QueueInner = {}
			local ObserveOuter = {}
			rovy:__schedule(Outer, { runOnStart = false })
			rovy:__schedule(Inner, { runOnStart = false })

			local seen = {
				outerBeforeSchedule = nil,
				outerBeforeDt = nil,
				innerSchedule = nil,
				innerDt = nil,
				outerAfterSchedule = nil,
				outerAfterDt = nil,
			}

			local InnerSys = sysClass(function(_, ctx)
				seen.innerSchedule = ctx.schedule
				seen.innerDt = ctx.dt
			end)
			local OuterQueueSys = sysClass(function(_, commands, ctx)
				seen.outerBeforeSchedule = ctx.schedule
				seen.outerBeforeDt = ctx.dt
				commands:runSchedule(Inner)
			end)
			local OuterObserveSys = sysClass(function(_, ctx)
				seen.outerAfterSchedule = ctx.schedule
				seen.outerAfterDt = ctx.dt
			end)

			rovy:__system(InnerSys, {
				id = "t/InnerSys",
				schedule = Inner,
				params = { { kind = "res", ctor = ScheduleContext } },
			})
			rovy:__system(OuterQueueSys, {
				id = "t/OuterQueueSys",
				schedule = Outer,
				set = QueueInner,
				params = { { kind = "commands" }, { kind = "res", ctor = ScheduleContext } },
			})
			rovy:__system(OuterObserveSys, {
				id = "t/OuterObserveSys",
				schedule = Outer,
				set = ObserveOuter,
				params = { { kind = "res", ctor = ScheduleContext } },
			})

			local app = App.new()
			app:configureSets(Outer, { QueueInner, ObserveOuter })
			app:start()
			app:runSchedule(Outer, 0.5)

			t.expect(seen.outerBeforeSchedule).toBe(Outer)
			t.expect(seen.outerBeforeDt).toBe(0.5)
			t.expect(seen.innerSchedule).toBe(Inner)
			t.expect(seen.innerDt).toBe(0)
			t.expect(seen.outerAfterSchedule).toBe(Outer)
			t.expect(seen.outerAfterDt).toBe(0.5)
		end)
	end)
end
