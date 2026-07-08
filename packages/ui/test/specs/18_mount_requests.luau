--!nocheck
-- The post-start extension: app.mount(...) queues a request that @rovy/ui
-- consumes after start, forwarding target/name/props. Non-@ui requests are
-- ignored by this consumer.

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)

	t.describe("app.mount → post-start ui extension", function()
		t.it("mounts a queued @ui root after start, forwarding props", function()
			H.reset()
			local Comp = H.uiClass("test/Requested", function(self)
				return H.textLabel({ Name = "Status", Text = "hello=" .. tostring(self.props.who) })
			end)
			local app = H.App.new()
			local target = H.target()
			app:mount(Comp, target, { props = { who = "world" } })
			app:start()

			t.expect(target:FindFirstChild("Status")).toBeDefined()
			t.expect(target:FindFirstChild("Status").Text).toBe("hello=world")
		end)

		t.it("mounts multiple queued ui requests after start", function()
			H.reset()
			local A = H.uiClass("test/RequestedA", function()
				return H.frame({ Name = "A" })
			end)
			local B = H.uiClass("test/RequestedB", function(self)
				return H.textLabel({ Name = "B", Text = tostring(self.props.value) })
			end)
			local targetA = H.target("RequestedTargetA")
			local targetB = H.target("RequestedTargetB")
			local app = H.App.new()
			app:mount(A, targetA, {})
			app:mount(B, targetB, { props = { value = 11 } })
			app:start()

			t.expect(targetA:FindFirstChild("A")).toBeDefined()
			t.expect(targetB:FindFirstChild("B")).toBeDefined()
			t.expect(targetB:FindFirstChild("B").Text).toBe("11")
		end)

		t.it("forwards an explicit name to the auto-created ScreenGui", function()
			H.reset()
			local Comp = H.uiClass("test/NamedReq", function()
				return H.frame({ Name = "Root" })
			end)
			local app = H.App.new()
			app:mount(Comp, nil, { name = "RequestedGui" })
			app:start()

			local playerGui = _G.__rovyTestServices.Players.LocalPlayer:FindFirstChild("PlayerGui")
			local gui = playerGui:FindFirstChild("RequestedGui")
			t.expect(gui).toBeDefined()
			t.expect(gui:FindFirstChild("Root")).toBeDefined()
		end)

		t.it("passes request target through extension even when name is present", function()
			H.reset()
			local Comp = H.uiClass("test/RequestedWithTarget", function()
				return H.frame({ Name = "Root" })
			end)
			local target = H.target("RequestTarget")
			local app = H.App.new()
			app:mount(Comp, target, { name = "ShouldNotCreate" })
			app:start()

			t.expect(target:FindFirstChild("Root")).toBeDefined()
			local playerGui = _G.__rovyTestServices.Players.LocalPlayer:FindFirstChild("PlayerGui")
			t.expect(playerGui:FindFirstChild("ShouldNotCreate")).never.toBeDefined()
		end)

	t.it("ignores a mount request whose ctor is not an @ui class", function()
			H.reset()
			local NotUi = H.class(function() return {} end)
			local app = H.App.new()
			local target = H.target()
			-- request satisfies the non-empty-registry guard, but no consumer
			-- handles it → start succeeds and nothing is rendered.
			app:mount(NotUi, target)
			t.expect(function()
				app:start()
			end).never.toThrow()
			t.expect(#target:GetChildren()).toBe(0)
		end)

		t.it("does not retry a non-@ui mount request after start", function()
			H.reset()
			local NotUi = H.class(function()
				return {}
			end)
			local target = H.target("RetryRequestTarget")
			local app = H.App.new()
			app:mount(NotUi, target)
			app:start()
			t.expect(#target:GetChildren()).toBe(0)

			H.rovy:__component(NotUi, "test/LateUi")
			H.RovyUi:__ui(NotUi, {
				id = "test/LateUi",
				methods = { "render" },
				params = {},
				triggers = {},
			})
			t.expect(function()
				H.settle(app)
			end).never.toThrow()
			t.expect(#target:GetChildren()).toBe(0)
		end)

		t.it("mounts a queued request once it becomes a registered @ui before start", function()
			H.reset()
			local Pending = H.class(function()
				return {}
			end)
			function Pending.render()
				return H.textLabel({ Name = "Pending" })
			end
			local target = H.target("LateRegistrationTarget")
			local app = H.App.new()
			app:mount(Pending, target)

			H.RovyUi:__ui(Pending, {
				id = "test/Pending",
				methods = { "render" },
				params = {},
				triggers = {},
			})
			app:start()
			t.expect(target:FindFirstChild("Pending")).toBeDefined()
		end)

		t.it("processes queued UI requests while ignoring non-UI requests in one start pass", function()
			H.reset()
			local Widget = H.uiClass("test/QueuedWidget", function()
				return H.textLabel({ Name = "QueuedWidget" })
			end)
			local NotUi = H.class(function()
				return {}
			end)
			local uiTarget = H.target("QueuedUiTarget")
			local nonUiTarget = H.target("QueuedNonUiTarget")
			local app = H.App.new()
			app:mount(NotUi, nonUiTarget)
			app:mount(Widget, uiTarget, {})
			t.expect(function()
				app:start()
			end).never.toThrow()
			t.expect(uiTarget:FindFirstChild("QueuedWidget")).toBeDefined()
			t.expect(#nonUiTarget:GetChildren()).toBe(0)
		end)
	end)
end
