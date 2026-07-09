--!nocheck
-- $relationTrigger: re-render scoped to a (source, target) pair via $prop
-- bindings, filtered by added/changed/removed.

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)

	local function setup(on)
		local TargetLock = H.class(function(strength)
			return { strength = strength or 1 }
		end)
		H.rovy:__relation(TargetLock, { exclusive = false, onTargetDelete = "none", onDelete = "none" })
		local stats = { renders = 0 }
		local Comp = H.uiClass("test/RelationBadge", function(self, world)
			stats.renders += 1
			local lock = world:getRelation(self.props.source, TargetLock, self.props.target)
			return H.textLabel({
				Name = "Status",
				Text = lock ~= nil and ("locked=" .. tostring(lock.strength)) or "unlocked",
			})
		end, {
			params = { { kind = "world" } },
			triggers = {
				H.relationTrigger(TargetLock, {
					source = H.prop("source"),
					target = H.prop("target"),
					on = on or { "added", "changed", "removed" },
				}),
			},
		})
		return TargetLock, Comp, stats
	end

	t.describe("$relationTrigger", function()
		t.it("produces a descriptor with defaults when options are omitted", function()
			local FakeCtor = {}
			local descriptor = H.relationTrigger(FakeCtor)
			t.expect(descriptor.kind).toBe("relation")
			t.expect(descriptor.ctor).toBe(FakeCtor)
			t.expect(descriptor.source).toBeUndefined()
			t.expect(descriptor.target).toBeUndefined()
			t.expect(descriptor.on[1]).toBe("added")
			t.expect(descriptor.on[2]).toBe("changed")
			t.expect(descriptor.on[3]).toBe("removed")
		end)

		t.it("re-renders on relate / re-relate for the bound pair", function()
			H.reset()
			local TargetLock, Comp, stats = setup()
			local app = H.startedApp()
			local a = app.world:spawn()
			local b = app.world:spawn()
			local target = H.target()
			H.mountUi(app, Comp, { target = target, props = { source = a, target = b } })
			t.expect(target:FindFirstChild("Status").Text).toBe("unlocked")

			app.world:relate(a, TargetLock, b, TargetLock.new(1))
			H.settle(app)
			t.expect(target:FindFirstChild("Status").Text).toBe("locked=1")

			app.world:relate(a, TargetLock, b, TargetLock.new(2))
			H.settle(app)
			t.expect(target:FindFirstChild("Status").Text).toBe("locked=2")
		end)

		t.it("switches relation-trigger bindings to a new source/target pair", function()
			H.reset()
			local TargetLock = H.class(function(strength)
				return { strength = strength or 1 }
			end)
			H.rovy:__relation(TargetLock, { exclusive = false, onTargetDelete = "none", onDelete = "none" })
			local stats = { rootRenders = 0, childRenders = 0, lastText = "" }
			local source = nil
			local target = nil

			local Bump = H.rerenderResource()
			local RelationBadge = H.uiClass("test/SelectedRelationBadge", function(self, world)
				stats.childRenders += 1
				local lock = world:getRelation(self.props.source, TargetLock, self.props.target)
				stats.lastText = "locked="
					.. (self.props.source and self.props.target and (lock and tostring(lock.strength) or "none") or "none")
				return H.textLabel({ Name = "Status", Text = stats.lastText })
			end, {
				params = { { kind = "world" } },
				triggers = {
					H.relationTrigger(TargetLock, {
						source = H.prop("source"),
						target = H.prop("target"),
						on = { "added", "changed", "removed" },
					}),
				},
			})

			local Comp = H.uiClass("test/RelationBindingRoot", function()
				stats.rootRenders += 1
				return H.child(RelationBadge, { source = source, target = target })
			end, {
				triggers = { H.resourceTrigger(Bump) },
			})

			local app = H.startedApp()
			local a = app.world:spawn()
			local b = app.world:spawn()
			local c = app.world:spawn()
			source = a
			target = b
			H.mountUi(app, Comp, { target = H.target() })
			t.expect(stats.rootRenders).toBe(1)
			t.expect(stats.childRenders).toBe(1)
			t.expect(stats.lastText).toBe("locked=none")

			app.world:relate(a, TargetLock, b, TargetLock.new(1))
			H.settle(app)
			t.expect(stats.childRenders).toBe(2)
			t.expect(stats.lastText).toBe("locked=1")

			app.world:relate(a, TargetLock, c, TargetLock.new(9))
			H.settle(app)
			t.expect(stats.childRenders).toBe(2)

			source = a
			target = c
			H.bump(app)
			t.expect(stats.rootRenders).toBe(2)
			t.expect(stats.childRenders).toBe(3)
			t.expect(stats.lastText).toBe("locked=9")

			app.world:relate(a, TargetLock, c, TargetLock.new(2))
			H.settle(app)
			t.expect(stats.childRenders).toBe(4)
			t.expect(stats.lastText).toBe("locked=2")

			app.world:unrelate(a, TargetLock, b)
			H.settle(app)
			t.expect(stats.childRenders).toBe(4)
			t.expect(stats.lastText).toBe("locked=2")

			app.world:unrelate(a, TargetLock, c)
			H.settle(app)
			t.expect(stats.childRenders).toBe(5)
			t.expect(stats.lastText).toBe("locked=none")
		end)

		t.it("re-renders on unrelate", function()
			H.reset()
			local TargetLock, Comp, stats = setup()
			local app = H.startedApp()
			local a = app.world:spawn()
			local b = app.world:spawn()
			local target = H.target()
			H.mountUi(app, Comp, { target = target, props = { source = a, target = b } })
			app.world:relate(a, TargetLock, b, TargetLock.new(1))
			H.settle(app)
			t.expect(target:FindFirstChild("Status").Text).toBe("locked=1")

			app.world:unrelate(a, TargetLock, b)
			H.settle(app)
			t.expect(target:FindFirstChild("Status").Text).toBe("unlocked")
		end)

		t.it("re-renders for every relation change when no source/target binding is set", function()
			H.reset()
			local stats = { renders = 0 }
			local TargetLock = H.class(function(strength)
				return { strength = strength or 1 }
			end)
			H.rovy:__relation(TargetLock, { exclusive = false, onTargetDelete = "none", onDelete = "none" })
			local Comp = H.uiClass("test/RelationAny", function()
				stats.renders += 1
				return H.textLabel({ Name = "Status", Text = "count=" .. tostring(stats.renders) })
			end, {
				triggers = { H.relationTrigger(TargetLock) },
			})
			local app = H.startedApp()
			local a = app.world:spawn()
			local b = app.world:spawn()
			local c = app.world:spawn()
			local d = app.world:spawn()
			local target = H.target()
			H.mountUi(app, Comp, { target = target })
			t.expect(stats.renders).toBe(1)

			app.world:relate(a, TargetLock, b, TargetLock.new(1))
			H.settle(app)
			t.expect(stats.renders).toBe(2)

			app.world:relate(c, TargetLock, d, TargetLock.new(2))
			H.settle(app)
			t.expect(stats.renders).toBe(3)
		end)

		t.it("supports literal source/target value bindings", function()
			H.reset()
			local TargetLock = H.class(function(strength)
				return { strength = strength or 1 }
			end)
			H.rovy:__relation(TargetLock, { exclusive = false, onTargetDelete = "none", onDelete = "none" })
			local stats = { renders = 0 }
			local app = H.startedApp()
			local sourceEntity = app.world:spawn()
			local targetEntity = app.world:spawn()
			local otherSource = app.world:spawn()
			local otherTarget = app.world:spawn()
			local bindSource = { kind = "value", value = sourceEntity }
			local bindTarget = { kind = "value", value = targetEntity }
			local triggers = { H.relationTrigger(TargetLock, { source = bindSource, target = bindTarget }) }
			local Comp = H.uiClass("test/RelationValueBinding", function()
				stats.renders += 1
				return H.textLabel({ Name = "Status", Text = "count=" .. tostring(stats.renders) })
			end, { triggers = triggers })

			H.mountUi(app, Comp, { target = H.target() })
			t.expect(stats.renders).toBe(1)

			app.world:relate(otherSource, TargetLock, otherTarget, TargetLock.new(1))
			H.settle(app)
			t.expect(stats.renders).toBe(1)

			app.world:relate(sourceEntity, TargetLock, targetEntity, TargetLock.new(2))
			H.settle(app)
			t.expect(stats.renders).toBe(2)
		end)

		t.it("does not rerender when relation trigger source/target binding props are missing", function()
			H.reset()
			local TargetLock = H.class(function(strength)
				return { strength = strength or 1 }
			end)
			H.rovy:__relation(TargetLock, { exclusive = false, onTargetDelete = "none", onDelete = "none" })
			local stats = { renders = 0 }
			local Comp = H.uiClass("test/RelationMissingBindings", function()
				stats.renders += 1
				return H.textLabel({ Name = "Status", Text = "count=" .. tostring(stats.renders) })
			end, {
				triggers = {
					H.relationTrigger(TargetLock, {
						source = H.prop("source"),
						target = H.prop("target"),
					}),
				},
			})

			local app = H.startedApp()
			local a = app.world:spawn()
			local b = app.world:spawn()
			H.mountUi(app, Comp, { target = H.target() })
			t.expect(stats.renders).toBe(1)

			app.world:relate(a, TargetLock, b, TargetLock.new(3))
			H.settle(app)
			t.expect(stats.renders).toBe(1)

			app.world:unrelate(a, TargetLock, b)
			H.settle(app)
			t.expect(stats.renders).toBe(1)
		end)

		t.it("ignores relations whose source/target differ from the bound pair", function()
			H.reset()
			local TargetLock, Comp, stats = setup()
			local app = H.startedApp()
			local a = app.world:spawn()
			local b = app.world:spawn()
			local c = app.world:spawn()
			H.mountUi(app, Comp, { target = H.target(), props = { source = a, target = b } })
			local baseline = stats.renders

			-- relate a→c (target differs) must not re-render the a→b badge
			app.world:relate(a, TargetLock, c, TargetLock.new(9))
			H.settle(app)
			t.expect(stats.renders).toBe(baseline)
		end)

		t.it("honours the `on` event filter (added-only ignores changed)", function()
			H.reset()
			local TargetLock, Comp, stats = setup({ "added" })
			local app = H.startedApp()
			local a = app.world:spawn()
			local b = app.world:spawn()
			local target = H.target()
			H.mountUi(app, Comp, { target = target, props = { source = a, target = b } })
			t.expect(stats.renders).toBe(1)

			app.world:relate(a, TargetLock, b, TargetLock.new(1))
			H.settle(app)
			t.expect(stats.renders).toBe(2)

			app.world:relate(a, TargetLock, b, TargetLock.new(2))
			H.settle(app)
			t.expect(stats.renders).toBe(2)

			app.world:unrelate(a, TargetLock, b)
			H.settle(app)
			t.expect(stats.renders).toBe(2)
			t.expect(target:FindFirstChild("Status").Text).toBe("locked=1")
		end)

		t.it("honours the `on` event filter (changed-only ignores added and removed)", function()
			H.reset()
			local TargetLock, Comp, stats = setup({ "changed" })
			local app = H.startedApp()
			local a = app.world:spawn()
			local b = app.world:spawn()
			local target = H.target()
			H.mountUi(app, Comp, { target = target, props = { source = a, target = b } })
			t.expect(stats.renders).toBe(1)

			app.world:relate(a, TargetLock, b, TargetLock.new(1))
			H.settle(app)
			t.expect(stats.renders).toBe(1)

			app.world:relate(a, TargetLock, b, TargetLock.new(2))
			H.settle(app)
			t.expect(stats.renders).toBe(2)

			app.world:unrelate(a, TargetLock, b)
			H.settle(app)
			t.expect(stats.renders).toBe(2)
		end)

		t.it("honours the `on` event filter (removed-only ignores added and changed)", function()
			H.reset()
			local TargetLock, Comp, stats = setup({ "removed" })
			local app = H.startedApp()
			local a = app.world:spawn()
			local b = app.world:spawn()
			local target = H.target()
			H.mountUi(app, Comp, { target = target, props = { source = a, target = b } })
			t.expect(stats.renders).toBe(1)

			app.world:relate(a, TargetLock, b, TargetLock.new(1))
			H.settle(app)
			t.expect(stats.renders).toBe(1)

			app.world:relate(a, TargetLock, b, TargetLock.new(2))
			H.settle(app)
			t.expect(stats.renders).toBe(1)

			app.world:unrelate(a, TargetLock, b)
			H.settle(app)
			t.expect(stats.renders).toBe(2)
			t.expect(target:FindFirstChild("Status").Text).toBe("unlocked")
		end)

		t.it("honours the `on` event filter when all event kinds are disabled", function()
			H.reset()
			local TargetLock, Comp, stats = setup({})
			local app = H.startedApp()
			local a = app.world:spawn()
			local b = app.world:spawn()
			local target = H.target()
			H.mountUi(app, Comp, { target = target, props = { source = a, target = b } })
			t.expect(stats.renders).toBe(1)

			app.world:relate(a, TargetLock, b, TargetLock.new(1))
			H.settle(app)
			app.world:relate(a, TargetLock, b, TargetLock.new(2))
			H.settle(app)
			app.world:unrelate(a, TargetLock, b)
			H.settle(app)

			t.expect(stats.renders).toBe(1)
			t.expect(target:FindFirstChild("Status").Text).toBe("unlocked")
		end)
	end)
end
