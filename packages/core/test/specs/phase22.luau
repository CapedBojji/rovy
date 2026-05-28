--!nocheck
-- Phase 22 — app lifecycle hooks.

return function(TS, t)
	local rovy = (TS.loadPath("out/rovy") :: any).rovy
	local App = (TS.loadPath("out/runtime/app") :: any).App
	local LifecyclePrintPlugin = (TS.loadPath("out/runtime/lifecycle") :: any).LifecyclePrintPlugin

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

	local function indexOf(list, value)
		for i, item in list do
			if item == value then
				return i
			end
		end
		return nil
	end

	t.describe("Phase 22 — app lifecycle hooks", function()
		t.it("emits entity and component hooks with broad, filtered, and unsubscribe paths", function()
			rovy:__reset()
			local Position = class(function(self, x)
				self.x = x
			end)
			local Health = class(function(self, value)
				self.value = value
			end)
			rovy:__component(Position, "t/Position")
			rovy:__component(Health, "t/Health")

			local app = App.new()
			local spawned = 0
			local broadAdds = 0
			local positionAdds = 0
			local healthAdds = 0
			app:on_entity_spawned(function(record)
				spawned += 1
				t.expect(record.kind).toBe("entity_spawned")
				t.expect(record.world).toBe(app.world)
				t.expect(record.app).toBe(app)
			end)
			app:on_component_added(function()
				broadAdds += 1
			end)
			app:on_component_added(Position, function(record)
				positionAdds += 1
				t.expect(record.id).toBe("t/Position")
				t.expect(record.name).toBe("Position")
				t.expect(record.value.x).toBe(5)
			end)
			local unsubscribe = app:on_component_added(Health, function()
				healthAdds += 1
			end)
			unsubscribe()

			app:start()
			local entity = app.world:spawn(Position.new(5), Health.new(10))

			t.expect(spawned).toBe(1)
			t.expect(entity).never.toBeUndefined()
			t.expect(broadAdds).toBe(2)
			t.expect(positionAdds).toBe(1)
			t.expect(healthAdds).toBe(0)
		end)

		t.it("dispatches system start and finish around resource and component changes", function()
			rovy:__reset()
			local Update = class()
			local Position = class(function(self, x)
				self.x = x
			end)
			local Clock = class(function(self)
				self.tick = 0
			end)
			local Tick = class()
			function Tick:run(world, clock)
				world:spawn(Position.new(3))
				clock.tick += 1
			end

			rovy:__schedule(Update, { runOnStart = false })
			rovy:__component(Position, "t/Position")
			rovy:__resource(Clock, "t/Clock", { inspect = inspectMeta() })
			rovy:__system(Tick, {
				id = "t/Tick",
				schedule = Update,
				params = { { kind = "world" }, { kind = "resMut", ctor = Clock } },
			})

			local app = App.new()
			local order = {}
			app:on_system_started(Tick, function()
				table.insert(order, "system_started")
			end)
			app:on_system_finished(Tick, function()
				table.insert(order, "system_finished")
			end)
			app:on_component_added(Position, function()
				table.insert(order, "component_added")
			end)
			app:on_resource_changed(Clock, function(record)
				table.insert(order, "resource_changed")
				t.expect(record.paths[1][1]).toBe("tick")
			end)

			app:start()
			app:runSchedule(Update)

			t.expect(indexOf(order, "system_started") < indexOf(order, "system_finished")).toBeTruthy()
			t.expect(indexOf(order, "system_finished") < indexOf(order, "component_added")).toBeTruthy()
			t.expect(indexOf(order, "system_finished") < indexOf(order, "resource_changed")).toBeTruthy()
			t.expect(app.world:resource(Clock).tick).toBe(1)
		end)

		t.it("emits relation added changed and removed hooks", function()
			rovy:__reset()
			local Marker = class()
			local Link = class(function(self, label)
				self.label = label
			end)
			rovy:__component(Marker, "t/Marker")
			rovy:__relation(Link, { exclusive = false, onTargetDelete = "none", onDelete = "none" })

			local app = App.new()
			local added = 0
			local changed = 0
			local removed = 0
			app:on_relation_added(Link, function(record)
				added += 1
				t.expect(record.data.label).toBe("a")
			end)
			app:on_relation_changed(Link, function(record)
				changed += 1
				t.expect(record.data.label).toBe("b")
			end)
			app:on_relation_removed(Link, function(record)
				removed += 1
				t.expect(record.oldValue.label).toBe("b")
			end)

			app:start()
			local source = app.world:spawn()
			local target = app.world:spawn()
			app.world:relate(source, Link, target, Link.new("a"))
			app.world:relate(source, Link, target, Link.new("b"))
			app.world:unrelate(source, Link, target)

			t.expect(added).toBe(1)
			t.expect(changed).toBe(1)
			t.expect(removed).toBe(1)
		end)

		t.it("wraps observer and monitor callbacks and dispatches their resource changes after finish", function()
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
			local order = {}
			app:on_observer_started(OnPulse, function()
				table.insert(order, "observer_started")
			end)
			app:on_observer_finished(OnPulse, function()
				table.insert(order, "observer_finished")
			end)
			app:on_monitor_started(OnFlag, function(record)
				table.insert(order, "monitor_" .. tostring(record.method) .. "_started")
			end)
			app:on_monitor_finished(OnFlag, function(record)
				table.insert(order, "monitor_" .. tostring(record.method) .. "_finished")
			end)
			app:on_resource_changed(Clock, function()
				table.insert(order, "resource_changed")
			end)

			app:start()
			app.world:trigger(Pulse.new())
			app.world:spawn(Flag.new())
			app:flush()

			t.expect(indexOf(order, "observer_started") < indexOf(order, "observer_finished")).toBeTruthy()
			t.expect(indexOf(order, "observer_finished") < indexOf(order, "resource_changed")).toBeTruthy()
			t.expect(indexOf(order, "monitor_onEnter_started") < indexOf(order, "monitor_onEnter_finished")).toBeTruthy()
			t.expect(app.world:resource(Clock).tick).toBe(11)
		end)

		t.it("continues dispatch after listener errors", function()
			rovy:__reset()
			local Tag = class()
			rovy:__component(Tag, "t/Tag")

			local app = App.new()
			local seen = false
			app:on_entity_spawned(function()
				error("boom")
			end)
			app:on_entity_spawned(function()
				seen = true
			end)

			app:start()
			app.world:spawn(Tag)

			t.expect(seen).toBe(true)
		end)

		t.it("print plugin subscribes to selected hooks without side effects", function()
			rovy:__reset()
			local Tag = class()
			rovy:__component(Tag, "t/Tag")

			local app = App.new()
			app:addPlugin(LifecyclePrintPlugin.new({ hooks = { "entity_spawned" } }))
			app:start()
			local entity = app.world:spawn(Tag)

			t.expect(entity).never.toBeUndefined()
		end)
	end)
end
