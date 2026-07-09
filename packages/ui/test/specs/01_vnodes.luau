--!nocheck
-- vnode construction: native/child/fragment factories, the element helpers,
-- jsx/jsxs, and props/children normalization. Pure data — no App needed.

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)
	local ui = H.ui

	t.describe("vnode factories", function()
		t.it("child() builds a component vnode with copied props + key/callsite", function()
			local Ctor = {}
			local props = { a = 1 }
			local node = ui.child(Ctor, props, { key = "k", __callsite = "cs" })
			t.expect(node.kind).toBe("component")
			t.expect(node.ctor).toBe(Ctor)
			t.expect(node.key).toBe("k")
			t.expect(node.__callsite).toBe("cs")
			t.expect(node.props.a).toBe(1)
			-- props are copied, not aliased
			t.expect(node.props).never.toBe(props)
		end)

		t.it("native() strips reserved keys and reads key/callsite from props", function()
			local node = ui.native("Frame", {
				Name = "F",
				key = 7,
				__callsite = "site",
				children = false,
			})
			t.expect(node.kind).toBe("native")
			t.expect(node.className).toBe("Frame")
			t.expect(node.props.Name).toBe("F")
			t.expect(node.props.key).toBeUndefined()
			t.expect(node.props.__callsite).toBeUndefined()
			t.expect(node.props.children).toBeUndefined()
			t.expect(node.key).toBe(7)
			t.expect(node.__callsite).toBe("site")
		end)

		t.it("options key/callsite win over props key/callsite", function()
			local node = ui.native("Frame", { key = 1 }, nil, { key = 2, __callsite = "opt" })
			t.expect(node.key).toBe(2)
			t.expect(node.__callsite).toBe("opt")
		end)

		t.it("native() takes children from the props.children fallback", function()
			local inner = ui.frame({ Name = "Inner" })
			local node = ui.native("Frame", { Name = "Outer", children = inner })
			t.expect(#node.children).toBe(1)
			t.expect(node.children[1].props.Name).toBe("Inner")
		end)

		t.it("fragment() normalizes an array of children, dropping false/undefined", function()
			local node = ui.fragment({ ui.frame({ Name = "A" }), false, ui.frame({ Name = "B" }) })
			t.expect(node.kind).toBe("fragment")
			t.expect(#node.children).toBe(2)
		end)

		t.it("a single (non-array) child normalizes to a one-element list", function()
			local node = ui.frame({ Name = "P" }, ui.frame({ Name = "Only" }))
			t.expect(#node.children).toBe(1)
			t.expect(node.children[1].props.Name).toBe("Only")
		end)

		t.it("false / nil children produce an empty child list", function()
			t.expect(#ui.frame({ Name = "P" }, false).children).toBe(0)
			t.expect(#ui.frame({ Name = "P" }).children).toBe(0)
		end)
	end)

	t.describe("element helpers map to class names", function()
		local cases = {
			{ ui.frame, "Frame" },
			{ ui.textLabel, "TextLabel" },
			{ ui.textButton, "TextButton" },
			{ ui.imageLabel, "ImageLabel" },
			{ ui.imageButton, "ImageButton" },
			{ ui.scrollingFrame, "ScrollingFrame" },
			{ ui.canvasGroup, "CanvasGroup" },
			{ ui.textBox, "TextBox" },
			{ ui.viewportFrame, "ViewportFrame" },
			{ ui.uiListLayout, "UIListLayout" },
			{ ui.uiGridLayout, "UIGridLayout" },
			{ ui.uiPadding, "UIPadding" },
			{ ui.uiCorner, "UICorner" },
			{ ui.uiStroke, "UIStroke" },
			{ ui.uiScale, "UIScale" },
			{ ui.uiAspectRatioConstraint, "UIAspectRatioConstraint" },
			{ ui.uiSizeConstraint, "UISizeConstraint" },
		}
		for _, case in ipairs(cases) do
			local factory, className = case[1], case[2]
			t.it("produces a " .. className, function()
				t.expect(factory({}).className).toBe(className)
			end)
		end
	end)

	t.describe("edge cases", function()
		t.it("child() with nil props normalizes to an empty table", function()
			local Ctor = {}
			local node = ui.child(Ctor)
			t.expect(node.kind).toBe("component")
			t.expect(node.props).toBeDefined()
			t.expect(node.props.placeholder).toBeUndefined()
		end)

		t.it("native() with nil props and nil children produces valid empty vnode", function()
			local node = ui.native("Frame")
			t.expect(node.kind).toBe("native")
			t.expect(node.className).toBe("Frame")
			t.expect(#node.children).toBe(0)
			t.expect(node.key).toBeUndefined()
		end)
	end)

	t.describe("jsx / jsxs", function()
		t.it("jsx(string, props, key) builds a native vnode", function()
			local node = ui.jsx("Frame", { Name = "J", children = ui.frame({ Name = "C" }) }, "kk")
			t.expect(node.kind).toBe("native")
			t.expect(node.className).toBe("Frame")
			t.expect(node.key).toBe("kk")
			t.expect(#node.children).toBe(1)
		end)

		t.it("jsx(ctor, props, key) builds a component vnode", function()
			local Ctor = {}
			local node = ui.jsx(Ctor, { a = 1 }, "kk")
			t.expect(node.kind).toBe("component")
			t.expect(node.ctor).toBe(Ctor)
			t.expect(node.key).toBe("kk")
		end)

		t.it("jsx(string, nil) builds a native vnode with empty props", function()
			local node = ui.jsx("Frame", nil, nil)
			t.expect(node.kind).toBe("native")
			t.expect(node.className).toBe("Frame")
			t.expect(#node.children).toBe(0)
		end)

		t.it("jsx(ctor, nil) builds a component vnode with empty props", function()
			local Ctor = {}
			local node = ui.jsx(Ctor, nil, nil)
			t.expect(node.kind).toBe("component")
			t.expect(node.ctor).toBe(Ctor)
		end)

		t.it("jsxs is the same function as jsx and Fragment is fragment", function()
			t.expect(ui.jsxs).toBe(ui.jsx)
			t.expect(ui.Fragment).toBe(ui.fragment)
		end)
	end)
end
