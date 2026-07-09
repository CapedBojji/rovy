--!nocheck
-- $componentTrigger: re-render scoped to a bound entity, filtered by event kind.
-- Binding uses $prop("entity") so only the matching entity's changes re-render.

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)

	local function setup(on)
		local Health = H.class(function(v)
			return { value = v or 100 }
		end)
		H.rovy:__component(Health, "test/Health")
		local stats = { renders = 0 }
		local Comp = H.uiClass("test/HealthView", function(self, world)
			stats.renders += 1
			local health = world:get(self.props.entity, Health)
			return H.textLabel({
				Name = "Status",
				Text = "hp=" .. (health and tostring(health.value) or "none"),
			})
		end, {
			params = { { kind = "world" } },
			triggers = {
				H.componentTrigger(Health, { entity = H.prop("entity"), on = on or { "changed", "removed" } }),
			},
		})
		return Health, Comp, stats
	end

	t.describe("$prop", function()
		t.it("produces a { kind = 'prop', key } binding descriptor", function()
			local descriptor = H.prop("entity")
			t.expect(descriptor.kind).toBe("prop")
			t.expect(descriptor.key).toBe("entity")
		end)
	end)

	t.describe("$componentTrigger", function()
		t.it("produces a descriptor with defaults when options are omitted", function()
			local FakeCtor = {}
			local descriptor = H.componentTrigger(FakeCtor)
			t.expect(descriptor.kind).toBe("component")
			t.expect(descriptor.ctor).toBe(FakeCtor)
			t.expect(descriptor.entity).toBeUndefined()
			t.expect(descriptor.on[1]).toBe("added")
			t.expect(descriptor.on[2]).toBe("changed")
			t.expect(descriptor.on[3]).toBe("removed")
		end)

		t.it("honours the `on` event filter (added-only ignores changed and removed)", function()
			H.reset()
			local Health = H.class(function(v)
				return { value = v or 100 }
			end)
			H.rovy:__component(Health, "test/Health")
			local stats = { renders = 0 }
			local Comp = H.uiClass("test/HealthAddedOnly", function()
				stats.renders += 1
				return H.textLabel({ Name = "Status", Text = "renders=" .. tostring(stats.renders) })
			end, {
				triggers = {
					H.componentTrigger(Health, { on = { "added" } }),
				},
			})
			local app = H.startedApp()
			local e = app.world:spawn(Health.new(100))
			H.mountUi(app, Comp, { target = H.target() })
			t.expect(stats.renders).toBe(1)

			app.world:set(e, Health, Health.new(150))
			H.settle(app)
			t.expect(stats.renders).toBe(1)

			app.world:remove(e, Health)
			H.settle(app)
			t.expect(stats.renders).toBe(1)

			local e2 = app.world:spawn()
			app.world:insert(e2, Health.new(10))
			H.settle(app)
			t.expect(stats.renders).toBe(2)
		end)

	t.it("re-renders when the bound entity's component changes", function()
			H.reset()
			local Health, Comp, stats = setup()
			local app = H.startedApp()
			local e = app.world:spawn(Health.new(100))
			local target = H.target()
			H.mountUi(app, Comp, { target = target, props = { entity = e } })

			t.expect(target:FindFirstChild("Status").Text).toBe("hp=100")
			t.expect(stats.renders).toBe(1)

			app.world:set(e, Health, Health.new(42))
			H.settle(app)
			t.expect(target:FindFirstChild("Status").Text).toBe("hp=42")
			t.expect(stats.renders).toBe(2)
		end)

		t.it("re-renders for any matching entity when no binding is provided", function()
			H.reset()
			local Health = H.class(function(v)
				return { value = v or 100 }
			end)
			H.rovy:__component(Health, "test/Health")
			local stats = { renders = 0 }
			local Comp = H.uiClass("test/HealthFeed", function()
				stats.renders += 1
				return H.textLabel({ Name = "Status", Text = "count=" .. tostring(stats.renders) })
			end, {
				triggers = { H.componentTrigger(Health) },
			})

			local app = H.startedApp()
			H.mountUi(app, Comp, { target = H.target() })
			t.expect(stats.renders).toBe(1)

			local e = app.world:spawn(Health.new(10))
			H.settle(app)
			t.expect(stats.renders).toBe(2)

			app.world:set(e, Health, Health.new(20))
			H.settle(app)
			t.expect(stats.renders).toBe(3)
		end)

		t.it("supports literal value bindings", function()
			H.reset()
			local Health = H.class(function(v)
				return { value = v or 100 }
			end)
			H.rovy:__component(Health, "test/Health")
			local stats = { renders = 0 }
			local app = H.startedApp()
			local targetEntity = app.world:spawn(Health.new(10))
			local otherEntity = app.world:spawn(Health.new(20))
			local Comp = H.uiClass("test/HealthValueBinding", function()
				stats.renders += 1
				return H.textLabel({
					Name = "Status",
					Text = "renders=" .. tostring(stats.renders),
				})
			end, {
				triggers = {
					H.componentTrigger(Health, { entity = { kind = "value", value = targetEntity }, on = { "changed" } }),
				},
			})
			H.mountUi(app, Comp, { target = H.target() })
			t.expect(stats.renders).toBe(1)

			app.world:set(otherEntity, Health, Health.new(21))
			H.settle(app)
			t.expect(stats.renders).toBe(1)

			app.world:set(targetEntity, Health, Health.new(11))
			H.settle(app)
			t.expect(stats.renders).toBe(2)
		end)

		t.it("re-renders when the bound entity is provided from props", function()
			H.reset()
			local Health = H.class(function(v)
				return { value = v or 100 }
			end)
			H.rovy:__component(Health, "test/Health")
			local stats = { renders = 0 }
			local Comp = H.uiClass("test/HealthPropBinding", function(self, world)
				stats.renders += 1
				local health = world:get(self.props.targetEntity, Health)
				return H.textLabel({
					Name = "Status",
					Text = "hp=" .. (health and tostring(health.value) or "none"),
				})
			end, {
				params = { { kind = "world" } },
				triggers = {
					H.componentTrigger(Health, { entity = H.prop("targetEntity"), on = { "changed" } }),
				},
			})

			local app = H.startedApp()
			local tracked = app.world:spawn(Health.new(1))
			local other = app.world:spawn(Health.new(2))
			H.mountUi(app, Comp, { target = H.target(), props = { targetEntity = tracked } })
			t.expect(stats.renders).toBe(1)

			app.world:set(other, Health, Health.new(3))
			H.settle(app)
			t.expect(stats.renders).toBe(1)

			app.world:set(tracked, Health, Health.new(4))
			H.settle(app)
			t.expect(stats.renders).toBe(2)
		end)

		t.it("switches component-trigger binding to a new prop entity and stops old subscriptions", function()
			H.reset()
			local Health = H.class(function(v)
				return { value = v or 100 }
			end)
			H.rovy:__component(Health, "test/Health")
			local Bump = H.rerenderResource()
			local stats = { childRenders = 0, rootRenders = 0, lastText = "" }
			local bound = nil

			local Child = H.uiClass("test/SelectedHealthRow", function(self, world)
				stats.childRenders += 1
				local health = world:get(self.props.entity, Health)
				stats.lastText = bound and ("hp=" .. tostring(health and health.value or "none")) or "none"
				return H.textLabel({
					Name = "Status",
					Text = stats.lastText,
				})
			end, {
				params = { { kind = "world" } },
				triggers = {
					H.componentTrigger(Health, { entity = H.prop("entity"), on = { "changed" } }),
				},
			})
			local Root = H.uiClass("test/ComponentBindingRoot", function()
				stats.rootRenders += 1
				return H.child(Child, { entity = bound })
			end, {
				triggers = { H.resourceTrigger(Bump) },
			})

			local app = H.startedApp()
			local left = app.world:spawn(Health.new(10))
			local right = app.world:spawn(Health.new(20))
			bound = left
			H.mountUi(app, Root, { target = H.target() })

			t.expect(stats.rootRenders).toBe(1)
			t.expect(stats.childRenders).toBe(1)
			t.expect(stats.lastText).toBe("hp=10")

			app.world:set(left, Health, Health.new(11))
			H.settle(app)
			t.expect(stats.childRenders).toBe(2)

			app.world:set(right, Health, Health.new(21))
			H.settle(app)
			t.expect(stats.childRenders).toBe(2)

			bound = right
			H.bump(app)
			t.expect(stats.rootRenders).toBe(2)
			t.expect(stats.childRenders).toBe(3)
			t.expect(stats.lastText).toBe("hp=21")

			app.world:set(left, Health, Health.new(12))
			H.settle(app)
			t.expect(stats.childRenders).toBe(3)

			app.world:set(right, Health, Health.new(22))
			H.settle(app)
			t.expect(stats.childRenders).toBe(4)
		end)

		t.it("does not rerender when the component trigger binding prop is missing", function()
			H.reset()
			local Health = H.class(function(v)
				return { value = v or 100 }
			end)
			H.rovy:__component(Health, "test/Health")
			local stats = { renders = 0 }
			local Comp = H.uiClass("test/HealthMissingEntityBinding", function()
				stats.renders += 1
				return H.textLabel({ Name = "Status", Text = "renders=" .. tostring(stats.renders) })
			end, {
				triggers = {
					H.componentTrigger(Health, { entity = H.prop("entity") }),
				},
			})

			local app = H.startedApp()
			local e1 = app.world:spawn(Health.new(5))
			local e2 = app.world:spawn(Health.new(9))
			H.mountUi(app, Comp, { target = H.target() })
			t.expect(stats.renders).toBe(1)

			app.world:set(e1, Health, Health.new(10))
			app.world:set(e2, Health, Health.new(10))
			H.settle(app)
			t.expect(stats.renders).toBe(1)
		end)

		t.it("honours the `on` event filter when all event kinds are disabled", function()
			H.reset()
			local Health, Comp, stats = setup({})
			local app = H.startedApp()
			local e = app.world:spawn(Health.new(100))
			H.mountUi(app, Comp, { target = H.target(), props = { entity = e } })
			t.expect(stats.renders).toBe(1)

			app.world:set(e, Health, Health.new(150))
			H.settle(app)
			app.world:remove(e, Health)
			H.settle(app)
			t.expect(stats.renders).toBe(1)
		end)

		t.it("ignores changes to a different (unbound) entity", function()
			H.reset()
			local Health, Comp, stats = setup()
			local app = H.startedApp()
			local bound = app.world:spawn(Health.new(100))
			local other = app.world:spawn(Health.new(100))
			H.mountUi(app, Comp, { target = H.target(), props = { entity = bound } })
			t.expect(stats.renders).toBe(1)

			app.world:set(other, Health, Health.new(1))
			H.settle(app)
			t.expect(stats.renders).toBe(1) -- unbound entity → no re-render
		end)

		t.it("honours the `on` event filter (changed-only ignores added)", function()
			H.reset()
			local Health, Comp, stats = setup({ "changed" })
			local app = H.startedApp()
			local e = app.world:spawn(Health.new(100))
			H.mountUi(app, Comp, { target = H.target(), props = { entity = e } })
			t.expect(stats.renders).toBe(1)

			-- adding Health to a fresh entity is an "added" event → filtered out
			local e2 = app.world:spawn()
			app.world:insert(e2, Health.new(5))
			H.settle(app)
			t.expect(stats.renders).toBe(1)

			-- a real change to the bound entity re-renders
			app.world:set(e, Health, Health.new(70))
			H.settle(app)
			t.expect(stats.renders).toBe(2)
		end)

		t.it("honours the `on` event filter (removed-only ignores change)", function()
			H.reset()
			local Health, Comp, stats = setup({ "removed" })
			local app = H.startedApp()
			local e = app.world:spawn(Health.new(100))
			local target = H.target()
			H.mountUi(app, Comp, { target = target, props = { entity = e } })
			t.expect(stats.renders).toBe(1)

			-- changed is not in the filter
			app.world:set(e, Health, Health.new(200))
			H.settle(app)
			t.expect(stats.renders).toBe(1)
			-- removal triggers exactly one extra render
			app.world:remove(e, Health)
			H.settle(app)
			t.expect(stats.renders).toBe(2)
			t.expect(target:FindFirstChild("Status").Text).toBe("hp=none")
		end)
	end)
end
