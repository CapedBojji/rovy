--!nocheck
-- Parallel waits must remain outside every synchronous ECS callback scope.
return function(TS, t)
	local rovy = TS.loadPath("out/rovy").rovy
	local App = TS.loadPath("out/runtime/app").App
	local ScheduleContext = TS.loadPath("out/runtime/schedule-context").ScheduleContext

	local function class()
		local C = {}
		C.__index = C
		C.new = function() return setmetatable({}, C) end
		return C
	end
	local function system(run)
		local C = class()
		C.run = run
		return C
	end
	local function assertBlocked(app)
		local ok, message = pcall(function() app:assertCanYield("parallel wait") end)
		t.expect(ok).toBe(false)
		t.expect(string.find(tostring(message), "cannot yield inside ECS execution", 1, true) ~= nil).toBe(true)
	end
	local function assertAllowed(app)
		t.expect(pcall(function() app:assertCanYield("parallel wait") end)).toBe(true)
	end

	t.describe("parallel synchronous execution guard", function()
		t.it("blocks both system runIf and body, allowing waits between schedules", function()
			rovy:__reset()
			local Update = {}
			local app
			local predicates, runs = 0, 0
			local Probe = system(function()
				assertBlocked(app)
				runs += 1
			end)
			rovy:__schedule(Update, {runOnStart = false})
			rovy:__system(Probe, {
				id = "guard/Probe", schedule = Update, params = {},
				runIf = function()
					assertBlocked(app)
					predicates += 1
					return true
				end,
			})
			app = App.new()
			t.expect(app:enforceSynchronousExecution()).toBe(app)
			app:start()
			assertAllowed(app)
			app:runSchedule(Update)
			assertAllowed(app)
			app:runSchedule(Update)
			assertAllowed(app)
			t.expect(predicates).toBe(2)
			t.expect(runs).toBe(2)
		end)

		t.it("blocks immediate observers outside a schedule", function()
			rovy:__reset()
			local Event = class()
			local app
			local observed = 0
			local Observer = system(function()
				assertBlocked(app)
				observed += 1
			end)
			rovy:__event(Event, {})
			rovy:__observer(Observer, {event = Event, params = {}})
			app = App.new()
			app:enforceSynchronousExecution():start()
			app.world:trigger(Event.new())
			t.expect(observed).toBe(1)
			assertAllowed(app)
		end)

		t.it("blocks monitor entry and immediate change callbacks", function()
			rovy:__reset()
			local Component = class()
			local Monitor = class()
			local app
			local entries, changes = 0, 0
			Monitor.onEnter = function()
				assertBlocked(app)
				entries += 1
			end
			Monitor.onChange = function()
				assertBlocked(app)
				changes += 1
			end
			rovy:__component(Component, "guard/Component")
			rovy:__query({id = "guard/match", terms = {{t = "component", ctor = Component}}, filters = {}})
			rovy:__monitor(Monitor, {match = "guard/match", methods = {"onEnter", "onChange"}, params = {}})
			app = App.new()
			app:enforceSynchronousExecution():start()
			local entity = app.world:spawn(Component.new())
			app:flush()
			t.expect(entries).toBe(1)
			assertAllowed(app)
			app.world:set(entity, Component, Component.new())
			t.expect(changes).toBe(1)
			assertAllowed(app)
		end)

		t.it("blocks participants and post-flush callbacks for app and world flushes", function()
			rovy:__reset()
			rovy:__schedule({}, {runOnStart = false})
			local app = App.new()
			app:enforceSynchronousExecution():start()
			local participants, callbacks = 0, 0
			app:registerFlushParticipant({flush = function()
				assertBlocked(app)
				participants += 1
				return false
			end})
			app:on_post_flush(function()
				assertBlocked(app)
				callbacks += 1
			end)
			app:flush()
			assertAllowed(app)
			app.world:flush()
			assertAllowed(app)
			t.expect(participants).toBe(2)
			t.expect(callbacks).toBe(2)
		end)

		t.it("restores scheduler context depth and guard after system or runIf errors", function()
			for _, failingPhase in {"runIf", "run"} do
				rovy:__reset()
				local Update = {}
				local app
				local fail, successfulRuns = true, 0
				local Probe = system(function(_, context)
					if fail and failingPhase == "run" then app:assertCanYield("parallel wait") end
					t.expect(context.schedule).toBe(Update)
					t.expect(context.dt).toBe(0.25)
					assertBlocked(app)
					successfulRuns += 1
				end)
				rovy:__schedule(Update, {runOnStart = false})
				rovy:__system(Probe, {
					id = "guard/ThrowThenRecover", schedule = Update,
					params = {{kind = "res", ctor = ScheduleContext}},
					runIf = function()
						if fail and failingPhase == "runIf" then app:assertCanYield("parallel wait") end
						return true
					end,
				})
				app = App.new()
				app:enforceSynchronousExecution():start()
				local context = app.world:resource(ScheduleContext)
				local previousSchedule, previousDt, previousRawDt = context.schedule, context.dt, context.rawDt
				local ok, message = pcall(function() app:runSchedule(Update, 0.75) end)
				t.expect(ok).toBe(false)
				t.expect(string.find(tostring(message), "cannot yield inside ECS execution", 1, true) ~= nil).toBe(true)
				assertAllowed(app)
				t.expect(context.schedule).toBe(previousSchedule)
				t.expect(context.dt).toBe(previousDt)
				t.expect(context.rawDt).toBe(previousRawDt)
				fail = false
				local beforeTick = app.world.changeTick
				app:runSchedule(Update, 0.25)
				t.expect(successfulRuns).toBe(1)
				t.expect(app.world.changeTick - beforeTick).toBe(1)
				t.expect(context.schedule).toBe(previousSchedule)
				t.expect(context.dt).toBe(previousDt)
				t.expect(context.rawDt).toBe(previousRawDt)
				assertAllowed(app)
			end
		end)

		t.it("restores guard after a throwing post-flush callback", function()
			rovy:__reset()
			rovy:__schedule({}, {runOnStart = false})
			local app = App.new()
			app:enforceSynchronousExecution():start()
			local unsubscribe = app:on_post_flush(function() app:assertCanYield("parallel wait") end)
			t.expect(pcall(function() app:flush() end)).toBe(false)
			assertAllowed(app)
			unsubscribe()
			app:flush()
			assertAllowed(app)
		end)
	end)
end
