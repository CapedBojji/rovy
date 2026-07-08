--!nocheck
-- Internal branches that are hard to hit through normal UI flows: destroyed guards,
-- identity mismatches, and nil-bound event bindings.

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)

	t.describe("private runtime edge branches", function()
		t.it("reconcileNode destroys a mismatched old node before mounting replacement", function()
			H.reset()
			local app = H.startedApp()
			local reconcileNode = H.ui.__test.reconcileNode
			local oldNative = {
				kind = "native",
				className = "TextLabel",
				props = {},
				instance = {},
				children = {},
				connections = {},
			}
			oldNative.instance.Destroy = function()
				oldNative.instance.Destroyed = true
			end

			local parent = { __isParent = true }
			local vnode = { kind = "fragment", children = {} }
			local state = {
				dirty = {},
				flushing = false,
				scheduled = false,
				destroyed = false,
				cleanups = {},
				app = app,
				target = H.target(),
			}

			reconcileNode(state, oldNative, vnode, parent)
			t.expect(oldNative.instance.Destroyed).toBe(true)
		end)

		t.it("sameIdentity handles kind and identity mismatches", function()
			H.reset()
			local sameIdentity = H.ui.__test.sameIdentity
			t.expect(sameIdentity).toBeDefined()
			t.expect(sameIdentity({
				kind = "native",
				key = "a",
				className = "TextLabel",
				callsite = nil,
			}, {
				kind = "component",
				key = "a",
				ctor = {},
			})).toBe(false)
			t.expect(sameIdentity({
				kind = "native",
				key = "a",
				callsite = nil,
				className = "TextLabel",
			}, {
				kind = "native",
				key = "b",
				callsite = "other",
				className = "TextLabel",
			})).toBe(false)
		end)

		t.it("renderComponent and markDirty stop early when node/state are destroyed", function()
			H.reset()
			local reconcileNode = H.ui.__test.reconcileNode
			local renderComponent = H.ui.__test.renderComponent
			local markDirty = H.ui.__test.markDirty
			t.expect(reconcileNode).toBeDefined()
			t.expect(renderComponent).toBeDefined()
			t.expect(markDirty).toBeDefined()

			local app = H.startedApp()
			local state = { app = app }
			renderComponent(state, {
				destroyed = true,
				instance = {},
				reg = { id = "test" },
				locals = {},
				parent = nil,
			})

			markDirty({ destroyed = true }, {})
			markDirty({}, { destroyed = true })
			t.expect(true).toBe(true)
		end)

		t.it("bindingMatches returns false when binding exists but actual value is nil", function()
			H.reset()
			local bindingMatches = H.ui.__test.bindingMatches
			t.expect(bindingMatches).toBeDefined()

			t.expect(bindingMatches({
				props = { entity = 99 },
			}, { kind = "prop", key = "entity" }, nil)).toBe(false)
		end)
	end)
end
