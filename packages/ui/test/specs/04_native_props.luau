--!nocheck
-- Native prop patching across re-renders: add, change, no-op-skip, ref, and the
-- (documented) clear behaviour. Re-renders are driven by a Bump resource so the
-- root re-runs render and reconciles its native output.

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)

	-- Mount a root whose single native output is built from `ctrl` each render,
	-- re-rendered on Bump. Returns (app, target, ctrl).
	local function mountControlled(className, initialProps)
		local Bump = H.rerenderResource()
		local ctrl = { className = className, props = initialProps }
		local Comp = H.uiClass("test/PatchRoot", function()
			return H.native(ctrl.className, ctrl.props)
		end, { triggers = { H.resourceTrigger(Bump) } })
		local app = H.startedApp()
		local target = H.target()
		H.mountUi(app, Comp, { target = target })
		return app, target, ctrl
	end

	t.describe("patchNativeProps", function()
		t.it("adds a newly-present prop on re-render", function()
			H.reset()
			local app, target, ctrl = mountControlled("Frame", { Name = "Root" })
			local root = target:FindFirstChild("Root")
			t.expect(root.Visible).toBe(true) -- fake default
			ctrl.props = { Name = "Root", Visible = false }
			H.bump(app)
			t.expect(root.Visible).toBe(false)
		end)

		t.it("updates a changed prop value", function()
			H.reset()
			local app, target, ctrl = mountControlled("Frame", { Name = "Root", LayoutOrder = 1 })
			local root = target:FindFirstChild("Root")
			t.expect(root.LayoutOrder).toBe(1)
			ctrl.props = { Name = "Root", LayoutOrder = 9 }
			H.bump(app)
			t.expect(root.LayoutOrder).toBe(9)
		end)

		t.it("skips re-applying an unchanged prop value (ref not re-invoked)", function()
			-- setNativeProp is a no-op when node.props[key] == value. The `ref`
			-- key makes that observable: a stable ref fn is only invoked once.
			H.reset()
			local refCalls = 0
			local stableRef = function()
				refCalls += 1
			end
			local app, target, ctrl = mountControlled("Frame", { Name = "Root", ref = stableRef })
			t.expect(refCalls).toBe(1) -- initial mount
			ctrl.props = { Name = "Root", ref = stableRef } -- same fn → skipped
			H.bump(app)
			t.expect(refCalls).toBe(1)

			-- a different ref fn is a real change → re-applied
			local secondCalls = 0
			ctrl.props = { Name = "Root", ref = function()
				secondCalls += 1
			end }
			H.bump(app)
			t.expect(refCalls).toBe(1)
			t.expect(secondCalls).toBe(1)
		end)

		t.it("invokes a ref function with the created instance", function()
			H.reset()
			local captured
			local Comp = H.uiClass("test/Ref", function()
				return H.frame({
					Name = "Root",
					ref = function(instance)
						captured = instance
					end,
				})
			end)
			local app = H.startedApp()
			local target = H.target()
			H.mountUi(app, Comp, { target = target })
			t.expect(captured).toBeDefined()
			t.expect(captured).toBe(target:FindFirstChild("Root"))
		end)

		t.it("clearing a plain prop stops tracking it but keeps the last instance value", function()
			-- Documented limitation: clearNativeProp only fully resets 'events';
			-- a dropped plain prop is left as-is on the instance until re-set.
			H.reset()
			local app, target, ctrl = mountControlled("Frame", { Name = "Root", LayoutOrder = 5 })
			local root = target:FindFirstChild("Root")
			ctrl.props = { Name = "Root" } -- LayoutOrder dropped
			H.bump(app)
			t.expect(root.LayoutOrder).toBe(5) -- not reset
			ctrl.props = { Name = "Root", LayoutOrder = 12 } -- re-added
			H.bump(app)
			t.expect(root.LayoutOrder).toBe(12)
		end)
	end)
end
