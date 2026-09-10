--!nocheck
-- Roblox sorts UIListLayout/UIGridLayout children by Name unless told
-- otherwise, so a render that reads top-to-bottom would lay out alphabetically.
-- Rovy numbers children by declaration order and points the layout at it.

local Helpers = require("../harness/helpers")

-- Names in the order Roblox would lay them out: ascending LayoutOrder. Absolute
-- values are not asserted, only that declaration order survives.
local function laidOutNames(panel)
	local labels = {}
	for _, child in ipairs(panel:GetChildren()) do
		if child.ClassName == "TextLabel" then
			table.insert(labels, child)
		end
	end
	table.sort(labels, function(a, b) return a.LayoutOrder < b.LayoutOrder end)
	local names = {}
	for _, label in ipairs(labels) do
		table.insert(names, label.Name)
	end
	return table.concat(names, ",")
end

return function(TS, t)
	local H = Helpers.load(TS)

	t.describe("layout order", function()
		t.it("numbers children by declaration order, not by name", function()
			H.reset()
			-- Declared Title, Frames, Hint; sorted by name that would be
			-- Frames, Hint, Title.
			local Root = H.uiClass("test/LayoutOrderRoot", function()
				return H.frame({ Name = "Panel" }, {
					H.uiListLayout(),
					H.textLabel({ Name = "Title", Text = "Rovy UI" }),
					H.textLabel({ Name = "Frames", Text = "frames" }),
					H.textLabel({ Name = "Hint", Text = "hint" }),
				})
			end)
			local app = H.startedApp()
			local screen = _G.Instance.new("ScreenGui")
			H.mountUi(app, Root, { target = screen })
			app:flush()

			local panel = screen:FindFirstChild("Panel")
			t.expect(laidOutNames(panel)).toBe("Title,Frames,Hint")

			local layout = panel:FindFirstChild("UIListLayout")
			t.expect(layout.SortOrder).toBe(Enum.SortOrder.LayoutOrder)
		end)

		t.it("keeps an explicit LayoutOrder and an explicit SortOrder", function()
			H.reset()
			local Root = H.uiClass("test/LayoutOrderExplicit", function()
				return H.frame({ Name = "Panel" }, {
					H.uiListLayout({ SortOrder = Enum.SortOrder.Name }),
					H.textLabel({ Name = "Title", Text = "Rovy UI", LayoutOrder = 50 }),
					H.textLabel({ Name = "Frames", Text = "frames" }),
				})
			end)
			local app = H.startedApp()
			local screen = _G.Instance.new("ScreenGui")
			H.mountUi(app, Root, { target = screen })
			app:flush()

			local panel = screen:FindFirstChild("Panel")
			local title = panel:FindFirstChild("Title")
			local frames = panel:FindFirstChild("Frames")
			t.expect(title.LayoutOrder).toBe(50)
			t.expect(frames.LayoutOrder < title.LayoutOrder).toBe(true)

			local layout = panel:FindFirstChild("UIListLayout")
			t.expect(layout.SortOrder).toBe(Enum.SortOrder.Name)
		end)
	end)
end
