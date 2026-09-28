--!nocheck

return function(TS, t)
	local ui = TS.loadPath("out/init").default

	local function find(instance, predicate)
		if predicate(instance) then return instance end
		for _, child in ipairs(instance:GetChildren()) do
			local result = find(child, predicate)
			if result then return result end
		end
	end

	local function button(gui, text)
		return find(gui, function(instance)
			return instance.ClassName == "TextButton" and instance.Text == text
		end)
	end

	local function fixture(initialOptions)
		ui.__reset()
		local gui = _G.Instance.new("ScreenGui")
		local node = ui.new(gui)
		local f = { gui = gui, node = node, options = initialOptions }
		function f:render()
			ui.start(node, function()
				self.handle = ui.tabBar(self.options, self.content)
			end)
			return self.handle
		end
		function f:click(text)
			local target = button(gui, text)
			t.expect(target).toBeDefined()
			target.Activated:Fire()
		end
		return f
	end

	local function items()
		return {
			{ id = "a", label = "Alpha" },
			{ id = "disabled", label = "Disabled", disabled = true },
			{ id = "b", label = "Beta" },
			{ id = "c", label = "Gamma" },
		}
	end

	t.describe("@rovy/imgui tabs", function()
		t.it("defaults to the first enabled tab and accepts an initial ID", function()
			local list = items()
			list[1].disabled = true
			local f = fixture({ tabs = list })
			t.expect(f:render():selected()).toBe("b")
			t.expect(f.handle:changed()).toBe(false)
			f = fixture({ tabs = items(), initial = "c" })
			t.expect(f:render():selected()).toBe("c")
		end)

		t.it("selects on activation, reports change once, and ignores disabled activation", function()
			local f = fixture({ tabs = items() })
			f:render()
			f:click("Beta")
			t.expect(f:render():selected()).toBe("b")
			t.expect(f.handle:changed()).toBe(true)
			t.expect(f.handle:changed()).toBe(false)
			f:click("Disabled")
			t.expect(f:render():selected()).toBe("b")
			t.expect(f.handle:changed()).toBe(false)
			f:click("Beta")
			f:render()
			t.expect(f.handle:changed()).toBe(false)
		end)

		t.it("reports user selection before resynchronizing externally controlled selection", function()
			local f = fixture({ tabs = items(), selected = "c" })
			t.expect(f:render():selected()).toBe("c")
			f:click("Beta")
			t.expect(f:render():selected()).toBe("b")
			t.expect(f.handle:changed()).toBe(true)
			f.options.selected = f.handle:selected()
			t.expect(f:render():selected()).toBe("b")
			t.expect(f.handle:changed()).toBe(false)
			f.options.selected = "a"
			t.expect(f:render():selected()).toBe("a")
			f:click("Gamma")
			t.expect(f:render():selected()).toBe("c")
			t.expect(f:render():selected()).toBe("a")
		end)

		t.it("preserves IDs and instances across reorder and rename", function()
			local list = items()
			local f = fixture({ tabs = list, initial = "b" })
			f:render()
			local beta = button(f.gui, "Beta")
			list[3].label = "A much longer label"
			f.options.tabs = { list[3], list[1], list[4], list[2] }
			t.expect(f:render():selected()).toBe("b")
			t.expect(button(f.gui, "A much longer label")).toBe(beta)
			t.expect(beta.LayoutOrder).toBe(1)
			t.expect(beta.Size.X.Offset).toBe(math.ceil(#list[3].label * ui.getActiveStyle().textSize * 0.6) + 20)
		end)

		t.it("falls back when selection disappears or becomes disabled, then handles empty bars", function()
			local list = items()
			local f = fixture({ tabs = list, initial = "b" })
			f:render()
			list[3].disabled = true
			t.expect(f:render():selected()).toBe("a")
			t.expect(f.handle:changed()).toBe(true)
			f:click("Beta") -- Existing handler must read current disabled state.
			t.expect(f:render():selected()).toBe("a")
			list[1].disabled = true
			list[4].disabled = true
			t.expect(f:render():selected()).toBeUndefined()
			f.options.tabs = {}
			t.expect(f:render():selected()).toBeUndefined()
			f.options.tabs = { { id = "new", label = "New" } }
			t.expect(f:render():selected()).toBe("new")
			f.options.tabs = { { id = "other", label = "Other" } }
			t.expect(f:render():selected()).toBe("other")
		end)

		t.it("rejects duplicate IDs even with different labels", function()
			local f = fixture({ tabs = { { id = "a", label = "One" }, { id = "a", label = "Two" } } })
			t.expect(function() f:render() end).toThrow()
		end)

		t.it("keeps bars independent and renders only keyed active content", function()
			ui.__reset()
			local gui = _G.Instance.new("ScreenGui")
			local node = ui.new(gui)
			local left, right, active
			local function render()
				ui.start(node, function()
					left = ui.tabBar({ tabs = items() }, function(id)
						active = id
						ui.label("Content " .. id)
					end)
					right = ui.tabBar({ tabs = { { id = "x", label = "Extra" }, { id = "y", label = "Other" } } })
				end)
			end
			render()
			local oldContent = find(gui, function(i) return i.Text == "Content a" end)
			button(gui, "Beta").Activated:Fire()
			render()
			t.expect(left:selected()).toBe("b")
			t.expect(right:selected()).toBe("x")
			t.expect(active).toBe("b")
			t.expect(oldContent.Destroyed).toBe(true)
		end)

		t.it("uses scrolling overflow by default and can switch to a fixed row", function()
			local f = fixture({ tabs = items(), minimumWidth = 120, padding = 9 })
			f:render()
			local alpha = button(f.gui, "Alpha")
			t.expect(alpha.Size.X.Offset).toBe(120)
			t.expect(alpha.Parent.ClassName).toBe("ScrollingFrame")
			t.expect(alpha.Parent.AutomaticCanvasSize).toBe(_G.Enum.AutomaticSize.X)
			f.options.scrollX = false
			f:render()
			t.expect(alpha.Destroyed).toBe(true)
			t.expect(button(f.gui, "Alpha").Parent.ClassName).toBe("Frame")
			f.options.scrollX = true
			f:render()
			t.expect(button(f.gui, "Alpha").Parent.ClassName).toBe("ScrollingFrame")
		end)

		t.it("navigates focused enabled tabs, wraps, and reveals overflowing targets", function()
			_G.__rovyTestRuntime.resetConnections()
			local f = fixture({ tabs = items() })
			f:render()
			local guiService = _G.__rovyTestServices.GuiService
			local inputService = _G.__rovyTestServices.UserInputService
			local playerGui = _G.Instance.new("PlayerGui")
			f.gui.Parent = playerGui
			local blocker = nil
			local alpha = button(f.gui, "Alpha")
			local beta = button(f.gui, "Beta")
			beta.AbsolutePosition = _G.Vector2.new(150, 0)
			beta.AbsoluteSize = _G.Vector2.new(80, 20)
			guiService.SelectedObject = alpha
			local function key(name, processed)
				playerGui.__guiObjectsAtPosition = { blocker or guiService.SelectedObject }
				inputService.InputBegan:Fire({ UserInputType = _G.Enum.UserInputType.Keyboard, KeyCode = _G.Enum.KeyCode[name] }, processed or false)
				f:render()
			end
			key("Right")
			t.expect(f.handle:selected()).toBe("b")
			t.expect(guiService.SelectedObject).toBe(beta)
			t.expect(beta.Parent.CanvasPosition.X).toBe(130)
			key("End")
			t.expect(f.handle:selected()).toBe("c")
			key("Right")
			t.expect(f.handle:selected()).toBe("a")
			key("Left")
			t.expect(f.handle:selected()).toBe("c")
			key("Home")
			t.expect(f.handle:selected()).toBe("a")
			key("Right", true)
			t.expect(f.handle:selected()).toBe("a")
			blocker = _G.Instance.new("TextButton")
			key("Right")
			t.expect(f.handle:selected()).toBe("a")
			blocker = nil
			alpha.Parent.Visible = false
			key("Right")
			t.expect(f.handle:selected()).toBe("a")
			alpha.Parent.Visible = true
			guiService.SelectedObject = _G.Instance.new("TextButton")
			key("Right")
			t.expect(f.handle:selected()).toBe("a")
			guiService.SelectedObject = alpha
			t.expect(_G.__rovyTestRuntime.liveConnectionCount("UserInputService.InputBegan")).toBe(1)
			ui.start(f.node, function() end)
			t.expect(_G.__rovyTestRuntime.liveConnectionCount("UserInputService.InputBegan")).toBe(0)
			guiService.SelectedObject = nil
		end)

		t.it("styles standalone tabs and consumes clicks once with current disabled options", function()
			ui.__reset()
			local gui = _G.Instance.new("ScreenGui")
			local node = ui.new(gui)
			local options = { selected = true }
			local handle
			local function render()
				ui.start(node, function() handle = ui.tab("Tools", options) end)
			end
			render()
			local target = button(gui, "Tools")
			local underline = find(target, function(i) return i.Name == "TabUnderline" end)
			t.expect(underline.Visible).toBe(true)
			t.expect(underline.BackgroundColor3).toBe(ui.getActiveStyle().accentColor)
			t.expect(handle:selected()).toBe(true)
			target.Activated:Fire()
			render()
			t.expect(handle:clicked()).toBe(true)
			t.expect(handle:clicked()).toBe(false)
			target.Activated:Fire()
			options = { disabled = true }
			render()
			t.expect(target.Selectable).toBe(false)
			t.expect(underline.Visible).toBe(false)
			target.Activated:Fire()
			render()
			t.expect(handle:clicked()).toBe(false)
			options = {}
			render()
			t.expect(handle:clicked()).toBe(false)
		end)
	end)
end
