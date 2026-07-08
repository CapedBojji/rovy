--!nocheck
-- Component prop updates: a parent re-render passes fresh props to a child;
-- updateProps returns true only when a value actually changed, so the child
-- re-renders on real changes and is skipped when props are identical.

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)

	-- Child writes "v=<value> r=<renderCount>" so both props and render count are
	-- observable from the instance tree.
	local Child = nil
	local function defineChild()
		Child = H.uiClass("test/Child", function(self)
			self.renders += 1
			return H.textLabel({
				Name = "Child",
				Text = string.format("v=%s r=%d", tostring(self.props.value), self.renders),
			})
		end)
	end

	local function mountParent(initialValue)
		local Bump = H.rerenderResource()
		defineChild()
		local ctrl = { value = initialValue }
		local Parent = H.uiClass("test/Parent", function()
			return H.frame({ Name = "Root" }, H.child(Child, { value = ctrl.value }))
		end, { triggers = { H.resourceTrigger(Bump) } })
		local app = H.startedApp()
		local target = H.target()
		H.mountUi(app, Parent, { target = target })
		return app, target, ctrl
	end

	t.describe("component prop updates", function()
		t.it("re-renders the child when a prop value changes", function()
			H.reset()
			local app, target, ctrl = mountParent("first")
			local root = target:FindFirstChild("Root")
			t.expect(root:FindFirstChild("Child").Text).toBe("v=first r=1")

			ctrl.value = "second"
			H.bump(app)
			t.expect(root:FindFirstChild("Child").Text).toBe("v=second r=2")
		end)

		t.it("does NOT re-render the child when props are identical", function()
			H.reset()
			local app, target, ctrl = mountParent("stable")
			local root = target:FindFirstChild("Root")
			t.expect(root:FindFirstChild("Child").Text).toBe("v=stable r=1")

			-- parent re-renders, but child props are unchanged → skip
			H.bump(app)
			H.bump(app)
			t.expect(root:FindFirstChild("Child").Text).toBe("v=stable r=1")
		end)

		t.it("re-renders again after a change following a no-op", function()
			H.reset()
			local app, target, ctrl = mountParent("a")
			local root = target:FindFirstChild("Root")
			H.bump(app) -- no-op (still "a") → stays r=1
			t.expect(root:FindFirstChild("Child").Text).toBe("v=a r=1")
			ctrl.value = "b"
			H.bump(app) -- real change → r=2
			t.expect(root:FindFirstChild("Child").Text).toBe("v=b r=2")
		end)

		t.it("re-renders when a prop key disappears", function()
			H.reset()
			local Bump = H.rerenderResource()
			local Child = H.uiClass("test/OptionalChild", function(self)
				self.renders += 1
				local withFlag = self.props.flag and "with" or "without"
				return H.textLabel({
					Name = "Child",
					Text = string.format("v=%s %s r=%d", tostring(self.props.value), withFlag, self.renders),
				})
			end)
			local parentState = { value = "start", flag = true }
			local Root = H.uiClass("test/OptionalRoot", function()
				return H.frame({ Name = "Root" }, H.child(Child, parentState))
			end, { triggers = { H.resourceTrigger(Bump) } })
			local app = H.startedApp()
			local target = H.target()
			H.mountUi(app, Root, { target = target })
			t.expect(target:FindFirstChild("Root"):FindFirstChild("Child").Text).toBe("v=start with r=1")

			parentState.flag = nil
			H.bump(app)
			t.expect(target:FindFirstChild("Root"):FindFirstChild("Child").Text).toBe("v=start without r=2")
		end)
	end)
end
