--!nocheck
-- $propsTrigger: a marker trigger that installs no ECS subscription. Components
-- carrying it re-render purely from parent-driven prop changes, and are inert to
-- unrelated world activity.

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)

	t.describe("$propsTrigger", function()
		t.it("produces a { kind = 'props' } descriptor", function()
			local descriptor = H.propsTrigger()
			t.expect(descriptor.kind).toBe("props")
		end)

		t.it("re-renders from parent prop changes but not from world activity", function()
			H.reset()
			-- A world event source that MUST NOT re-render the props-only child.
			local Ping = H.class(function() return {} end)
			H.rovy:__event(Ping, { capacity = 4 })

			local childStats = { renders = 0 }
			local Child = H.uiClass("test/PropsChild", function(self)
				childStats.renders += 1
				return H.textLabel({ Name = "Child", Text = "v=" .. tostring(self.props.value) })
			end, {
				triggers = { H.propsTrigger() },
			})

			-- Parent re-renders on Bump and forwards ctrl.value to the child.
			local Bump = H.rerenderResource()
			local ctrl = { value = "a" }
			local Parent = H.uiClass("test/PropsParent", function()
				return H.frame({ Name = "Root" }, H.child(Child, { value = ctrl.value }))
			end, { triggers = { H.resourceTrigger(Bump) } })

			local app = H.startedApp()
			local target = H.target()
			H.mountUi(app, Parent, { target = target })
			t.expect(target:FindFirstChild("Root"):FindFirstChild("Child").Text).toBe("v=a")
			t.expect(childStats.renders).toBe(1)

			-- world event unrelated to props → child must not re-render
			app.world:trigger(Ping.new())
			H.settle(app)
			t.expect(childStats.renders).toBe(1)

			-- parent forwards a new prop value → child re-renders
			ctrl.value = "b"
			H.bump(app)
			t.expect(target:FindFirstChild("Root"):FindFirstChild("Child").Text).toBe("v=b")
			t.expect(childStats.renders).toBe(2)
		end)
	end)
end
