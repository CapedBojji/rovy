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

	local function hasChangedPath(paths, key)
		for _, path in paths do
			if path[1] == key then
				return true
			end
		end
		return false
	end

	t.describe("Phase 21 — inspectable resources", function()
		t.it("snapshots inspected resources and reports live mutations after a system run", function()
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

			t.expect(holder.paramWasRaw).toBe(true)
			t.expect(app.world:resource(Clock).tick).toBe(1)
			t.expect(app.world:resource(Clock)).toBe(holder.raw)
			t.expect(app.world:inspectResources()[1].revision).toBe(1)
			t.expect(app.world:inspectResources()[1].changedPaths[1][1]).toBe("tick")
		end)

		t.it("deep-clones baseline snapshots while preserving table keys and non-table leaf references", function()
			rovy:__reset()
			local Update = class()
			local Root = { label = "root" }
			local OtherRoot = { label = "root" }
			local Callback = function()
				return "ok"
			end
			local Nested = { count = 0, callback = Callback }
			local UiState = class(function(self)
				self.tick = 0
				self.map = {
					[Root] = { count = 0, callback = Callback },
				}
				self.nested = Nested
			end)
			local holder = {}
			local Touch = class()
			function Touch:run(state)
				holder.paramWasRaw = state == holder.raw
				holder.param = state
				holder.mapWasRaw = state.map == holder.raw.map
				holder.rootKeyValue = state.map[Root]
				holder.rootValueWasRaw = state.map[Root] == holder.raw.map[Root]
				holder.rootCallbackWasExact = state.map[Root].callback == Callback
				holder.nestedWasRaw = state.nested == Nested
				holder.nestedCallbackWasExact = state.nested.callback == Callback
				state.tick += 1
				state.map[Root].count += 1
				state.nested.count += 1
				state.otherRoot = OtherRoot
			end

			rovy:__schedule(Update, { runOnStart = false })
			rovy:__resource(UiState, "t/UiState", {
				inspect = {
					fields = {
						{ key = "tick", typeLabel = "number", validator = function(value)
							return type(value) == "number"
						end },
						{ key = "map", typeLabel = "table", validator = function()
							return true
						end },
						{ key = "nested", typeLabel = "table", validator = function()
							return true
						end },
						{ key = "otherRoot", typeLabel = "table", validator = function()
							return true
						end },
					},
				},
			})
			rovy:__system(Touch, {
				id = "t/Touch",
				schedule = Update,
				params = { { kind = "resMut", ctor = UiState } },
			})

			local app = App.new()
			app:start()
			holder.raw = app.world:resource(UiState)
			app:runSchedule(Update)

			local live = app.world:resource(UiState)
			local changedPaths = app.world:inspectResources()[1].changedPaths
			t.expect(holder.paramWasRaw).toBe(true)
			t.expect(holder.mapWasRaw).toBe(true)
			t.expect(holder.rootKeyValue).never.toBeUndefined()
			t.expect(holder.rootValueWasRaw).toBe(true)
			t.expect(holder.rootCallbackWasExact).toBe(true)
			t.expect(holder.nestedWasRaw).toBe(true)
			t.expect(holder.nestedCallbackWasExact).toBe(true)
			t.expect(live).toBe(holder.raw)
			t.expect(live.tick).toBe(1)
			t.expect(live.map).toBe(holder.raw.map)
			t.expect(live.map[Root]).never.toBeUndefined()
			t.expect(live.map[Root].count).toBe(1)
			t.expect(live.map[Root].callback).toBe(Callback)
			t.expect(live.nested).toBe(Nested)
			t.expect(live.nested.count).toBe(1)
			t.expect(live.nested.callback).toBe(Callback)
			t.expect(live.otherRoot).toBe(OtherRoot)
			t.expect(hasChangedPath(changedPaths, "tick")).toBe(true)
			t.expect(hasChangedPath(changedPaths, "map")).toBe(true)
			t.expect(hasChangedPath(changedPaths, "nested")).toBe(true)
			t.expect(hasChangedPath(changedPaths, "otherRoot")).toBe(true)
		end)

		t.it("keeps live resource identity and ignores unchanged object-key tables", function()
			rovy:__reset()
			local Update = class()
			local Root = { label = "root" }
			local Callback = function()
				return "ok"
			end
			local Clock = class(function(self)
				self.tick = 0
				self.map = {
					[Root] = { callback = Callback },
				}
			end)
			local holder = {}
			local ReadClock = class()
			function ReadClock:run(clock)
				holder.paramWasRaw = clock == holder.raw
			end

			rovy:__schedule(Update, { runOnStart = false })
			rovy:__resource(Clock, "t/Clock", {
				inspect = {
					fields = {
						{ key = "tick", typeLabel = "number", validator = function(value)
							return type(value) == "number"
						end },
						{ key = "map", typeLabel = "table", validator = function()
							return true
						end },
					},
				},
			})
			rovy:__system(ReadClock, {
				id = "t/ReadClock",
				schedule = Update,
				params = { { kind = "res", ctor = Clock } },
			})

			local app = App.new()
			app:start()
			holder.raw = app.world:resource(Clock)
			app:runSchedule(Update)

			t.expect(holder.paramWasRaw).toBe(true)
			t.expect(app.world:resource(Clock)).toBe(holder.raw)
			t.expect(app.world:resource(Clock).map[Root].callback).toBe(Callback)
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

		t.it("reports inspected resource mutations after observers and monitors", function()
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
