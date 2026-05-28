--!nocheck
-- Phase 21 — inspectable resources.

return function(TS, t)
	local rovy = (TS.loadPath("out/rovy") :: any).rovy
	local App = (TS.loadPath("out/runtime/app") :: any).App

	local function class(init)
		local C = {}
		C.__index = C
		C.new = function(...)
			local self = setmetatable({}, C)
			if init then
				init(self, ...)
			end
			return self
		end
		return C
	end

	local function inspectMeta()
		return {
			fields = {
				{
					key = "tick",
					typeLabel = "number",
					validator = function(value)
						return type(value) == "number"
					end,
				},
			},
		}
	end

	t.describe("Phase 21 — inspectable resources", function()
		t.it("injects clones for inspected resources and commits changed clones after a system run", function()
			rovy:__reset()
			local Update = class()
			local Clock = class(function(self)
				self.tick = 0
			end)
			local holder = {}
			local Tick = class()
			function Tick:run(clock)
				holder.paramWasRaw = clock == holder.raw
				holder.param = clock
				clock.tick += 1
			end

			rovy:__schedule(Update, { runOnStart = false })
			rovy:__resource(Clock, "t/Clock", { inspect = inspectMeta() })
			rovy:__system(Tick, {
				id = "t/Tick",
				schedule = Update,
				params = { { kind = "resMut", ctor = Clock } },
			})

			local app = App.new()
			app:start()
			holder.raw = app.world:resource(Clock)
			app:runSchedule(Update)

			t.expect(holder.paramWasRaw).toBe(false)
			t.expect(app.world:resource(Clock).tick).toBe(1)
			t.expect(app.world:resource(Clock)).toBe(holder.param)
			t.expect(app.world:inspectResources()[1].revision).toBe(1)
			t.expect(app.world:inspectResources()[1].changedPaths[1][1]).toBe("tick")
		end)

		t.it("does not replace the live resource when the inspected clone is unchanged", function()
			rovy:__reset()
			local Update = class()
			local Clock = class(function(self)
				self.tick = 0
			end)
			local holder = {}
			local ReadClock = class()
			function ReadClock:run(clock)
				holder.paramWasRaw = clock == holder.raw
			end

			rovy:__schedule(Update, { runOnStart = false })
			rovy:__resource(Clock, "t/Clock", { inspect = inspectMeta() })
			rovy:__system(ReadClock, {
				id = "t/ReadClock",
				schedule = Update,
				params = { { kind = "res", ctor = Clock } },
			})

			local app = App.new()
			app:start()
			holder.raw = app.world:resource(Clock)
			app:runSchedule(Update)

			t.expect(holder.paramWasRaw).toBe(false)
			t.expect(app.world:resource(Clock)).toBe(holder.raw)
			t.expect(app.world:inspectResources()[1].revision).toBe(0)
		end)

		t.it("passes the live resource when no inspect metadata is registered", function()
			rovy:__reset()
			local Update = class()
			local Clock = class(function(self)
				self.tick = 0
			end)
			local holder = {}
			local Tick = class()
			function Tick:run(clock)
				holder.paramWasRaw = clock == holder.raw
				clock.tick += 1
			end

			rovy:__schedule(Update, { runOnStart = false })
			rovy:__resource(Clock, "t/Clock")
			rovy:__system(Tick, {
				id = "t/Tick",
				schedule = Update,
				params = { { kind = "resMut", ctor = Clock } },
			})

			local app = App.new()
			app:start()
			holder.raw = app.world:resource(Clock)
			app:runSchedule(Update)

			t.expect(holder.paramWasRaw).toBe(true)
			t.expect(app.world:resource(Clock)).toBe(holder.raw)
			t.expect(app.world:resource(Clock).tick).toBe(1)
			t.expect(#app.world:inspectResources()).toBe(0)
		end)

		t.it("commits inspected resource clones after observers and monitors", function()
			rovy:__reset()
			local Clock = class(function(self)
				self.tick = 0
			end)
			local Pulse = class()
			local Flag = class()
			local OnPulse = class()
			function OnPulse:run(_, clock)
				clock.tick += 1
			end
			local OnFlag = class()
			function OnFlag:onEnter(clock)
				clock.tick += 10
			end

			rovy:__resource(Clock, "t/Clock", { inspect = inspectMeta() })
			rovy:__event(Pulse)
			rovy:__observer(OnPulse, {
				event = Pulse,
				priority = 0,
				params = { { kind = "event" }, { kind = "resMut", ctor = Clock } },
			})
			rovy:__component(Flag, "t/Flag")
			rovy:__query({ id = "t/FlagQuery", terms = { { t = "component", ctor = Flag } }, filters = {} })
			rovy:__monitor(OnFlag, {
				match = "t/FlagQuery",
				methods = { "onEnter" },
				params = { { kind = "resMut", ctor = Clock } },
			})

			local app = App.new()
			app:start()
			app.world:trigger(Pulse.new())
			t.expect(app.world:resource(Clock).tick).toBe(1)
			app.world:spawn(Flag.new())
			app:flush()
			t.expect(app.world:resource(Clock).tick).toBe(11)
		end)
	end)
end
