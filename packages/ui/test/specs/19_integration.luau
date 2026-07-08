--!nocheck
-- Integration capstone: the zune analog of the rovy-ui-proof-place scenario.
-- A rostered panel driven by a filtered query trigger, per-row component
-- triggers, a resource trigger, an event trigger and a relation trigger, all
-- reconciling a live Instance tree as the ECS world mutates.

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)

	local function build()
		local Health = H.class(function(v) return { value = v or 100 } end)
		local UnitName = H.class(function(name) return { value = name or "Unit" } end)
		local Visible = H.class(function() return {} end)
		local Theme = H.class(function(rev) return { revision = rev or 0 } end)
		H.rovy:__component(Health, "test/Health")
		H.rovy:__component(UnitName, "test/UnitName")
		H.rovy:__component(Visible, "test/Visible")
		H.rovy:__resource(Theme, "test/Theme")
		H.rovy:__query({
			id = "q#roster",
			terms = {
				{ t = "entity" },
				{ t = "component", ctor = Health },
				{ t = "component", ctor = UnitName },
			},
			filters = { with = { Visible } },
		})

		-- Per-row: re-renders when its own entity's Health changes/removed.
		local HealthRow = H.uiClass("test/HealthRow", function(self, world)
			self.renders += 1
			local health = world:get(self.props.entity, Health)
			return H.frame({ Name = "Row_" .. self.props.name }, {
				H.textLabel({
					Name = "Label",
					Text = string.format("%s HP %s", self.props.name, health and tostring(health.value) or "gone"),
				}),
			})
		end, {
			params = { { kind = "world" } },
			triggers = { H.componentTrigger(Health, { entity = H.prop("entity"), on = { "changed", "removed" } }) },
		})

		-- Root: re-renders when the roster changes or the theme changes.
		local rootStats = { renders = 0 }
		local ProofPanel = H.uiClass("test/ProofPanel", function(self, roster, theme)
			rootStats.renders += 1
			local rows = {
				H.textLabel({
					Name = "Title",
					Text = string.format("roster %d rev %d r%d", roster:size(), theme.revision, rootStats.renders),
				}),
			}
			roster:forEach(function(entity, _health, unitName)
				table.insert(rows, H.child(HealthRow, { entity = entity, name = unitName.value }, { key = entity }))
			end)
			return H.frame({ Name = "Panel" }, rows)
		end, {
			params = {
				{ kind = "query", handle = "q#roster" },
				{ kind = "res", ctor = Theme },
			},
			triggers = {
				(function()
					local d = H.queryTrigger({ on = { "added", "changed", "removed" } })
					d.handle = "q#roster"
					return d
				end)(),
				H.resourceTrigger(Theme),
			},
		})

		return { Health = Health, UnitName = UnitName, Visible = Visible, Theme = Theme, ProofPanel = ProofPanel, rootStats = rootStats }
	end

	local function rowCount(target)
		local n = 0
		for _, d in ipairs(target:GetDescendants()) do
			if d.ClassName == "Frame" and string.sub(d.Name, 1, 4) == "Row_" then n += 1 end
		end
		return n
	end

	t.describe("proof-panel integration", function()
		t.it("runs the full add / change / remove / re-add / theme lifecycle", function()
			H.reset()
			local B = build()
			local app = H.startedApp()
			local target = H.target()
			H.mountUi(app, B.ProofPanel, { target = target })

			-- initial: empty roster
			t.expect(H.hasText(target, "roster 0")).toBeTruthy()
			t.expect(rowCount(target)).toBe(0)

			-- spawn two visible units → two keyed rows
			local alpha = app.world:spawn(B.UnitName.new("Alpha"), B.Health.new(100), B.Visible.new())
			local beta = app.world:spawn(B.UnitName.new("Beta"), B.Health.new(80), B.Visible.new())
			H.settle(app)
			t.expect(rowCount(target)).toBe(2)
			t.expect(H.hasText(target, "Alpha HP 100")).toBeTruthy()
			t.expect(H.hasText(target, "Beta HP 80")).toBeTruthy()

			-- component change: Alpha's row updates in place
			app.world:set(alpha, B.Health, B.Health.new(64))
			H.settle(app)
			t.expect(H.hasText(target, "Alpha HP 64")).toBeTruthy()

			-- remove Visible from Beta → row leaves the query and is destroyed
			app.world:remove(beta, B.Visible)
			H.settle(app)
			t.expect(rowCount(target)).toBe(1)
			t.expect(H.hasText(target, "roster 1")).toBeTruthy()
			t.expect(H.hasText(target, "Beta HP")).never.toBeTruthy()

			-- re-add Visible with a new health → row recreated with fresh value
			app.world:insert(beta, B.Visible.new())
			app.world:set(beta, B.Health, B.Health.new(45))
			H.settle(app)
			t.expect(rowCount(target)).toBe(2)
			t.expect(H.hasText(target, "Beta HP 45")).toBeTruthy()

			-- late spawn → third row
			app.world:spawn(B.UnitName.new("Gamma"), B.Health.new(33), B.Visible.new())
			H.settle(app)
			t.expect(rowCount(target)).toBe(3)
			t.expect(H.hasText(target, "Gamma HP 33")).toBeTruthy()

			-- resource change re-renders the root (revision bumps)
			app.world:insertResource(B.Theme.new(7))
			H.settle(app)
			t.expect(H.hasText(target, "rev 7")).toBeTruthy()
		end)

		t.it("keeps a row's instance stable across a component-driven re-render", function()
			H.reset()
			local B = build()
			local app = H.startedApp()
			local target = H.target()
			H.mountUi(app, B.ProofPanel, { target = target })
			local e = app.world:spawn(B.UnitName.new("Solo"), B.Health.new(10), B.Visible.new())
			H.settle(app)

			local before = target:GetDescendants()
			local rowBefore
			for _, d in ipairs(before) do
				if d.Name == "Row_Solo" then rowBefore = d end
			end
			t.expect(rowBefore).toBeDefined()

			app.world:set(e, B.Health, B.Health.new(9))
			H.settle(app)
			local rowAfter
			for _, d in ipairs(target:GetDescendants()) do
				if d.Name == "Row_Solo" then rowAfter = d end
			end
			t.expect(rowAfter).toBe(rowBefore) -- keyed row reconciled, not remounted
			t.expect(H.hasText(target, "Solo HP 9")).toBeTruthy()
		end)
	end)
end
