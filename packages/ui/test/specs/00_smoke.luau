--!nocheck
-- Smoke: the harness can load the compiled ui runtime + core App, register an
-- @ui fixture, mount it, and produce a real Instance tree under the target.

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)

	t.describe("ui smoke", function()
		t.it("loads runtime, core App and macros", function()
			t.expect(H.RovyUi).toBeDefined()
			t.expect(H.mountUi).toBeDefined()
			t.expect(H.portal).toBeDefined()
			t.expect(H.App).toBeDefined()
			t.expect(H.rovy).toBeDefined()
			t.expect(H.componentTrigger).toBeDefined()
		end)

		t.it("mounts a native frame under an explicit target", function()
			H.reset()
			local Comp = H.uiClass("test/Smoke", function(self)
				return H.frame({ Name = "Root", BackgroundTransparency = 1 })
			end)
			local app = H.startedApp()
			local target = H.target("SmokeGui")
			local handle = H.mountUi(app, Comp, { target = target })

			local root = target:FindFirstChild("Root")
			t.expect(root).toBeDefined()
			t.expect(root.ClassName).toBe("Frame")
			t.expect(root.Parent).toBe(target)

			handle.destroy()
			t.expect(target:FindFirstChild("Root")).never.toBeDefined()
		end)

		t.it("unmountUi destroys through the public alias", function()
			H.reset()
			local Comp = H.uiClass("test/UnmountAlias", function()
				return H.textLabel({ Name = "Root" })
			end)
			local app = H.startedApp()
			local target = H.target()
			local handle = H.mountUi(app, Comp, { target = target })
			t.expect(target:FindFirstChild("Root")).toBeDefined()
			H.unmountUi(handle)
			t.expect(target:FindFirstChild("Root")).never.toBeDefined()
		end)
	end)
end
