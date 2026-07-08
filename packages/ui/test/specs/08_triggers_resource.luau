--!nocheck
-- $resourceTrigger: a component re-renders when its resource changes, its
-- render sees the fresh Res<T>, and the subscription is torn down on destroy.

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)

	local function setup()
		local Theme = H.class(function(v)
			return { value = v or 0 }
		end)
		H.rovy:__resource(Theme, "test/Theme")
		local stats = { renders = 0 }
		local Comp = H.uiClass("test/ThemeView", function(self, theme)
			stats.renders += 1
			return H.textLabel({ Name = "Status", Text = "theme=" .. tostring(theme.value) })
		end, {
			params = { { kind = "res", ctor = Theme } },
			triggers = { H.resourceTrigger(Theme) },
		})
		return Theme, Comp, stats
	end

	t.describe("$resourceTrigger", function()
		t.it("re-renders on resource change with the fresh value injected", function()
			H.reset()
			local Theme, Comp, stats = setup()
			local app = H.startedApp()
			local target = H.target()
			H.mountUi(app, Comp, { target = target })

			t.expect(target:FindFirstChild("Status").Text).toBe("theme=0")
			t.expect(stats.renders).toBe(1)

			app.world:insertResource(Theme.new(7))
			H.settle(app)
			t.expect(target:FindFirstChild("Status").Text).toBe("theme=7")
			t.expect(stats.renders).toBe(2)
		end)

		t.it("stops re-rendering after destroy", function()
			H.reset()
			local Theme, Comp, stats = setup()
			local app = H.startedApp()
			local handle = H.mountUi(app, Comp, { target = H.target() })
			t.expect(stats.renders).toBe(1)

			handle.destroy()
			app.world:insertResource(Theme.new(3))
			H.settle(app)
			t.expect(stats.renders).toBe(1) -- unsubscribed
		end)
	end)
end
