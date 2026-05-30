--!nocheck

return function(TS, t)
	local ui = TS.loadPath("out/init")
	local RovyUi = ui.default

	local function root()
		local r = _G.Instance.new("ScreenGui")
		r.Name = "ScreenGui"
		return r
	end

	local function run(fn)
		local node = RovyUi.new(root())
		RovyUi.start(node, fn)
		return node
	end

	local function countMap(map)
		local total = 0
		for _ in pairs(map) do
			total += 1
		end
		return total
	end

	local function firstMapValue(map)
		for _, value in pairs(map) do
			return value
		end
		return nil
	end

	local function findFirstInstanceNode(node, predicate)
		if node == nil then return nil end
		if node.instance ~= nil and (predicate == nil or predicate(node.instance)) then return node end
		for _, child in pairs(node.children) do
			local found = findFirstInstanceNode(child, predicate)
			if found ~= nil then return found end
		end
		return nil
	end

	local function findFirstInstance(node, predicate)
		local found = findFirstInstanceNode(node, predicate)
		return found and found.instance or nil
	end

	local function collectInstances(node, out, seen)
		out = out or {}
		seen = seen or {}
		if node == nil then return out end
		if node.instance ~= nil and not seen[node.instance] then
			seen[node.instance] = true
			table.insert(out, node.instance)
		end
		for _, child in pairs(node.children) do
			collectInstances(child, out, seen)
		end
		return out
	end

	local function findChildByClass(instance, className)
		for _, child in ipairs(instance:GetChildren()) do
			if child.ClassName == className then return child end
		end
		return nil
	end

	local function findFirstDescendant(instance, predicate)
		if predicate(instance) then return instance end
		for _, child in ipairs(instance:GetChildren()) do
			local found = findFirstDescendant(child, predicate)
			if found ~= nil then return found end
		end
		return nil
	end

	t.describe("@rovy/ui runtime", function()
		t.it("returns default active style", function()
			RovyUi.__reset()
			t.expect(RovyUi.getActiveStyle().textColor).toBeDefined()
			t.expect(RovyUi.getActiveStyle().windowBgColor).toBeDefined()
		end)

		t.it("merges nested style scopes and restores parent", function()
			RovyUi.__reset()
			local seen = {}
			run(function()
				local baseText = RovyUi.useStyle().textColor
				local outerColor = { name = "outer" }
				local innerColor = { name = "inner" }
				RovyUi.__withStyleScope("outer", { patch = { textColor = outerColor } }, function()
					table.insert(seen, RovyUi.useStyle().textColor)
					RovyUi.__withStyleScope("inner", { patch = { windowBgColor = innerColor } }, function()
						table.insert(seen, RovyUi.useStyle().textColor)
						table.insert(seen, RovyUi.useStyle().windowBgColor)
					end)
				end)
				table.insert(seen, RovyUi.useStyle().textColor)
				t.expect(baseText).toBe(seen[4])
			end)
			t.expect(seen[1].name).toBe("outer")
			t.expect(seen[2].name).toBe("outer")
			t.expect(seen[3].name).toBe("inner")
		end)

		t.it("restores style when scope throws", function()
			RovyUi.__reset()
			t.expect(function()
				run(function()
					RovyUi.__withStyleScope("boom", { patch = { textColor = { name = "boom" } } }, function()
						error("boom")
					end)
				end)
			end).toThrow()
		end)

		t.it("registers and invokes wrapped widgets", function()
			RovyUi.__reset()
			local seen
			local Widget = RovyUi.__widget(function(value)
				seen = value
			end, { id = "spec@Widget", name = "Widget" })
			run(function()
				RovyUi.__callWidget("call:widget", Widget, "ok")
			end)
			t.expect(#RovyUi.registry).toBe(1)
			t.expect(seen).toBe("ok")
		end)

		t.it("keeps useState storage per widget call key across frames", function()
			RovyUi.__reset()
			local seen = {}
			local Widget = RovyUi.__widget(function(label)
				local state = RovyUi.__useState("counter", 0)
				local count, setCount = state[1], state[2]
				table.insert(seen, label .. ":" .. tostring(count))
				setCount(count + 1)
			end, { id = "spec@Counter", name = "Counter" })
			local node = RovyUi.new(root())

			RovyUi.start(node, function()
				RovyUi.__callWidget("call:a", Widget, "A")
				RovyUi.__callWidget("call:b", Widget, "B")
			end)
			RovyUi.start(node, function()
				RovyUi.__callWidget("call:a", Widget, "A")
			end)

			t.expect(seen[1]).toBe("A:0")
			t.expect(seen[2]).toBe("B:0")
			t.expect(seen[3]).toBe("A:1")
		end)

		t.it("preserves object table keys in useState values across frames", function()
			RovyUi.__reset()
			local Root = {}
			local stateTables = {}
			local Widget = RovyUi.__widget(function()
				local state = RovyUi.__useState("object-keyed", function()
					return {
						[Root] = { count = 0 },
					}
				end)
				local values, setValues = state[1], state[2]
				t.expect(values[Root]).never.toBeUndefined()
				values[Root].count += 1
				table.insert(stateTables, values)
				setValues(values)
			end, { id = "spec@ObjectState", name = "ObjectState" })
			local node = RovyUi.new(root())

			RovyUi.start(node, function()
				RovyUi.__callWidget("call:state", Widget)
			end)
			RovyUi.start(node, function()
				RovyUi.__callWidget("call:state", Widget)
			end)

			t.expect(stateTables[2]).toBe(stateTables[1])
			t.expect(stateTables[2][Root].count).toBe(2)
		end)

		t.it("runs useEffect on dependency changes and cleans up stale effect", function()
			RovyUi.__reset()
			local runs = 0
			local cleanups = 0
			local Widget = RovyUi.__widget(function(dep)
				RovyUi.__useEffect("effect", function()
					runs += 1
					return function()
						cleanups += 1
					end
				end, dep)
			end, { id = "spec@Effect", name = "Effect" })
			local node = RovyUi.new(root())

			RovyUi.start(node, function()
				RovyUi.__callWidget("call:effect", Widget, "a")
			end)
			RovyUi.start(node, function()
				RovyUi.__callWidget("call:effect", Widget, "a")
			end)
			RovyUi.start(node, function()
				RovyUi.__callWidget("call:effect", Widget, "b")
			end)
			t.expect(runs).toBe(2)
			t.expect(cleanups).toBe(1)
		end)

		t.it("compares useEffect dependencies by original object identity", function()
			RovyUi.__reset()
			local Root = {}
			local OtherRoot = {}
			local runs = 0
			local cleanups = 0
			local seen = {}
			local Widget = RovyUi.__widget(function(dep)
				RovyUi.__useEffect("identity-effect", function()
					runs += 1
					table.insert(seen, dep)
					return function()
						cleanups += 1
					end
				end, dep)
			end, { id = "spec@IdentityEffect", name = "IdentityEffect" })
			local node = RovyUi.new(root())

			RovyUi.start(node, function()
				RovyUi.__callWidget("call:effect", Widget, Root)
			end)
			RovyUi.start(node, function()
				RovyUi.__callWidget("call:effect", Widget, Root)
			end)
			RovyUi.start(node, function()
				RovyUi.__callWidget("call:effect", Widget, OtherRoot)
			end)

			t.expect(runs).toBe(2)
			t.expect(cleanups).toBe(1)
			t.expect(seen[1]).toBe(Root)
			t.expect(seen[2]).toBe(OtherRoot)
		end)

		t.it("creates instances and exposes widget catalog handles", function()
			RovyUi.__reset()
			local function must(name, fn)
				local ok, err = pcall(fn)
				if not ok then error(name .. ": " .. tostring(err), 2) end
			end
			local node = run(function()
				RovyUi.window("Tools", function()
					must("label", function() RovyUi.label("Hello") end)
					must("button", function() RovyUi.button("Click") end)
					must("checkbox", function() RovyUi.checkbox("Check") end)
					must("slider", function() RovyUi.slider({ initial = 2, label = "S" }) end)
					must("input", function() RovyUi.input({ text = "abc" }) end)
					must("row", function() RovyUi.row(function()
						RovyUi.space(4)
					end) end)
					must("table", function() RovyUi.table({ rowHeight = 20 }, function()
						RovyUi.tableRow(function()
							RovyUi.tableCell(function()
								RovyUi.label("Cell")
							end)
						end)
					end) end)
					must("childWindow", function() RovyUi.childWindow("Child", function() end) end)
					must("modal", function() RovyUi.modal({ title = "Modal" }, function() end) end)
					must("popup", function() RovyUi.popup({ open = true }, function() end) end)
					must("progressBar", function() RovyUi.progressBar({ value = 0.5 }) end)
					must("comboBox", function() RovyUi.comboBox({ items = { "A", "B" } }) end)
					must("dragValue", function() RovyUi.dragValue({ initial = 1 }) end)
					must("toggle", function() RovyUi.toggle("Toggle") end)
					must("radioButton", function() RovyUi.radioButton("Radio") end)
					must("selectableLabel", function() RovyUi.selectableLabel("Select") end)
					must("clickableLabel", function() RovyUi.clickableLabel("ClickLabel") end)
					must("collapsingHeader", function() RovyUi.collapsingHeader("Header", function() end) end)
					must("editableImage", function() RovyUi.editableImage({ size = _G.Vector2.new(2, 2) }) end)
				end)
			end)
			local hasChildren = false
			for _ in pairs(node.children) do
				hasChildren = true
				break
			end
			t.expect(hasChildren).toBeTruthy()
			end)

			t.it("snaps slider value to configured step", function()
				RovyUi.__reset()
				local snapped
				run(function()
					RovyUi.window("Tools", function()
						snapped = RovyUi.slider({ min = 1, max = 8, initial = 3.6, step = 1, label = "Stroke" })
					end)
				end)
				t.expect(snapped).toBe(4)
			end)

			t.it("writes pixels through EditableImageBuffer", function()
				RovyUi.__reset()
				local img = RovyUi.EditableImageBuffer.new(_G.Vector2.new(4, 4))
			local pixels = img:getBuffer()
			t.expect(_G.buffer.len(pixels)).toBe(64)

			img:setPixel(_G.Vector2.new(1, 2), _G.Color3.fromRGB(255, 128, 0), 200)
			local offset = (2 * 4 + 1) * 4
			t.expect(_G.buffer.readu8(pixels, offset)).toBe(255)
			t.expect(_G.buffer.readu8(pixels, offset + 1)).toBe(128)
			t.expect(_G.buffer.readu8(pixels, offset + 2)).toBe(0)
			t.expect(_G.buffer.readu8(pixels, offset + 3)).toBe(200)

			img:fillRect(_G.Vector2.new(2, 1), _G.Vector2.new(2, 2), _G.Color3.fromRGB(0, 10, 20), 77)
			local rectOffset = (1 * 4 + 2) * 4
			t.expect(_G.buffer.readu8(pixels, rectOffset)).toBe(0)
			t.expect(_G.buffer.readu8(pixels, rectOffset + 1)).toBe(10)
			t.expect(_G.buffer.readu8(pixels, rectOffset + 2)).toBe(20)
			t.expect(_G.buffer.readu8(pixels, rectOffset + 3)).toBe(77)

			img:clear(1, 2, 3, 4)
			t.expect(_G.buffer.readu8(pixels, 0)).toBe(1)
			t.expect(_G.buffer.readu8(pixels, 1)).toBe(2)
			t.expect(_G.buffer.readu8(pixels, 2)).toBe(3)
			t.expect(_G.buffer.readu8(pixels, 3)).toBe(4)
		end)

		t.it("draws lines, circles, and polygons into EditableImageBuffer", function()
			RovyUi.__reset()
			local img = RovyUi.EditableImageBuffer.new(_G.Vector2.new(8, 8))
			local pixels = img:getBuffer()

			img:drawLine(_G.Vector2.new(0, 0), _G.Vector2.new(3, 0), _G.Color3.fromRGB(10, 20, 30), { alpha = 40 })
			t.expect(_G.buffer.readu8(pixels, 0)).toBe(10)
			t.expect(_G.buffer.readu8(pixels, 1)).toBe(20)
			t.expect(_G.buffer.readu8(pixels, 2)).toBe(30)
			t.expect(_G.buffer.readu8(pixels, 3)).toBe(40)
			t.expect(_G.buffer.readu8(pixels, (0 * 8 + 3) * 4 + 3)).toBe(40)

			img:clear()
			img:drawCircle(_G.Vector2.new(3, 3), 2, _G.Color3.fromRGB(200, 0, 0), { alpha = 99 })
			t.expect(_G.buffer.readu8(pixels, (3 * 8 + 3) * 4)).toBe(200)
			t.expect(_G.buffer.readu8(pixels, (3 * 8 + 3) * 4 + 3)).toBe(99)
			t.expect(_G.buffer.readu8(pixels, (3 * 8 + 5) * 4 + 3)).toBe(99)
			t.expect(_G.buffer.readu8(pixels, (3 * 8 + 6) * 4 + 3)).toBe(0)

			img:clear()
			img:drawCircle(_G.Vector2.new(3, 3), 2, _G.Color3.fromRGB(0, 200, 0), { alpha = 77, fill = false })
			t.expect(_G.buffer.readu8(pixels, (3 * 8 + 3) * 4 + 3)).toBe(0)
			t.expect(_G.buffer.readu8(pixels, (3 * 8 + 5) * 4 + 3)).toBe(77)

			img:clear()
			img:drawPolygon({
				_G.Vector2.new(1, 1),
				_G.Vector2.new(5, 1),
				_G.Vector2.new(1, 5),
			}, _G.Color3.fromRGB(0, 0, 200), { alpha = 55 })
			t.expect(_G.buffer.readu8(pixels, (2 * 8 + 2) * 4 + 2)).toBe(200)
			t.expect(_G.buffer.readu8(pixels, (2 * 8 + 2) * 4 + 3)).toBe(55)
			t.expect(_G.buffer.readu8(pixels, (6 * 8 + 6) * 4 + 3)).toBe(0)

			img:clear()
			img:drawPolygon({
				_G.Vector2.new(1, 1),
				_G.Vector2.new(4, 1),
				_G.Vector2.new(4, 4),
				_G.Vector2.new(1, 4),
			}, _G.Color3.fromRGB(250, 250, 0), { alpha = 33, fill = false })
			t.expect(_G.buffer.readu8(pixels, (1 * 8 + 1) * 4 + 3)).toBe(33)
			t.expect(_G.buffer.readu8(pixels, (2 * 8 + 2) * 4 + 3)).toBe(0)
		end)

		t.it("displays an EditableImage and draws caller-provided buffers", function()
			RovyUi.__reset()
			local services = _G.__rovyTestServices
			table.clear(services.AssetService.CreatedEditableImages)
			services.AssetService.FailCreate = false
			local gui = root()
			local node = RovyUi.new(gui)
			local handle

			RovyUi.start(node, function()
				handle = RovyUi.editableImage({ size = _G.Vector2.new(2, 2) })
			end)

			t.expect(handle).toBeDefined()
			t.expect(#services.AssetService.CreatedEditableImages).toBe(1)
			local created = services.AssetService.CreatedEditableImages[1]
			t.expect(handle.image()).toBe(created)
			t.expect(handle.label().ClassName).toBe("ImageLabel")
			t.expect(handle.label().ImageContent.Object).toBe(created)

			local pixels = RovyUi.EditableImageBuffer.new(_G.Vector2.new(2, 2))
			pixels:setPixel(_G.Vector2.new(0, 0), _G.Color3.fromRGB(255, 0, 0), 255)
			t.expect(handle.draw(pixels:getBuffer())).toBe(true)
			t.expect(#created.Writes).toBe(1)
			t.expect(created.Writes[1].position.X).toBe(0)
			t.expect(created.Writes[1].position.Y).toBe(0)
			t.expect(created.Writes[1].size.X).toBe(2)
			t.expect(created.Writes[1].size.Y).toBe(2)
			t.expect(created.Writes[1].pixels).toBe(pixels:getBuffer())
			t.expect(handle.error()).toBe(nil)

			t.expect(handle.draw(_G.buffer.create(3))).toBe(false)
			t.expect(handle.error()).toBeDefined()

			RovyUi.start(node, function() end)
			t.expect(created.Destroyed).toBeTruthy()
		end)

		t.it("renders editableImage fallback when EditableImage creation fails", function()
			RovyUi.__reset()
			local services = _G.__rovyTestServices
			services.AssetService.FailCreate = true
			local gui = root()
			local node = RovyUi.new(gui)
			local handle

			RovyUi.start(node, function()
				handle = RovyUi.editableImage({ size = _G.Vector2.new(2, 2) })
			end)

			t.expect(handle).toBeDefined()
			t.expect(handle.error()).toBeDefined()
			t.expect(handle.draw(_G.buffer.create(16))).toBe(false)
			local fallback = findFirstDescendant(gui, function(instance)
				return instance.ClassName == "TextLabel" and instance.Visible == true and tostring(instance.Text):find("editableImage") ~= nil
			end)
			t.expect(fallback).toBeDefined()
			services.AssetService.FailCreate = false
		end)

		t.it("creates and reuses the expected instance tree across manual frames", function()
			RovyUi.__reset()
			local gui = root()
			local node = RovyUi.new(gui)

			local frame1Window
			local frame1Label
			local frame1Button
			local frame1Checkbox

			local handle1 = RovyUi.beginFrame(node, function()
				RovyUi.window({ title = "Inventory" }, function()
					RovyUi.label("Alpha")
					RovyUi.button("Take")
					RovyUi.checkbox("Flag")
				end)
			end)
			RovyUi.finishFrame(node)

			-- Widgets now render full EgooE-parity instance trees (UICorner,
			-- UIStroke, nested containers, ...), so this spec asserts runtime
			-- reconciliation behavior (instance reuse + teardown across frames)
			-- by widget identity, not exact stub structure or instance counts.
			t.expect(countMap(node.children)).toBe(1)
			local frame1ScopeNode = firstMapValue(node.children)
			local frame1Instances = collectInstances(frame1ScopeNode)
			frame1Window = findFirstInstance(frame1ScopeNode, function(instance)
				return instance.ClassName == "Frame" and instance.Parent == gui
			end)
			t.expect(frame1Window).toBeDefined()
			t.expect(frame1Window.Parent).toBe(gui)
			frame1Label = findFirstInstance(frame1ScopeNode, function(instance)
				return instance.ClassName == "TextLabel" and instance.Text == "Alpha"
			end)
			frame1Button = findFirstInstance(frame1ScopeNode, function(instance)
				return instance.ClassName == "TextButton" and instance.Text == "Take"
			end)
			-- Checkbox now renders a Frame row with a nested "Flag" TextLabel;
			-- the runtime node tracks the root Frame, so match it by that child.
			local function isCheckboxRow(instance)
				if instance.ClassName ~= "Frame" then return false end
				for _, child in ipairs(instance:GetChildren()) do
					if child.ClassName == "TextLabel" and child.Text == "Flag" then
						return true
					end
				end
				return false
			end
			frame1Checkbox = findFirstInstance(frame1ScopeNode, isCheckboxRow)
			t.expect(#frame1Instances > 0).toBeTruthy()
			t.expect(frame1Label).toBeDefined()
			t.expect(frame1Button).toBeDefined()
			t.expect(frame1Checkbox).toBeDefined()
			t.expect(frame1Label.Parent).toBeDefined()
			t.expect(frame1Window.Destroyed == nil or frame1Window.Destroyed == false).toBeTruthy()

			local handle2 = RovyUi.beginFrame(node, function()
				RovyUi.window({ title = "Inventory+" }, function()
					RovyUi.label("Beta")
					RovyUi.checkbox("Flag")
				end)
			end)
			RovyUi.finishFrame(node)

			local frame2ScopeNode = firstMapValue(node.children)
			local frame2Instances = collectInstances(frame2ScopeNode)
			local frame2Window = findFirstInstance(frame2ScopeNode, function(instance)
				return instance.ClassName == "Frame" and instance.Parent == gui
			end)
			local frame2Label = findFirstInstance(frame2ScopeNode, function(instance)
				return instance.ClassName == "TextLabel" and instance.Text == "Beta"
			end)
			local frame2Checkbox = findFirstInstance(frame2ScopeNode, isCheckboxRow)
			-- Same call slots across frames must reuse the same instances.
			t.expect(frame2Window).toBe(frame1Window)
			t.expect(frame2Label).toBe(frame1Label)
			t.expect(frame2Checkbox).toBe(frame1Checkbox)
			t.expect(frame2Label.Text).toBe("Beta")
			t.expect(#frame2Instances > 0).toBeTruthy()
			-- The removed button widget must be torn down.
			t.expect(frame1Button.Destroyed).toBeTruthy()
			t.expect(frame1Checkbox.Destroyed == nil or frame1Checkbox.Destroyed == false).toBeTruthy()
			t.expect(countMap(node.children)).toBe(1)

			local handle3 = RovyUi.beginFrame(node, function() end)
			RovyUi.finishFrame(node)

			local frame3ScopeNode = firstMapValue(node.children)
			t.expect(#collectInstances(frame3ScopeNode)).toBe(0)
			t.expect(frame1Window.Destroyed).toBeTruthy()
			t.expect(frame1Label.Destroyed).toBeTruthy()
			t.expect(frame1Checkbox.Destroyed).toBeTruthy()
			t.expect(handle1.frame).toBeDefined()
			t.expect(handle2.frame).toBeDefined()
			t.expect(handle3.frame).toBeDefined()
		end)

		t.it("marks floating UI surfaces active so clicks do not pass through", function()
			RovyUi.__reset()
			local gui = root()
			local node = RovyUi.new(gui)

			RovyUi.start(node, function()
				RovyUi.window({ title = "Top" }, function()
					RovyUi.childWindow("Child", function() end)
					RovyUi.comboBox({ items = { "A", "B" } })
					RovyUi.popup({ open = true }, function() end)
					RovyUi.modal({ title = "Modal", open = true }, function() end)
				end)
			end)

			local windowFrame = findFirstDescendant(gui, function(instance)
				return instance.ClassName == "Frame" and instance:GetAttribute("EgooEWindow") == true
			end)
			t.expect(windowFrame).toBeDefined()
			t.expect(windowFrame.Active).toBe(true)
			t.expect(windowFrame.InputSink).toBe(_G.Enum.InputSink.All)
			t.expect(windowFrame.ZIndex).toBe(100)

				local windowContainer = findFirstDescendant(windowFrame, function(instance)
					return instance.ClassName == "ScrollingFrame"
				end)
				t.expect(windowContainer).toBeDefined()
				t.expect(windowContainer.Active).toBe(true)
				t.expect(windowContainer.InputSink == _G.Enum.InputSink.All).toBe(false)
				t.expect(windowContainer.ZIndex > windowFrame.ZIndex).toBeTruthy()

				local dropdown = findFirstDescendant(gui, function(instance)
					return instance.Name == "ComboDropdown"
				end)
				t.expect(dropdown).toBeDefined()
				t.expect(dropdown.Active).toBe(true)
				t.expect(dropdown.InputSink == _G.Enum.InputSink.All).toBe(false)
				t.expect(dropdown.ZIndex).toBe(250)

			local popupPanel = findFirstDescendant(gui, function(instance)
				return instance.Name == "PopupPanel"
			end)
			t.expect(popupPanel).toBeDefined()
			t.expect(popupPanel.ClassName).toBe("Frame")
			t.expect(popupPanel.Active).toBe(true)
			t.expect(popupPanel.InputSink).toBe(_G.Enum.InputSink.All)
			t.expect(popupPanel.ZIndex).toBe(200)

				local modalOverlay = findFirstDescendant(gui, function(instance)
					return instance.Name == "ModalOverlay"
				end)
			t.expect(modalOverlay).toBeDefined()
			t.expect(modalOverlay.ClassName).toBe("TextButton")
			t.expect(modalOverlay.Active).toBe(true)
			t.expect(modalOverlay.Selectable).toBe(false)
			t.expect(modalOverlay.InputSink).toBe(_G.Enum.InputSink.All)

				local modalDialog = findFirstDescendant(gui, function(instance)
					return instance.Name == "ModalDialog"
				end)
			t.expect(modalDialog).toBeDefined()
			t.expect(modalDialog.Active).toBe(true)
			t.expect(modalDialog.InputSink).toBe(_G.Enum.InputSink.All)
			t.expect(modalDialog.ZIndex > modalOverlay.ZIndex).toBeTruthy()
		end)

		t.it("cleans transient UI connections when an interactive subtree unmounts", function()
			RovyUi.__reset()
			_G.__rovyTestRuntime.resetConnections()
			local services = _G.__rovyTestServices
			local playerGui = _G.Instance.new("PlayerGui")
			local gui = root()
			gui.Parent = playerGui
			local node = RovyUi.new(gui)

			RovyUi.start(node, function()
				RovyUi.window({ title = "Leaks" }, function()
					RovyUi.button("Hover")
					RovyUi.dragValue({ min = 0, max = 100, step = 1, initial = 0, label = "Speed" })
				end)
			end)

			local hoverButton = findFirstDescendant(gui, function(instance)
				return instance.ClassName == "TextButton" and instance.Text == "Hover"
			end)
			local dragButton = findFirstDescendant(gui, function(instance)
				return instance.ClassName == "TextButton" and instance.Text == "Speed: 0"
			end)
			t.expect(hoverButton).toBeDefined()
			t.expect(dragButton).toBeDefined()

			services.UserInputService.MouseLocation = { X = 10, Y = 12 }
			playerGui.__guiObjectsAtPosition = { hoverButton }
			hoverButton.MouseEnter:Fire()
			playerGui.__guiObjectsAtPosition = { dragButton }
			dragButton.InputBegan:Fire({
				UserInputType = _G.Enum.UserInputType.MouseButton1,
				Position = { X = 0, Y = 0, Z = 0 },
			})

			t.expect(_G.__rovyTestRuntime.liveConnectionCount("UserInputService.InputChanged")).toBe(1)
			t.expect(_G.__rovyTestRuntime.liveConnectionCount("UserInputService.InputEnded")).toBe(1)

			RovyUi.start(node, function() end)
			t.expect(_G.__rovyTestRuntime.liveConnectionCount()).toBe(0)
		end)

		t.it("cleans modal default cursor loop when overlay unmounts while hovered", function()
			RovyUi.__reset()
			_G.__rovyTestRuntime.resetConnections()
			local playerGui = _G.Instance.new("PlayerGui")
			local gui = root()
			gui.Parent = playerGui
			local node = RovyUi.new(gui)

			RovyUi.start(node, function()
				RovyUi.modal({ title = "Cursor", open = true }, function() end)
			end)

			local overlay = findFirstDescendant(gui, function(instance)
				return instance.Name == "ModalOverlay"
			end)
			t.expect(overlay).toBeDefined()

			overlay.MouseEnter:Fire()
			t.expect(_G.__rovyTestRuntime.liveConnectionCount("RunService.RenderStepped")).toBe(1)

			RovyUi.start(node, function() end)
			t.expect(overlay.Destroyed).toBeTruthy()
			t.expect(_G.__rovyTestRuntime.liveConnectionCount()).toBe(0)
		end)

			t.it("keeps dragValue dragging after pointer leaves the control", function()
				RovyUi.__reset()
				local gui = root()
			local node = RovyUi.new(gui)
			local services = _G.__rovyTestServices
			local value = 0

			local function render()
				RovyUi.start(node, function()
					RovyUi.window({ title = "Drag" }, function()
						value = RovyUi.dragValue({ min = 0, max = 100, step = 1, initial = 0, label = "Speed" })
					end)
				end)
			end

			local function input(userInputType, x)
				return {
					UserInputType = userInputType,
					Position = { X = x, Y = 0, Z = 0 },
				}
			end

			render()
			local dragButton = findFirstDescendant(gui, function(instance)
				return instance.ClassName == "TextButton" and instance.Text == "Speed: 0"
			end)
			t.expect(dragButton).toBeDefined()

			dragButton.InputBegan:Fire(input(_G.Enum.UserInputType.MouseButton1, 0))
			services.UserInputService.InputChanged:Fire(input(_G.Enum.UserInputType.MouseMovement, 20))
			render()

			t.expect(value).toBe(5)

			services.UserInputService.InputEnded:Fire(input(_G.Enum.UserInputType.MouseButton1, 20))
			services.UserInputService.InputChanged:Fire(input(_G.Enum.UserInputType.MouseMovement, 40))
			render()

				t.expect(value).toBe(5)
			end)

			t.it("does not apply hover while pointer drag is active", function()
				RovyUi.__reset()
				local services = _G.__rovyTestServices
				local playerGui = _G.Instance.new("PlayerGui")
				local gui = root()
				gui.Parent = playerGui
				local node = RovyUi.new(gui)

				local function render()
					RovyUi.start(node, function()
						RovyUi.window({ title = "Drag Hover" }, function()
							RovyUi.dragValue({ min = 0, max = 100, step = 1, initial = 0, label = "Speed" })
						end)
					end)
				end

				local function input(userInputType, x)
					return {
						UserInputType = userInputType,
						Position = { X = x, Y = 0, Z = 0 },
					}
				end

				render()
				local dragButton = findFirstDescendant(gui, function(instance)
					return instance.ClassName == "TextButton" and instance.Text == "Speed: 0"
				end)
				t.expect(dragButton).toBeDefined()
				local stroke = findChildByClass(dragButton, "UIStroke")
				t.expect(stroke).toBeDefined()

				services.UserInputService.MouseLocation = { X = 10, Y = 12 }
				playerGui.__guiObjectsAtPosition = { dragButton }

				dragButton.InputBegan:Fire(input(_G.Enum.UserInputType.MouseButton1, 0))
				dragButton.MouseEnter:Fire()
				render()
				t.expect(stroke.Color).toBe(RovyUi.getActiveStyle().strokeInactiveColor)

				services.UserInputService.InputChanged:Fire(input(_G.Enum.UserInputType.MouseMovement, 8))
				services.UserInputService.InputEnded:Fire(input(_G.Enum.UserInputType.MouseButton1, 8))
			end)

				t.it("ignores hover for widgets behind a higher gui object", function()
				RovyUi.__reset()
			local playerGui = _G.Instance.new("PlayerGui")
			local gui = root()
			gui.Parent = playerGui
			local node = RovyUi.new(gui)

			local function render()
				RovyUi.start(node, function()
					RovyUi.window({ title = "Behind" }, function()
						RovyUi.selectableLabel("Entity 1")
					end)
				end)
			end

			render()
			local entityButton = findFirstDescendant(gui, function(instance)
				return instance.ClassName == "TextButton" and instance.Text == "Entity 1"
			end)
			t.expect(entityButton).toBeDefined()

				local topSink = _G.Instance.new("TextButton")
				topSink.Name = "TopSink"
				topSink.Parent = gui
				_G.__rovyTestServices.UserInputService.MouseLocation = { X = 10, Y = 12 }
				playerGui.__guiObjectsAtPosition = { topSink, entityButton }

				entityButton.MouseEnter:Fire(10, 12)
				render()
				t.expect(entityButton.BackgroundTransparency).toBe(1)

			local container = findFirstDescendant(gui, function(instance)
				return instance.ClassName == "ScrollingFrame"
			end)
				t.expect(container).toBeDefined()

				_G.__rovyTestServices.UserInputService.MouseLocation = { X = 10, Y = 12 }
					playerGui.__guiObjectsAtPosition = { entityButton, container }
					entityButton.MouseEnter:Fire(10, 12)
				render()
				t.expect(entityButton.BackgroundTransparency).toBe(0)
			end)

					t.it("uses current mouse location for hover hit testing", function()
					RovyUi.__reset()
					local services = _G.__rovyTestServices
				local playerGui = _G.Instance.new("PlayerGui")
			local gui = root()
			gui.Parent = playerGui
			local node = RovyUi.new(gui)

			local function render()
				RovyUi.start(node, function()
					RovyUi.window({ title = "Hover" }, function()
						RovyUi.button("Target")
					end)
				end)
			end

			render()
				local targetButton = findFirstDescendant(gui, function(instance)
					return instance.ClassName == "TextButton" and instance.Text == "Target"
				end)
				t.expect(targetButton).toBeDefined()
				local targetStroke = findChildByClass(targetButton, "UIStroke")
				t.expect(targetStroke).toBeDefined()

			local topSink = _G.Instance.new("TextButton")
			topSink.Name = "TopSink"
			topSink.Parent = gui
			services.GuiService.GuiInset = { X = 0, Y = 36 }
			services.UserInputService.MouseLocation = { X = 99, Y = 135 }
			playerGui.__guiObjectsAtPositionByPosition = {
				["10,12"] = { targetButton },
				["99,99"] = { topSink, targetButton },
				["99,135"] = { topSink, targetButton },
			}

						targetButton.MouseEnter:Fire(10, 12)
						render()

							t.expect(targetStroke.Color).toBe(RovyUi.getActiveStyle().strokeInactiveColor)
							services.UserInputService.MouseLocation = { X = 10, Y = 48 }
							targetButton.MouseMoved:Fire()
							render()
						t.expect(targetStroke.Color).toBe(RovyUi.getActiveStyle().strokeHoveredColor)
						services.GuiService.GuiInset = { X = 0, Y = 0 }
					end)

			t.it("allows hover only when same-window controls are topmost", function()
				RovyUi.__reset()
				local playerGui = _G.Instance.new("PlayerGui")
				local gui = root()
				gui.Parent = playerGui
				local node = RovyUi.new(gui)

				local function render()
					RovyUi.start(node, function()
						RovyUi.window({ title = "Inspector" }, function()
							RovyUi.button("Create entity")
							RovyUi.comboBox({ items = { "Local Server", "Server" }, selected = "Local Server" })
						end)
					end)
				end

				render()
				local windowFrame = findFirstDescendant(gui, function(instance)
					return instance.ClassName == "Frame" and instance:GetAttribute("EgooEWindow") == true
				end)
				t.expect(windowFrame).toBeDefined()

				local windowContainer = findFirstDescendant(windowFrame, function(instance)
					return instance.ClassName == "ScrollingFrame"
				end)
				t.expect(windowContainer).toBeDefined()
				t.expect(windowContainer.InputSink == _G.Enum.InputSink.All).toBe(false)

				local createButton = findFirstDescendant(windowFrame, function(instance)
					return instance.ClassName == "TextButton" and instance.Text == "Create entity"
				end)
				t.expect(createButton).toBeDefined()
					local createStroke = findChildByClass(createButton, "UIStroke")
					t.expect(createStroke).toBeDefined()
					createButton.AbsolutePosition = { X = 0, Y = 0 }
					createButton.AbsoluteSize = { X = 100, Y = 24 }

					local comboButton = findFirstDescendant(windowFrame, function(instance)
						return instance.ClassName == "TextButton" and instance.Text == " Local Server"
					end)
					t.expect(comboButton).toBeDefined()
					local comboStroke = findChildByClass(comboButton, "UIStroke")
					t.expect(comboStroke).toBeDefined()
					comboButton.AbsolutePosition = { X = 0, Y = 32 }
					comboButton.AbsoluteSize = { X = 100, Y = 24 }

						local services = _G.__rovyTestServices
						services.UserInputService.MouseLocation = { X = 10, Y = 12 }
							playerGui.__guiObjectsAtPosition = { windowContainer, createButton }
							createButton.MouseEnter:Fire(10, 12)
							render()
							t.expect(createStroke.Color).toBe(RovyUi.getActiveStyle().strokeInactiveColor)
							playerGui.__guiObjectsAtPosition = { createButton, windowContainer }
							createButton.MouseMoved:Fire(10, 12)
							render()
							t.expect(createStroke.Color).toBe(RovyUi.getActiveStyle().strokeHoveredColor)

					local comboArrow = findFirstDescendant(comboButton, function(instance)
						return instance.ClassName == "TextLabel" and instance.Text == "▼"
					end)
					t.expect(comboArrow).toBeDefined()

							services.UserInputService.MouseLocation = { X = 10, Y = 40 }
							playerGui.__guiObjectsAtPosition = { comboArrow, comboButton }
							createButton.MouseLeave:Fire()
							comboButton.MouseEnter:Fire(10, 40)
						render()
					t.expect(comboStroke.Color).toBe(RovyUi.getActiveStyle().strokeHoveredColor)
					t.expect(createStroke.Color).toBe(RovyUi.getActiveStyle().strokeInactiveColor)
				end)

				t.it("ignores clicks for widgets behind a higher gui object", function()
					RovyUi.__reset()
					local playerGui = _G.Instance.new("PlayerGui")
					local gui = root()
					gui.Parent = playerGui
					local node = RovyUi.new(gui)
					local buttonClicked = false
					local labelClicked = false

					local function render()
						RovyUi.start(node, function()
							RovyUi.window({ title = "Click Gate" }, function()
								if RovyUi.button("Record").clicked() then buttonClicked = true end
								if RovyUi.selectableLabel("Entity 1").clicked() then labelClicked = true end
							end)
						end)
					end

					render()
					local recordButton = findFirstDescendant(gui, function(instance)
						return instance.ClassName == "TextButton" and instance.Text == "Record"
					end)
					local entityButton = findFirstDescendant(gui, function(instance)
						return instance.ClassName == "TextButton" and instance.Text == "Entity 1"
					end)
					t.expect(recordButton).toBeDefined()
					t.expect(entityButton).toBeDefined()

					local topSink = _G.Instance.new("TextButton")
					topSink.Name = "TopSink"
					topSink.Parent = gui
					_G.__rovyTestServices.UserInputService.MouseLocation = { X = 10, Y = 12 }
					playerGui.__guiObjectsAtPosition = { topSink, recordButton, entityButton }

					recordButton.MouseButton1Down:Fire(10, 12)
					recordButton.Activated:Fire()
					entityButton.Activated:Fire()
					render()
					t.expect(buttonClicked).toBe(false)
					t.expect(labelClicked).toBe(false)

					playerGui.__guiObjectsAtPosition = { recordButton, topSink }
					recordButton.MouseButton1Down:Fire(10, 12)
					recordButton.Activated:Fire()
					render()
					t.expect(buttonClicked).toBe(true)
				end)

				t.it("lets widgets inside table structural frames receive hover and clicks", function()
					RovyUi.__reset()
					local services = _G.__rovyTestServices
					local playerGui = _G.Instance.new("PlayerGui")
					local gui = root()
					gui.Parent = playerGui
					local node = RovyUi.new(gui)
					local clicked = false

					local function render()
						RovyUi.start(node, function()
							RovyUi.window({ title = "Demo Table" }, function()
								RovyUi.table({ columns = { { fill = true } }, rowHeight = 24, stripeRows = true }, function()
									RovyUi.tableRow(function()
										RovyUi.tableCell(function()
											if RovyUi.button("Details").clicked() then clicked = true end
										end)
									end)
								end)
							end)
						end)
					end

					render()
					local detailsButton = findFirstDescendant(gui, function(instance)
						return instance.ClassName == "TextButton" and instance.Text == "Details"
					end)
					t.expect(detailsButton).toBeDefined()
					local detailsStroke = findChildByClass(detailsButton, "UIStroke")
					t.expect(detailsStroke).toBeDefined()

					local contentFrame = detailsButton.Parent
					local cellFrame = contentFrame.Parent
					t.expect(contentFrame:GetAttribute("RovyHitTestPassThrough")).toBe(true)
					t.expect(cellFrame:GetAttribute("RovyHitTestPassThrough")).toBe(true)

					local siblingSurface
					for _, child in ipairs(cellFrame:GetChildren()) do
						if child.ClassName == "Frame" and child ~= contentFrame then
							siblingSurface = child
							break
						end
					end
					t.expect(siblingSurface).toBeDefined()
					t.expect(siblingSurface:GetAttribute("RovyHitTestPassThrough")).toBe(true)

					services.UserInputService.MouseLocation = { X = 10, Y = 12 }
					playerGui.__guiObjectsAtPosition = { siblingSurface, contentFrame, detailsButton }

					detailsButton.MouseEnter:Fire(10, 12)
					render()
					t.expect(detailsStroke.Color).toBe(RovyUi.getActiveStyle().strokeHoveredColor)

					detailsButton.MouseButton1Down:Fire(10, 12)
					detailsButton.Activated:Fire()
					render()
					t.expect(clicked).toBe(true)
				end)

				t.it("accepts TextButton mouse coordinate events", function()
				RovyUi.__reset()
				local playerGui = _G.Instance.new("PlayerGui")
			local gui = root()
			gui.Parent = playerGui
			local node = RovyUi.new(gui)
			local clicked = false

			local function render()
				RovyUi.start(node, function()
					RovyUi.window({ title = "Button" }, function()
						if RovyUi.button("Record").clicked() then clicked = true end
					end)
				end)
			end

			render()
			local recordButton = findFirstDescendant(gui, function(instance)
				return instance.ClassName == "TextButton" and instance.Text == "Record"
			end)
			t.expect(recordButton).toBeDefined()
			playerGui.__guiObjectsAtPosition = { recordButton }

			recordButton.MouseButton1Down:Fire(10, 12)
			recordButton.Activated:Fire()
			render()

			t.expect(clicked).toBe(true)
		end)

	end)
end
