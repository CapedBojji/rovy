--!nocheck
-- Reconciliation identity: same identity reuses the instance, className change
-- replaces it, keyed children survive reordering, removed children are
-- destroyed, and a changed key remounts.

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)

	-- Root re-renders `ctrl.build()` on Bump.
	local function mountControlled(build)
		local Bump = H.rerenderResource()
		local ctrl = { build = build }
		local Comp = H.uiClass("test/ReconRoot", function()
			return H.frame({ Name = "Root" }, ctrl.build())
		end, { triggers = { H.resourceTrigger(Bump) } })
		local app = H.startedApp()
		local target = H.target()
		H.mountUi(app, Comp, { target = target })
		return app, target, ctrl
	end

	t.describe("reconcile identity", function()
		t.it("reuses the same instance across a re-render with same identity", function()
			H.reset()
			local app, target, ctrl = mountControlled(function()
				return { H.textLabel({ Name = "Label" }) }
			end)
			local root = target:FindFirstChild("Root")
			local before = root:FindFirstChild("Label")
			H.bump(app)
			local after = root:FindFirstChild("Label")
			t.expect(after).toBe(before) -- reused, not remounted
			t.expect(before.Destroyed).never.toBe(true)
		end)

		t.it("replaces the instance when the className changes", function()
			H.reset()
			local kind = { className = "TextLabel" }
			local app, target, ctrl = mountControlled(function()
				return { H.native(kind.className, { Name = "Slot" }) }
			end)
			local root = target:FindFirstChild("Root")
			local before = root:FindFirstChild("Slot")
			t.expect(before.ClassName).toBe("TextLabel")
			kind.className = "Frame"
			H.bump(app)
			local after = root:FindFirstChild("Slot")
			t.expect(after.ClassName).toBe("Frame")
			t.expect(after).never.toBe(before)
			t.expect(before.Destroyed).toBe(true)
		end)

		t.it("reconciles fragment children when a fragment stays in place", function()
			H.reset()
			local state = { value = "A" }
			local app, target, ctrl = mountControlled(function()
				return {
					H.fragment({
						H.textLabel({ Name = "Leaf", Text = "value=" .. state.value }),
					}),
				}
			end)
			local root = target:FindFirstChild("Root")
			local leaf = root:FindFirstChild("Leaf")
			local previous = leaf
			t.expect(leaf).toBeDefined()
			t.expect(leaf.Text).toBe("value=A")

			state.value = "B"
			H.bump(app)
			leaf = root:FindFirstChild("Leaf")
			t.expect(leaf).toBeDefined()
			t.expect(leaf).toBe(previous)
			t.expect(leaf.Text).toBe("value=B")
		end)

		t.it("replaces a child when the component ctor changes", function()
			H.reset()
			local useAlt = { value = false }
			local Alt = H.uiClass("test/ReconcileAltComp", function()
				return H.textLabel({ Name = "Alt", Text = "alt" })
			end)
			local Primary = H.uiClass("test/ReconcilePrimaryComp", function()
				return H.textLabel({ Name = "Primary", Text = "primary" })
			end)
			local Bump = H.rerenderResource()
			local app = H.startedApp()
			local target = H.target()
			H.mountUi(app, H.uiClass("test/CompSwapRoot", function()
				if useAlt.value then
					return H.frame({ Name = "Root" }, H.child(Alt, {}, { key = "slot" }))
				end
				return H.frame({ Name = "Root" }, H.child(Primary, {}, { key = "slot" }))
			end, { triggers = { H.resourceTrigger(Bump) } }), { target = target })

			local root = target:FindFirstChild("Root")
			local primary = root:FindFirstChild("Primary")
			t.expect(primary).toBeDefined()
			t.expect(primary.ClassName).toBe("TextLabel")

			useAlt.value = true
			H.bump(app, Bump)
			root = target:FindFirstChild("Root")
			local alt = root:FindFirstChild("Alt")
			t.expect(alt).toBeDefined()
			t.expect(alt.ClassName).toBe("TextLabel")
			t.expect(alt).never.toBe(primary)
			t.expect(primary.Destroyed).toBe(true)
		end)

		t.it("replaces a child when vnode kind changes", function()
			H.reset()
			local flags = { useAlt = false }
			local Alt = H.uiClass("test/AltRow", function()
				return H.textLabel({ Name = "Alt", Text = "alt" })
			end)
			local Child = H.uiClass("test/PrimaryRow", function()
				return H.frame({ Name = "Primary" })
			end)
			local function makeRoot()
				if flags.useAlt then
					return H.child(Alt, nil, { key = "slot" })
				end
				return { H.native("TextLabel", { Name = "Slot" }, nil, { key = "slot" }) }
			end
			local Bump = H.rerenderResource()
			local app = H.startedApp()
			local target = H.target()
			H.mountUi(app, H.uiClass("test/KindSwapRoot", function()
				return H.frame({ Name = "Root" }, makeRoot())
			end, { triggers = { H.resourceTrigger(Bump) } }), { target = target })

			local root = target:FindFirstChild("Root")
			local before = root:FindFirstChild("Slot")
			t.expect(before).toBeDefined()
			t.expect(before.ClassName).toBe("TextLabel")

			flags.useAlt = true
			H.bump(app, Bump)
			root = target:FindFirstChild("Root")
			local after = root:FindFirstChild("Alt")
			t.expect(after).toBeDefined()
			t.expect(after.ClassName).toBe("TextLabel")
			t.expect(after).never.toBe(before)
			t.expect(before.Destroyed).toBe(true)
		end)
	end)

	t.describe("keyed children", function()
		local function rows(keys)
			return function()
				local out = {}
				for _, k in ipairs(keys) do
					table.insert(out, H.native("Frame", { Name = "row_" .. k }, nil, { key = k }))
				end
				return out
			end
		end

		t.it("preserves instances by key across a reorder", function()
			H.reset()
			local list = { "a", "b", "c" }
			local app, target, ctrl = mountControlled(rows(list))
			local root = target:FindFirstChild("Root")
			local a0 = root:FindFirstChild("row_a")
			local b0 = root:FindFirstChild("row_b")
			local c0 = root:FindFirstChild("row_c")

			ctrl.build = rows({ "c", "a", "b" })
			H.bump(app)

			t.expect(root:FindFirstChild("row_a")).toBe(a0)
			t.expect(root:FindFirstChild("row_b")).toBe(b0)
			t.expect(root:FindFirstChild("row_c")).toBe(c0)
			-- no duplicates created
			local count = 0
			for _, child in ipairs(root:GetChildren()) do
				if string.sub(child.Name, 1, 4) == "row_" then count += 1 end
			end
			t.expect(count).toBe(3)
		end)

		t.it("destroys children dropped from the keyed set", function()
			H.reset()
			local app, target, ctrl = mountControlled(rows({ "a", "b", "c" }))
			local root = target:FindFirstChild("Root")
			local b0 = root:FindFirstChild("row_b")

			ctrl.build = rows({ "a", "c" })
			H.bump(app)

			t.expect(b0.Destroyed).toBe(true)
			t.expect(root:FindFirstChild("row_b")).never.toBeDefined()
			t.expect(root:FindFirstChild("row_a")).toBeDefined()
			t.expect(root:FindFirstChild("row_c")).toBeDefined()
		end)

		t.it("reuses survivors while replacing one row in a single rerender", function()
			H.reset()
			local Bump = H.rerenderResource()
			local items = { "a", "b", "c" }
			local Row = H.uiClass("test/RollingSwapRow", function(self, state)
				state.renders += 1
				return H.textLabel({
					Name = "row_" .. tostring(self.props.id),
					Text = tostring(self.props.id) .. ":" .. tostring(state.renders),
				})
			end, {
				params = { { kind = "local", index = 0, init = function() return { renders = 0 } end } },
			})
			local Root = H.uiClass("test/RollingSwapRoot", function()
				local children = {}
				for _, id in ipairs(items) do
					table.insert(children, H.child(Row, { id = id }, { key = id }))
				end
				return H.frame({ Name = "Root" }, children)
			end, {
				triggers = { H.resourceTrigger(Bump) },
			})

			local target = H.target()
			local app = H.startedApp()
			H.mountUi(app, Root, { target = target })
			local container = target:FindFirstChild("Root")
			local a0 = container:FindFirstChild("row_a")
			local b0 = container:FindFirstChild("row_b")
			local c0 = container:FindFirstChild("row_c")
			t.expect(a0).toBeDefined()
			t.expect(b0).toBeDefined()
			t.expect(c0).toBeDefined()
			t.expect(a0.Text).toBe("a:1")
			t.expect(c0.Text).toBe("c:1")

			items = { "a", "d", "c" }
			H.bump(app, Bump)
			container = target:FindFirstChild("Root")
			local a1 = container:FindFirstChild("row_a")
			local c1 = container:FindFirstChild("row_c")
			local d1 = container:FindFirstChild("row_d")
			t.expect(a1).toBe(a0)
			t.expect(c1).toBe(c0)
			t.expect(d1).toBeDefined()
			t.expect(d1.Text).toBe("d:1")
			t.expect(d1).never.toBe(b0)
			t.expect(b0.Destroyed).toBe(true)
			t.expect(a1.Text).toBe("a:1")
			t.expect(c1.Text).toBe("c:1")
			t.expect(#container:GetChildren()).toBe(3)
		end)

		t.it("a changed key remounts the child", function()
			H.reset()
			local key = { value = "x" }
			local app, target, ctrl = mountControlled(function()
				return { H.native("Frame", { Name = "keyed" }, nil, { key = key.value }) }
			end)
			local root = target:FindFirstChild("Root")
			local before = root:FindFirstChild("keyed")
			key.value = "y"
			H.bump(app)
			local after = root:FindFirstChild("keyed")
			t.expect(after).never.toBe(before)
			t.expect(before.Destroyed).toBe(true)
		end)

		t.it("supports numeric keys for child identity", function()
			H.reset()
			local app, target, ctrl = mountControlled(function()
				return {
					H.native("Frame", { Name = "row1" }, nil, { key = 1 }),
					H.native("Frame", { Name = "row2" }, nil, { key = 2 }),
				}
			end)
			local root = target:FindFirstChild("Root")
			local row1 = root:FindFirstChild("row1")
			local row2 = root:FindFirstChild("row2")
			t.expect(row1).toBeDefined()
			t.expect(row2).toBeDefined()

			ctrl.build = function()
				return {
					H.native("Frame", { Name = "row2" }, nil, { key = 2 }),
					H.native("Frame", { Name = "row1" }, nil, { key = 1 }),
				}
			end
			H.bump(app)

			t.expect(root:FindFirstChild("row1")).toBe(row1)
			t.expect(root:FindFirstChild("row2")).toBe(row2)
			t.expect(root:FindFirstChild("row1").Name).toBe("row1")
			t.expect(root:FindFirstChild("row2").Name).toBe("row2")
		end)

		t.it("reuses duplicate keyed children up to available old instances", function()
			H.reset()
			local app, target, ctrl = mountControlled(function()
				return {
					H.native("Frame", { Name = "row_a" }, nil, { key = "dup" }),
					H.native("Frame", { Name = "row_b" }, nil, { key = "dup" }),
				}
			end)
			local root = target:FindFirstChild("Root")
			local a0 = root:FindFirstChild("row_a")
			local b0 = root:FindFirstChild("row_b")
			t.expect(a0).toBeDefined()
			t.expect(b0).toBeDefined()
			t.expect(a0).never.toBe(b0)

			ctrl.build = function()
				return {
					H.native("Frame", { Name = "row_a" }, nil, { key = "dup" }),
					H.native("Frame", { Name = "row_b" }, nil, { key = "dup" }),
					H.native("Frame", { Name = "row_c" }, nil, { key = "new" }),
				}
			end
			H.bump(app)
			local rowA = root:FindFirstChild("row_a")
			local rowB = root:FindFirstChild("row_b")
			local rowC = root:FindFirstChild("row_c")
			t.expect(rowA).toBe(a0)
			t.expect(rowB).toBe(b0)
			t.expect(rowC).toBeDefined()
			t.expect(rowC).never.toBe(a0)
			t.expect(rowC).never.toBe(b0)
			t.expect(a0.Destroyed).never.toBe(true)
			t.expect(b0.Destroyed).never.toBe(true)
			t.expect(#root:GetChildren()).toBe(3)
		end)

		t.it("resets local state when a removed keyed row is added back", function()
			H.reset()
			local items = { "a", "b" }
			local Bump = H.rerenderResource()
			local Row = H.uiClass(
				"test/ResumeRow",
				function(self, state)
					state.renders += 1
					return H.textLabel({
						Name = "row_" .. tostring(self.props.id),
						Text = tostring(self.props.id) .. ":" .. tostring(state.renders),
					})
				end,
				{
					params = { { kind = "local", index = 0, init = function() return { renders = 0 } end } },
				}
			)
				local Root = H.uiClass("test/ResumeList", function()
				local children = {}
				for _, id in ipairs(items) do
					table.insert(children, H.child(Row, { id = id }, { key = id }))
				end
				return H.frame({ Name = "Root" }, children)
			end, {
				triggers = { H.resourceTrigger(Bump) },
			})

			local target = H.target()
			local app = H.startedApp()
			H.mountUi(app, Root, { target = target })
			local container = target:FindFirstChild("Root")
			local a0 = container:FindFirstChild("row_a")
			local b0 = container:FindFirstChild("row_b")
			t.expect(a0.Text).toBe("a:1")
			t.expect(b0.Text).toBe("b:1")

			table.remove(items, 2)
			H.bump(app, Bump)
			container = target:FindFirstChild("Root")
			t.expect(container:FindFirstChild("row_b")).never.toBeDefined()
			t.expect(a0.Text).toBe("a:1")
			t.expect(a0).toBe(container:FindFirstChild("row_a"))

			table.insert(items, "b")
			H.bump(app, Bump)
			container = target:FindFirstChild("Root")
			local a1 = container:FindFirstChild("row_a")
			local b1 = container:FindFirstChild("row_b")
			t.expect(a1).toBe(a0)
			t.expect(a1.Text).toBe("a:1")
			t.expect(b1).toBeDefined()
			t.expect(b1).never.toBe(b0)
			t.expect(b1.Text).toBe("b:1")
			t.expect(b0.Destroyed).toBe(true)
		end)

		t.it("destroys stale duplicates after keyed list shrinks", function()
			H.reset()
			local app, target, ctrl = mountControlled(function()
				return {
					H.native("Frame", { Name = "row_a" }, nil, { key = "dup" }),
					H.native("Frame", { Name = "row_b" }, nil, { key = "dup" }),
					H.native("Frame", { Name = "row_c" }, nil, { key = "dup" }),
				}
			end)
			local root = target:FindFirstChild("Root")
			local a0 = root:FindFirstChild("row_a")
			local b0 = root:FindFirstChild("row_b")
			local c0 = root:FindFirstChild("row_c")
			t.expect(a0).toBeDefined()
			t.expect(b0).toBeDefined()
			t.expect(c0).toBeDefined()

			ctrl.build = function()
				return {
					H.native("Frame", { Name = "row_a" }, nil, { key = "dup" }),
					H.native("Frame", { Name = "row_x" }, nil, { key = "other" }),
				}
			end
			H.bump(app)

			t.expect(root:FindFirstChild("row_a")).toBe(a0)
			t.expect(b0.Destroyed).toBe(true)
			t.expect(c0.Destroyed).toBe(true)
			t.expect(root:FindFirstChild("row_b")).never.toBeDefined()
			t.expect(root:FindFirstChild("row_c")).never.toBeDefined()
			local rowX = root:FindFirstChild("row_x")
			t.expect(rowX).toBeDefined()
			t.expect(rowX).never.toBe(b0)
			t.expect(rowX).never.toBe(c0)
			t.expect(#root:GetChildren()).toBe(2)
		end)

		t.it("keeps existing keyed rows stable when adding a new row at the front", function()
			H.reset()
			local items = { "a", "b" }
			local Bump = H.rerenderResource()
			local Row = H.uiClass(
				"test/FrontInsertRow",
				function(self, state)
					state.renders += 1
					return H.textLabel({
						Name = "row_" .. tostring(self.props.id),
						Text = tostring(self.props.id) .. ":" .. tostring(state.renders),
					})
				end,
				{
					params = { { kind = "local", index = 0, init = function() return { renders = 0 } end } },
				}
			)
			local Root = H.uiClass("test/FrontInsertRoot", function()
				local children = {}
				for _, id in ipairs(items) do
					table.insert(children, H.child(Row, { id = id }, { key = id }))
				end
				return H.frame({ Name = "Root" }, children)
			end, {
				triggers = { H.resourceTrigger(Bump) },
			})

			local target = H.target()
			local app = H.startedApp()
			H.mountUi(app, Root, { target = target })
			local container = target:FindFirstChild("Root")
			local a0 = container:FindFirstChild("row_a")
			local b0 = container:FindFirstChild("row_b")
			t.expect(a0).toBeDefined()
			t.expect(b0).toBeDefined()
			t.expect(a0.Text).toBe("a:1")
			t.expect(b0.Text).toBe("b:1")

			table.insert(items, 1, "c")
			H.bump(app, Bump)
			container = target:FindFirstChild("Root")
			local c0 = container:FindFirstChild("row_c")
			local a1 = container:FindFirstChild("row_a")
			local b1 = container:FindFirstChild("row_b")
			t.expect(c0).toBeDefined()
			t.expect(c0.Text).toBe("c:1")
			t.expect(a1).toBe(a0)
			t.expect(b1).toBe(b0)
			t.expect(a1.Text).toBe("a:1")
			t.expect(b1.Text).toBe("b:1")
			t.expect(#container:GetChildren()).toBe(3)
		end)

		t.it("preserves row state when appending keyed entries", function()
			H.reset()
			local Bump = H.rerenderResource()
			local items = { "a", "b" }

			local Row = H.uiClass(
				"test/StatefulListRow",
				function(self, state)
					state.renders += 1
					return H.textLabel({
						Name = "row_" .. tostring(self.props.id),
						Text = tostring(self.props.id) .. ":" .. tostring(state.renders),
					})
				end,
				{
					params = { { kind = "local", index = 0, init = function() return { renders = 0 } end } },
				}
			)

			local Root = H.uiClass("test/StatefulList", function()
				local children = {}
				for _, id in ipairs(items) do
					table.insert(children, H.child(Row, { id = id }, { key = id }))
				end
				return H.frame({ Name = "Root" }, children)
			end, {
				triggers = { H.resourceTrigger(Bump) },
			})

			local target = H.target()
			local app = H.startedApp()
			H.mountUi(app, Root, { target = target })
			local container = target:FindFirstChild("Root")
			t.expect(container).toBeDefined()
			local rowA = container:FindFirstChild("row_a")
			local rowB = container:FindFirstChild("row_b")
			t.expect(rowA).toBeDefined()
			t.expect(rowB).toBeDefined()
			t.expect(rowA.Text).toBe("a:1")
			t.expect(rowB.Text).toBe("b:1")

			table.insert(items, "c")
			H.bump(app, Bump)

			container = target:FindFirstChild("Root")
			local rowA2 = container:FindFirstChild("row_a")
			local rowB2 = container:FindFirstChild("row_b")
			local rowC = container:FindFirstChild("row_c")
			t.expect(rowA2).toBe(rowA)
			t.expect(rowB2).toBe(rowB)
			t.expect(rowA2.Text).toBe("a:1")
			t.expect(rowB2.Text).toBe("b:1")
			t.expect(rowC).toBeDefined()
			t.expect(rowC.Text).toBe("c:1")
			t.expect(#container:GetChildren()).toBe(3)

			table.insert(items, "d")
			H.bump(app, Bump)
			container = target:FindFirstChild("Root")
			local rowA3 = container:FindFirstChild("row_a")
			local rowC3 = container:FindFirstChild("row_c")
			local rowD = container:FindFirstChild("row_d")
			t.expect(rowA3).toBe(rowA2)
			t.expect(rowC3.Text).toBe("c:1")
			t.expect(rowD).toBeDefined()
			t.expect(rowD.Text).toBe("d:1")
			t.expect(#container:GetChildren()).toBe(4)
		end)

		t.it("keeps unkeyed children stable by callsite when mixed with keyed children", function()
			H.reset()
			local swapped = false
			local app, target, ctrl = mountControlled(function()
				if swapped then
					return {
						H.native("Frame", { Name = "key" }, nil, { key = "k" }),
						H.native("Frame", { Name = "left" }, nil, { __callsite = "left" }),
						H.native("Frame", { Name = "right" }, nil, { __callsite = "right" }),
					}
				end
				return {
					H.native("Frame", { Name = "left" }, nil, { __callsite = "left" }),
					H.native("Frame", { Name = "key" }, nil, { key = "k" }),
					H.native("Frame", { Name = "right" }, nil, { __callsite = "right" }),
				}
			end)
			local root = target:FindFirstChild("Root")
			local left0 = root:FindFirstChild("left")
			local right0 = root:FindFirstChild("right")
			local key0 = root:FindFirstChild("key")
			t.expect(left0).toBeDefined()
			t.expect(right0).toBeDefined()
			t.expect(key0).toBeDefined()

			swapped = true
			H.bump(app)
			local left1 = root:FindFirstChild("left")
			local right1 = root:FindFirstChild("right")
			local key1 = root:FindFirstChild("key")
			t.expect(left1).toBe(left0)
			t.expect(right1).toBe(right0)
			t.expect(key1).toBe(key0)
			t.expect(#root:GetChildren()).toBe(3)
		end)

		t.it("destroys a child when render output becomes false", function()
			H.reset()
			local show = { value = true }
			local Bump = H.rerenderResource()
			local Leaf = H.uiClass("test/ToggleLeaf", function()
				return H.frame({ Name = "Leaf" })
			end)
			local app = H.startedApp()
			local target = H.target()
			local Root = H.uiClass("test/ToggleChild", function()
				return show.value and H.frame({ Name = "Root" }, H.child(Leaf, {})) or false
			end, { triggers = { H.resourceTrigger(Bump) } })
			H.mountUi(app, Root, { target = target })

			local root = target:FindFirstChild("Root")
			local leaf = root:FindFirstChild("Leaf")
			t.expect(leaf).toBeDefined()

			show.value = false
			H.bump(app, Bump)
			root = target:FindFirstChild("Root")
			t.expect(root).never.toBeDefined()
			t.expect(leaf.Destroyed).toBe(true)
		end)
	end)
end
