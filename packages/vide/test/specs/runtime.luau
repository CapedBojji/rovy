--!nocheck

return function(TS, t)
	local vide = TS.loadPath("out/init")
	local rovyVide = vide.rovyVide
	local mountView = vide.mountView
	local unmountView = vide.unmountView
	local rovy = (TS.loadPath("node_modules/@rovy/core/out/rovy") :: any).rovy
	local App = (TS.loadPath("node_modules/@rovy/core/out/runtime/app") :: any).App

	local function class(methods)
		local C = {}
		C.__index = C
		C.new = function()
			return setmetatable({}, C)
		end
		for key, value in pairs(methods) do
			C[key] = value
		end
		return C
	end

	local function component(ctor)
		local C = {}
		C.__index = C
		C.new = function(...)
			return setmetatable(ctor(...) or {}, C)
		end
		return C
	end

	local Update = {}
	local Position = component(function(x) return { x = x } end)
	local Unit = component(function() return {} end)
	local DamageTaken = component(function(amount) return { amount = amount } end)

	local function startApp()
		rovy:__schedule(Update, { runOnStart = false })
		local app = App.new()
		app:start()
		return app
	end

	t.describe("@rovy/vide runtime", function()
		t.it("mounts and unmounts a root view", function()
			rovy:__reset()
			rovyVide:__reset()

			local renders = 0
			local Root = class({
				render = function(_self, _ctx)
					renders += 1
				end,
			})
			rovyVide:__view(Root, { id = "test/Root", methods = { "render" } })

			local app = startApp()
			local handle = mountView(app, Root)

			t.expect(renders).toBe(1)
			unmountView(handle)
		end)

		t.it("ctx.query returns sources for multiple current query rows", function()
			rovy:__reset()
			rovyVide:__reset()
			rovy:__component(Position, "test/Position")
			rovy:__component(Unit, "test/Unit")
			rovy:__query({
				id = "view/rows",
				terms = {
					{ t = "entity" },
					{ t = "component", ctor = Position },
				},
				filters = {},
			})
			rovy:__query({
				id = "view/units",
				terms = {
					{ t = "entity" },
				},
				filters = { with = { Unit } },
			})

			local rows
			local units
			local Root = class({
				render = function(_self, ctx)
					rows = ctx:query("view/rows")
					units = ctx:query("view/units")
				end,
			})
			rovyVide:__view(Root, { id = "test/Root", methods = { "render" } })

			local app = startApp()
			local handle = mountView(app, Root)
			t.expect(#rows()).toBe(0)
			t.expect(#units()).toBe(0)

			local entity = app.world:spawn(Position.new(4))
			t.expect(#rows()).toBe(1)
			t.expect(rows()[1][2].x).toBe(4)
			t.expect(#units()).toBe(0)

			app.world:insert(entity, Unit)
			t.expect(#rows()).toBe(1)
			t.expect(#units()).toBe(1)

			unmountView(handle)
		end)

		t.it("ctx.events returns a source of received Rovy events", function()
			rovy:__reset()
			rovyVide:__reset()
			rovy:__event(DamageTaken, {})

			local damageEvents
			local Root = class({
				render = function(_self, ctx)
					damageEvents = ctx:events(DamageTaken)
				end,
			})
			rovyVide:__view(Root, {
				id = "test/Events",
				methods = { "render" },
			})

			local app = startApp()
			local handle = mountView(app, Root)
			t.expect(#damageEvents()).toBe(0)
			app.world:trigger(DamageTaken.new(12))

			t.expect(#damageEvents()).toBe(1)
			t.expect(damageEvents()[1].amount).toBe(12)
			unmountView(handle)
		end)

		t.it("ctx.events can keep only the latest received events", function()
			rovy:__reset()
			rovyVide:__reset()
			rovy:__event(DamageTaken, {})

			local damageEvents
			local Root = class({
				render = function(_self, ctx)
					damageEvents = ctx:events(DamageTaken, { limit = 2 })
				end,
			})
			rovyVide:__view(Root, {
				id = "test/EventsState",
				methods = { "render" },
			})

			local app = startApp()
			local handle = mountView(app, Root)
			app.world:trigger(DamageTaken.new(10))
			app.world:trigger(DamageTaken.new(20))
			app.world:trigger(DamageTaken.new(30))

			t.expect(#damageEvents()).toBe(2)
			t.expect(damageEvents()[1].amount).toBe(20)
			t.expect(damageEvents()[2].amount).toBe(30)
			unmountView(handle)
		end)

		t.it("injects reactive Query params with row objects and query helpers", function()
			rovy:__reset()
			rovyVide:__reset()
			rovy:__component(Position, "test/Position")
			rovy:__query({
				id = "view/positions",
				terms = {
					{ t = "entity" },
					{ t = "component", ctor = Position },
				},
				filters = {},
			})

			local query
			local Root = class({
				render = function(_self, injected)
					query = injected
				end,
			})
			rovyVide:__view(Root, {
				id = "test/InjectedQuery",
				methods = { "render" },
				params = { { kind = "query", handle = "view/positions" } },
			})

			local app = startApp()
			local handle = mountView(app, Root)
			t.expect(query:size()).toBe(0)

			local entity = app.world:spawn(Position.new(2))
			t.expect(query:size()).toBe(1)
			t.expect(query:has(entity)).toBe(true)
			t.expect(query:members()[1]).toBe(entity)
			t.expect(query:rows()()[1].entity).toBe(entity)
			t.expect(query:rows()()[1].values[2].x).toBe(2)
			local firstRow = query:rows()()[1]

			local seen = {}
			query:forEach(function(e, pos)
				seen.entity = e
				seen.x = pos.x
			end)
			t.expect(seen.entity).toBe(entity)
			t.expect(seen.x).toBe(2)

			app.world:set(entity, Position, Position.new(5))
			t.expect(query:rows()()[1]).toBe(firstRow)
			t.expect(query:rows()()[1].values[2].x).toBe(5)
			unmountView(handle)
		end)

		t.it("injects ViewMonitor params with current entered changed and exited sources", function()
			rovy:__reset()
			rovyVide:__reset()
			rovy:__component(Position, "test/Position")
			rovy:__query({
				id = "view/monitor",
				terms = {
					{ t = "entity" },
					{ t = "component", ctor = Position },
				},
				filters = {},
			})

			local monitor
			local Root = class({
				render = function(_self, injected)
					monitor = injected
				end,
			})
			rovyVide:__view(Root, {
				id = "test/Monitor",
				methods = { "render" },
				params = { { kind = "viewMonitor", handle = "view/monitor" } },
			})

			local app = startApp()
			local handle = mountView(app, Root)
			local entity = app.world:spawn(Position.new(1))

			t.expect(#monitor:current()()).toBe(1)
			t.expect(monitor:entered()()[1].entity).toBe(entity)
			t.expect(#monitor:changed()()).toBe(0)
			t.expect(#monitor:exited()()).toBe(0)

			app.world:set(entity, Position, Position.new(7))
			t.expect(#monitor:entered()()).toBe(0)
			t.expect(monitor:changed()()[1].entity).toBe(entity)
			t.expect(monitor:changed()()[1].values[2].x).toBe(7)

			app.world:despawn(entity)
			t.expect(#monitor:current()()).toBe(0)
			t.expect(monitor:exited()()[1].entity).toBe(entity)
			t.expect(monitor:exited()()[1].values[2].x).toBe(7)
			unmountView(handle)
		end)

		t.it("injects resource proxies and updates reads on resource changes", function()
			rovy:__reset()
			rovyVide:__reset()
			local Clock = component(function(tick) return { tick = tick or 0 } end)
			rovy:__resource(Clock, "test/Clock")

			local clock
			local mutableClock
			local Root = class({
				render = function(_self, injectedClock, injectedMutableClock)
					clock = injectedClock
					mutableClock = injectedMutableClock
				end,
			})
			rovyVide:__view(Root, {
				id = "test/Resources",
				methods = { "render" },
				params = {
					{ kind = "res", ctor = Clock },
					{ kind = "resMut", ctor = Clock },
				},
			})

			local app = startApp()
			local handle = mountView(app, Root)
			t.expect(clock.tick).toBe(0)

			app:insertResource(Clock.new(12))
			t.expect(clock.tick).toBe(12)

			mutableClock.tick = 20
			t.expect(clock.tick).toBe(20)
			t.expect(app.world:resource(Clock).tick).toBe(20)
			unmountView(handle)
		end)

		t.it("injects reactive EventReader params for buffered events", function()
			rovy:__reset()
			rovyVide:__reset()
			rovy:__event(DamageTaken, {})

			local reader
			local Root = class({
				render = function(_self, injected)
					reader = injected
				end,
			})
			rovyVide:__view(Root, {
				id = "test/EventReader",
				methods = { "render" },
				params = { { kind = "eventReader", ctor = DamageTaken } },
			})

			local app = startApp()
			local handle = mountView(app, Root)
			t.expect(reader:size()).toBe(0)

			app.commands:send(DamageTaken.new(44))
			app:flush()
			t.expect(reader:size()).toBe(1)
			t.expect(reader:events()()[1].amount).toBe(44)

			local seen = 0
			reader:forEach(function(event)
				seen += event.amount
			end)
			t.expect(seen).toBe(44)
			unmountView(handle)
		end)

		t.it("injects commands and world for explicit handler-style mutations", function()
			rovy:__reset()
			rovyVide:__reset()
			rovy:__component(Position, "test/Position")
			rovy:__query({
				id = "view/commands",
				terms = {
					{ t = "component", ctor = Position },
				},
				filters = {},
			})

			local commands
			local world
			local query
			local Root = class({
				render = function(_self, injectedCommands, injectedWorld, injectedQuery)
					commands = injectedCommands
					world = injectedWorld
					query = injectedQuery
				end,
			})
			rovyVide:__view(Root, {
				id = "test/Commands",
				methods = { "render" },
				params = {
					{ kind = "commands" },
					{ kind = "world" },
					{ kind = "query", handle = "view/commands" },
				},
			})

			local app = startApp()
			local handle = mountView(app, Root)
			t.expect(world).toBe(app.world)
			commands:spawn(Position.new(9))
			app:flush()
			t.expect(query:size()).toBe(1)
			t.expect(query:rows()()[1].values[1].x).toBe(9)
			unmountView(handle)
		end)
	end)
end
