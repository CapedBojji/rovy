--!nocheck
-- $queryTrigger: snapshot-diff driven re-renders on added/changed/removed, with
-- the injected Query reflecting live membership, and event-kind filtering.

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)

	-- Build a query trigger descriptor bound to a registered query handle.
	local function queryTriggerFor(handle, on)
		local descriptor = H.queryTrigger({ on = on })
		descriptor.handle = handle -- the transformer fills this from the query id
		return descriptor
	end

	local function setup(on)
		local Health = H.class(function(v)
			return { value = v or 100 }
		end)
		H.rovy:__component(Health, "test/Health")
		H.rovy:__query({
			id = "q#health",
			terms = { { t = "entity" }, { t = "component", ctor = Health } },
			filters = {},
		})
		local stats = { renders = 0 }
		local Comp = H.uiClass("test/Roster", function(self, q)
			stats.renders += 1
			return H.textLabel({ Name = "Status", Text = "count=" .. tostring(q:size()) })
		end, {
			params = { { kind = "query", handle = "q#health" } },
			triggers = { queryTriggerFor("q#health", on or { "added", "changed", "removed" }) },
		})
		return Health, Comp, stats
	end

	t.describe("$queryTrigger", function()
		t.it("re-renders and updates size when an entity enters the query", function()
			H.reset()
			local Health, Comp, stats = setup()
			local app = H.startedApp()
			local target = H.target()
			H.mountUi(app, Comp, { target = target })
			t.expect(target:FindFirstChild("Status").Text).toBe("count=0")

			app.world:spawn(Health.new(50))
			H.settle(app)
			t.expect(target:FindFirstChild("Status").Text).toBe("count=1")
			t.expect(stats.renders).toBe(2)

			app.world:spawn(Health.new(60))
			H.settle(app)
			t.expect(target:FindFirstChild("Status").Text).toBe("count=2")
		end)

		t.it("re-renders on a changed row value", function()
			H.reset()
			local Health, Comp, stats = setup()
			local app = H.startedApp()
			local e = app.world:spawn(Health.new(50))
			H.mountUi(app, Comp, { target = H.target() })
			local baseline = stats.renders

			app.world:set(e, Health, Health.new(51))
			H.settle(app)
			t.expect(stats.renders > baseline).toBeTruthy()
		end)

		t.it("re-renders and shrinks size when an entity leaves the query", function()
			H.reset()
			local Health, Comp, stats = setup()
			local app = H.startedApp()
			local e = app.world:spawn(Health.new(50))
			local target = H.target()
			H.mountUi(app, Comp, { target = target })
			t.expect(target:FindFirstChild("Status").Text).toBe("count=1")

			app.world:remove(e, Health)
			H.settle(app)
			t.expect(target:FindFirstChild("Status").Text).toBe("count=0")
		end)

		t.it("added-only filter ignores value changes", function()
			H.reset()
			local Health, Comp, stats = setup({ "added" })
			local app = H.startedApp()
			local e = app.world:spawn(Health.new(50))
			H.mountUi(app, Comp, { target = H.target() })
			local baseline = stats.renders

			app.world:set(e, Health, Health.new(999))
			H.settle(app)
			t.expect(stats.renders).toBe(baseline) -- "changed" not in the filter
		end)

		t.it("changed-only filter ignores additions", function()
			H.reset()
			local Health, Comp, stats = setup({ "changed" })
			local app = H.startedApp()
			H.mountUi(app, Comp, { target = H.target() })
			local baseline = stats.renders

			app.world:spawn(Health.new(99))
			H.settle(app)
			t.expect(stats.renders).toBe(baseline)
		end)

		t.it("does not re-render when a changed row value is structurally equal", function()
			H.reset()
			local Health, Comp, stats = setup()
			local app = H.startedApp()
			local e = app.world:spawn(Health.new(50))
			H.mountUi(app, Comp, { target = H.target() })
			local baseline = stats.renders

			app.world:set(e, Health, Health.new(50))
			H.settle(app)
			t.expect(stats.renders > baseline).toBeTruthy()
		end)

		t.it("re-renders when a query row value count changes", function()
			H.reset()
			local Seed = H.class(function(value)
				return { value = value or 1 }
			end)
			H.rovy:__component(Seed, "test/Seed")
			H.rovy:__query({
				id = "q#shape",
				terms = { { t = "entity" }, { t = "component", ctor = Seed } },
				filters = {},
			})
			local app = H.startedApp()
			local seedEntity = app.world:spawn(Seed.new(1))
			local narrow = { size = 1 }
			local query = app.scheduler.queries.get ~= nil
				and app.scheduler.queries.get("q#shape")
				or app.scheduler.queries["q#shape"]
			assert(query ~= undefined, "shape query should be registered")
			query.rowFor = function(_self: unknown, actual: unknown)
				if actual ~= seedEntity then return nil end
				if narrow.size == 1 then
					return { values = { [1] = "a" }, n = 1 }
				end
				return { values = { [1] = "a", [2] = "b" }, n = 2 }
			end

			local stats = { renders = 0 }
			local changed = false
			app:on_component_changed(function()
				changed = true
			end)
			local Comp = H.uiClass("test/QueryShapeRow", function()
				stats.renders += 1
				return H.textLabel({ Name = "Status", Text = "renders=" .. tostring(stats.renders) })
			end, {
				triggers = { queryTriggerFor("q#shape", { "changed" }) },
			})
			H.mountUi(app, Comp, { target = H.target() })
			t.expect(stats.renders).toBe(1)

			narrow.size = 2
			app.world:set(seedEntity, Seed, Seed.new(2))
			H.settle(app)
			t.expect(changed).toBeTruthy()
			t.expect(stats.renders).toBe(2)
		end)

		t.it("added-only filter ignores removals", function()
			H.reset()
			local Health, Comp, stats = setup({ "added" })
			local app = H.startedApp()
			local e = app.world:spawn(Health.new(11))
			H.mountUi(app, Comp, { target = H.target() })
			local baseline = stats.renders

			app.world:remove(e, Health)
			H.settle(app)
			t.expect(stats.renders).toBe(baseline)
		end)

		t.it("empty filter renders never fire", function()
			H.reset()
			local Health, Comp, stats = setup({})
			local app = H.startedApp()
			H.mountUi(app, Comp, { target = H.target() })
			local baseline = stats.renders

			app.world:spawn(Health.new(1))
			H.settle(app)
			app.world:spawn(Health.new(2))
			H.settle(app)
			t.expect(stats.renders).toBe(baseline)
		end)

		t.it("throws when the query handle is not registered", function()
			H.reset()
			local Comp = H.uiClass("test/BadQuery", function()
				return H.textLabel({ Name = "x" })
			end, {
				triggers = { queryTriggerFor("q#missing", { "added" }) },
			})
			local app = H.startedApp()
			t.expect(function()
				H.mountUi(app, Comp, { target = H.target() })
			end).toThrow()
		end)

		t.it("removed-only filter ignores additions and changes", function()
			H.reset()
			local Health, Comp, stats = setup({ "removed" })
			local app = H.startedApp()
			local e = app.world:spawn(Health.new(11))
			H.mountUi(app, Comp, { target = H.target() })
			t.expect(stats.renders).toBe(1)

			app.world:spawn(Health.new(22))
			H.settle(app)
			t.expect(stats.renders).toBe(1)
			app.world:set(e, Health, Health.new(33))
			H.settle(app)
			t.expect(stats.renders).toBe(1)

			app.world:remove(e, Health)
			H.settle(app)
			t.expect(stats.renders).toBe(2)
		end)

		t.it("re-renders when optional query row values change", function()
			H.reset()
			local Anchor = H.class(function(value)
				return { value = value or "anchor" }
			end)
			local Target = H.class(function(value)
				return { value = value or 1 }
			end)
			H.rovy:__component(Anchor, "test/Anchor")
			H.rovy:__component(Target, "test/Target")
			H.rovy:__query({
				id = "q#optional",
				terms = { { t = "entity" }, { t = "component", ctor = Anchor }, { t = "optional", ctor = Target } },
				filters = {},
			})
			local app = H.startedApp()
			local entity = app.world:spawn(Anchor.new("base"), Target.new(1))

			local stats = { renders = 0 }
			local Comp = H.uiClass("test/QueryOptionalRow", function()
				stats.renders += 1
				return H.textLabel({ Name = "Status", Text = "count=" .. tostring(stats.renders) })
			end, {
				params = { { kind = "query", handle = "q#optional" } },
				triggers = { queryTriggerFor("q#optional", { "changed" }) },
			})
			H.mountUi(app, Comp, { target = H.target() })
			t.expect(stats.renders).toBe(1)

			app.world:remove(entity, Target)
			H.settle(app)
			t.expect(stats.renders).toBe(2)
		end)

		t.it("re-renders when a row disappears from the query row accessor", function()
			H.reset()
			local Anchor = H.class(function(value)
				return { value = value or "anchor" }
			end)
			local Target = H.class(function(value)
				return { value = value or 1 }
			end)
			H.rovy:__component(Anchor, "test/Anchor")
			H.rovy:__component(Target, "test/Target")
			H.rovy:__query({
				id = "q#missingrow",
				terms = { { t = "entity" }, { t = "component", ctor = Anchor }, { t = "optional", ctor = Target } },
				filters = {},
			})
			local app = H.startedApp()
			local entity = app.world:spawn(Anchor.new("base"), Target.new(1))

			local stats = { renders = 0 }
			local Comp = H.uiClass("test/QueryMissingRow", function()
				stats.renders += 1
				return H.textLabel({ Name = "Status", Text = "count=" .. tostring(stats.renders) })
			end, {
				triggers = { queryTriggerFor("q#missingrow", { "changed" }) },
			})
			H.mountUi(app, Comp, { target = H.target() })
			t.expect(stats.renders).toBe(1)

			app.world:remove(entity, Target)
			H.settle(app)
			t.expect(stats.renders).toBe(2)
		end)

		t.it("re-renders when a row reappears in the query row accessor", function()
			H.reset()
			local Anchor = H.class(function(value)
				return { value = value or "anchor" }
			end)
			local Target = H.class(function(value)
				return { value = value or 1 }
			end)
			H.rovy:__component(Anchor, "test/Anchor")
			H.rovy:__component(Target, "test/Target")
			H.rovy:__query({
				id = "q#missingrow2",
				terms = { { t = "entity" }, { t = "component", ctor = Anchor }, { t = "optional", ctor = Target } },
				filters = {},
			})
			local app = H.startedApp()
			local entity = app.world:spawn(Anchor.new("base"))

			local stats = { renders = 0 }
			local Comp = H.uiClass("test/QueryMissingRowReappears", function()
				stats.renders += 1
				return H.textLabel({ Name = "Status", Text = "count=" .. tostring(stats.renders) })
			end, {
				triggers = { queryTriggerFor("q#missingrow2", { "changed" }) },
			})
			H.mountUi(app, Comp, { target = H.target() })
			t.expect(stats.renders).toBe(1)

			app.world:insert(entity, Target.new(1))
			H.settle(app)
			t.expect(stats.renders).toBe(2)

			app.world:set(entity, Target, Target.new(2))
			H.settle(app)
			t.expect(stats.renders).toBe(3)
		end)

		t.it("handles a query handle without rowFor via an empty row snapshot", function()
			H.reset()
			local Seed = H.class(function(value)
				return { value = value or 1 }
			end)
			H.rovy:__component(Seed, "test/Seed")
			local app = H.startedApp()
			local tracked = app.world:spawn(Seed.new(1))
			local include = false
			app.scheduler.queries["q#missing-rowfor"] = {
				members = function()
					if include then
						return { tracked }
					else
						return {}
					end
				end,
			}
			if app.scheduler.queries.get == nil then
				app.scheduler.queries.get = function(self, handle)
					return self[handle]
				end
			end

			local stats = { renders = 0 }
			local Comp = H.uiClass("test/QueryMissingRowFor", function()
				stats.renders += 1
				return H.textLabel({ Name = "Status", Text = "count=" .. tostring(stats.renders) })
			end, {
				triggers = { queryTriggerFor("q#missing-rowfor") },
			})
			H.mountUi(app, Comp, { target = H.target() })
			t.expect(stats.renders).toBe(1)

			include = true
			app.world:set(tracked, Seed, Seed.new(2))
			H.settle(app)
			t.expect(stats.renders).toBe(2)

			include = false
			app.world:set(tracked, Seed, Seed.new(3))
			H.settle(app)
			t.expect(stats.renders).toBe(3)
		end)
	end)
end
