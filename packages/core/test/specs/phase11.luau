--!nocheck
-- Phase 11 exit: plugin.build() configures sets / inserts resources before
-- finalize; dev validation throws a named error for missing @resource /
-- @event deps; loadPaths delegates (provider injectable).

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
	local SetA = {}
	local SetB = {}
	local Clock = class(function(t) return { t = t or 0 } end)

	t.describe("Phase 11 — plugins + validation + loadPaths", function()
		t.it("plugin.build runs before finalize: configureSets + insertResource", function()
			rovy:__reset()
			rovy:__component(Clock, "t/Clock")
			rovy:__resource(Clock, "t/ClockRes")
			rovy:__schedule(Update, { runOnStart = false })
			local order = {}
			local A = sysClass(function() table.insert(order, "A") end)
			local B = sysClass(function() table.insert(order, "B") end)
			rovy:__system(B, { id = "t/B", schedule = Update, set = SetB, params = {} })
			rovy:__system(A, { id = "t/A", schedule = Update, set = SetA, params = {} })

			local pluginRan = false
			local Plugin = {
				build = function(self, app)
					pluginRan = true
					app:configureSets(Update, { SetA, SetB })
					app:insertResource(Clock.new(123))
				end,
			}
			local app = App.new()
			app:addPlugin(Plugin)
			app:start()
			t.expect(pluginRan).toBeTruthy()
			app:runSchedule(Update)
			t.expect(table.concat(order, ",")).toBe("A,B") -- set order from plugin
			t.expect(app.world:resource(Clock).t).toBe(123) -- resource override from plugin
		end)

		t.it("dev validation: system needing unregistered @resource throws named", function()
			rovy:__reset()
			rovy:__schedule(Update, { runOnStart = false })
			local Missing = class(function() return {} end) -- never @resource
			local S = sysClass(function() end)
			rovy:__system(S, {
				id = "sys/NeedsRes",
				schedule = Update,
				params = { { kind = "res", ctor = Missing } },
			})
			local app = App.new()
			local ok, err = pcall(function() app:start() end)
			t.expect(ok).toBeFalsy()
			t.expect(tostring(err):find("sys/NeedsRes") ~= nil).toBeTruthy()
		end)

		t.it("dev validation: observer needing unregistered @event throws", function()
			rovy:__reset()
			rovy:__schedule(Update, { runOnStart = false })
			local Ghost = class(function() return {} end) -- never @event
			local Obs = sysClass(function() end)
			rovy:__observer(Obs, {
				event = Ghost,
				priority = 0,
				params = { { kind = "eventReader", ctor = Ghost } },
			})
			local app = App.new()
			-- registerObserver itself asserts the @event is registered
			t.expect(function() app:start() end).toThrow()
		end)

		t.it("OptRes for an unregistered resource is allowed (returns undefined)", function()
			rovy:__reset()
			rovy:__schedule(Update, { runOnStart = false })
			local Maybe = class(function() return {} end)
			local got = { called = false, val = "x" }
			local S = sysClass(function(_, maybe)
				got.called = true
				got.val = maybe
			end)
			rovy:__system(S, {
				id = "t/Opt",
				schedule = Update,
				params = { { kind = "optRes", ctor = Maybe } },
			})
			local app = App.new()
			app:start() -- must NOT throw (optRes tolerant)
			app:runSchedule(Update)
			t.expect(got.called).toBeTruthy()
			t.expect(got.val).toBeUndefined()
		end)

		t.it("loadPaths delegates to injected provider (idempotent registries)", function()
			rovy:__reset()
			local calls = 0
			rovy:setModuleProvider(function(roots)
				calls += 1
			end)
			rovy:loadPaths("a")
			rovy:loadPaths("b", "c")
			t.expect(calls).toBe(2)
		end)

		t.it("plugin-owned systems/resources stay inactive until that plugin is added", function()
			rovy:__reset()
			rovy:__schedule(Update, { runOnStart = false })

			local PluginOwner = {}
			PluginOwner.__index = PluginOwner
			PluginOwner.new = function()
				return setmetatable({}, PluginOwner)
			end
			PluginOwner.build = function() end

			local ClockRes = class(function(t) return { t = t or 0 } end)
			local Tick = sysClass(function(_, clock)
				clock.t += 1
			end)

			rovy:__plugin(PluginOwner, { id = "t/PluginOwner", root = "t" })
			rovy:__resource(ClockRes, "plugin/ClockRes", { plugin = PluginOwner })
			rovy:__system(Tick, {
				id = "plugin/Tick",
				plugin = PluginOwner,
				schedule = Update,
				params = { { kind = "resMut", ctor = ClockRes } },
			})

			local inactiveApp = App.new()
			inactiveApp:start()
			inactiveApp:runSchedule(Update)
			t.expect(function() return inactiveApp.world:resource(ClockRes) end).toThrow()

			local activeApp = App.new()
			activeApp:addPlugin(PluginOwner.new())
			activeApp:start()
			activeApp:runSchedule(Update)
			t.expect(activeApp.world:resource(ClockRes).t).toBe(1)
		end)
	end)
end
