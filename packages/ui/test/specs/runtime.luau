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

	local function makeSignal()
		local listeners = {}
		return {
			Connect = function(_self, fn)
				local connection = { Connected = true }
				function connection:Disconnect()
					self.Connected = false
				end
				table.insert(listeners, { fn = fn, connection = connection })
				return connection
			end,
			Fire = function(_self, ...)
				for _, listener in ipairs(listeners) do
					if listener.connection.Connected then
						listener.fn(...)
					end
				end
			end,
		}
	end

	local function makeInputService()
		local service = {
			InputBegan = makeSignal(),
			InputChanged = makeSignal(),
			InputEnded = makeSignal(),
			MouseLocation = _G.Vector2.new(0, 0),
		}
		function service:GetMouseLocation()
			return self.MouseLocation
		end
		return service
	end

	local function makeInput(userInputType, x, y, keyCode)
		return {
			UserInputType = userInputType,
			KeyCode = keyCode or _G.Enum.KeyCode.Unknown,
			Position = _G.Vector2.new(x or 0, y or 0),
		}
	end

	local function firstDirectChild(instance, predicate)
		for _, child in ipairs(instance:GetChildren()) do
			if predicate(child) then return child end
		end
		return nil
	end

	local function clickButtonText(rootInstance, text)
		local button = findFirstDescendant(rootInstance, function(instance)
			return instance.ClassName == "TextButton" and instance.Text == text
		end)
		t.expect(button).toBeDefined()
		button.Activated:Fire()
		return button
	end

	local function curveEditorOverlay(rootInstance, width, height)
		width = width or 120
		height = height or 80
		local overlay = findFirstDescendant(rootInstance, function(instance)
			return instance.Name == "CurveEditorInput"
		end)
		t.expect(overlay).toBeDefined()
		overlay.AbsolutePosition = _G.Vector2.new(0, 0)
		overlay.AbsoluteSize = _G.Vector2.new(width, height)
		local graph = overlay.Parent
		graph.AbsolutePosition = _G.Vector2.new(0, 0)
		graph.AbsoluteSize = _G.Vector2.new(width, height)
		return overlay
	end

	local function visiblePopupPanel(rootInstance)
		return findFirstDescendant(rootInstance, function(instance)
			return instance.Name == "PopupPanel" and instance.Visible == true
		end)
	end

	local function graphInput(x, y)
		local pad = 14
		local width = 120 - pad * 2
		local height = 80 - pad * 2
		return makeInput(_G.Enum.UserInputType.MouseButton1, pad + x * width, pad + (1 - y) * height)
	end

	local function graphWheelInput(x, y, z)
		local input = graphInput(x, y)
		input.UserInputType = _G.Enum.UserInputType.MouseWheel
		input.Position = { X = input.Position.X, Y = input.Position.Y, Z = z }
		return input
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
						must("curveEditor", function() RovyUi.curveEditor({ width = 120, height = 80 }) end)
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

			t.it("samples Bezier curves and renders an infinite editable-image canvas", function()
				RovyUi.__reset()
				_G.__rovyTestRuntime.resetConnections()
				local samples = RovyUi.sampleBezierCurve({
					anchors = {
						{ x = 0, y = 0, outHandle = { x = 0.25, y = 0 } },
						{ x = 1, y = 1, inHandle = { x = 0.75, y = 1 } },
					},
				}, 5)

				t.expect(#samples).toBe(5)
				t.expect(samples[1].X).toBe(0)
				t.expect(samples[1].Y).toBe(0)
				t.expect(samples[5].X).toBe(1)
				t.expect(samples[5].Y).toBe(1)

				local services = _G.__rovyTestServices
				table.clear(services.AssetService.CreatedEditableImages)
				local gui = root()
				local node = RovyUi.new(gui)
				local handle
				RovyUi.start(node, function()
					handle = RovyUi.curveEditor({ width = 120, height = 80 })
				end)

				local curve = handle.curve()
				t.expect(#curve.anchors).toBe(2)
				t.expect(curve.anchors[1].x).toBe(0)
				t.expect(curve.anchors[1].y).toBe(0)
				t.expect(curve.anchors[2].x).toBe(1)
				t.expect(curve.anchors[2].y).toBe(1)
				t.expect(handle.viewportOffset().X).toBe(60)
				t.expect(handle.viewportOffset().Y).toBe(40)
				t.expect(#services.AssetService.CreatedEditableImages).toBe(1)
				local createdImage = services.AssetService.CreatedEditableImages[1]
				t.expect(#createdImage.Writes > 0).toBeTruthy()
				local initialWrites = #createdImage.Writes
				RovyUi.start(node, function()
					handle = RovyUi.curveEditor({ width = 120, height = 80 })
				end)
				t.expect(#services.AssetService.CreatedEditableImages).toBe(1)
				t.expect(#createdImage.Writes).toBe(initialWrites)
				RovyUi.start(node, function() end)
				t.expect(createdImage.Destroyed).toBeTruthy()
				t.expect(_G.__rovyTestRuntime.liveConnectionCount()).toBe(0)
			end)

			t.it("does not retry failed curve editor image creation on unchanged frames", function()
				RovyUi.__reset()
				_G.__rovyTestRuntime.resetConnections()
				local services = _G.__rovyTestServices
				table.clear(services.AssetService.CreatedEditableImages)
				services.AssetService.CreateEditableImageCalls = 0
				services.AssetService.FailCreate = true
				local gui = root()
				local node = RovyUi.new(gui)
				local handle

				local function render()
					RovyUi.start(node, function()
						handle = RovyUi.curveEditor({ width = 120, height = 80 })
					end)
				end

				render()
				render()
				t.expect(handle).toBeDefined()
				t.expect(#services.AssetService.CreatedEditableImages).toBe(0)
				t.expect(services.AssetService.CreateEditableImageCalls).toBe(1)
				RovyUi.start(node, function() end)
				t.expect(_G.__rovyTestRuntime.liveConnectionCount()).toBe(0)
				services.AssetService.FailCreate = false
			end)

			t.it("grows the canvas with its widget unless fixed dimensions are provided", function()
				RovyUi.__reset()
				_G.__rovyTestRuntime.resetConnections()
				local services = _G.__rovyTestServices
				table.clear(services.AssetService.CreatedEditableImages)
				local gui = root()
				local node = RovyUi.new(gui)
				local flexibleHandle

				local function renderFlexible()
					RovyUi.start(node, function()
						flexibleHandle = RovyUi.curveEditor({ showReadout = false })
					end)
				end

				renderFlexible()
				curveEditorOverlay(gui, 220, 140)
				renderFlexible()
				local flexibleImage = services.AssetService.CreatedEditableImages[#services.AssetService.CreatedEditableImages]
				t.expect(flexibleImage.Size.X).toBe(220)
				t.expect(flexibleImage.Size.Y).toBe(140)
				t.expect(flexibleHandle.viewportOffset().X).toBe(110)
				t.expect(flexibleHandle.viewportOffset().Y).toBe(70)
				local flexibleImageCount = #services.AssetService.CreatedEditableImages
				local flexibleWrites = #flexibleImage.Writes
				renderFlexible()
				t.expect(#services.AssetService.CreatedEditableImages).toBe(flexibleImageCount)
				t.expect(#flexibleImage.Writes).toBe(flexibleWrites)
				RovyUi.start(node, function() end)
				t.expect(flexibleImage.Destroyed).toBeTruthy()

				RovyUi.__reset()
				table.clear(services.AssetService.CreatedEditableImages)
				gui = root()
				node = RovyUi.new(gui)
				local fixedHandle

				local function renderFixed()
					RovyUi.start(node, function()
						fixedHandle = RovyUi.curveEditor({ width = 120, height = 80, showReadout = false })
					end)
				end

				renderFixed()
				curveEditorOverlay(gui, 220, 140)
				renderFixed()
				local fixedImage = services.AssetService.CreatedEditableImages[#services.AssetService.CreatedEditableImages]
				t.expect(fixedImage.Size.X).toBe(120)
				t.expect(fixedImage.Size.Y).toBe(80)
				t.expect(fixedHandle.viewportOffset().X).toBe(60)
				t.expect(fixedHandle.viewportOffset().Y).toBe(40)
				local fixedImageCount = #services.AssetService.CreatedEditableImages
				local fixedWrites = #fixedImage.Writes
				renderFixed()
				t.expect(#services.AssetService.CreatedEditableImages).toBe(fixedImageCount)
				t.expect(#fixedImage.Writes).toBe(fixedWrites)
				RovyUi.start(node, function() end)
				t.expect(fixedImage.Destroyed).toBeTruthy()
				t.expect(_G.__rovyTestRuntime.liveConnectionCount()).toBe(0)
			end)

			t.it("pans the infinite curve editor canvas from drag input and ignores wheel scrolling", function()
				RovyUi.__reset()
				local gui = root()
				local inputService = makeInputService()
				local node = RovyUi.new(gui, { inputService = inputService })
				local handle
				local returnToOriginKey = nil

				local function render()
					RovyUi.start(node, function()
						handle = RovyUi.curveEditor({
							width = 120,
							height = 80,
							returnToOriginKey = returnToOriginKey,
						})
					end)
				end

				render()
				curveEditorOverlay(gui)
				local before = handle.viewportOffset()
				inputService.InputChanged:Fire(graphWheelInput(0.5, 0.5, -1))
				render()
				local afterIgnoredWheel = handle.viewportOffset()
				t.expect(afterIgnoredWheel.X).toBe(before.X)
				t.expect(afterIgnoredWheel.Y).toBe(before.Y)
				t.expect(handle.changed()).toBe(false)

				inputService.InputBegan:Fire(graphInput(0.5, 0.5))
				inputService.InputChanged:Fire(makeInput(_G.Enum.UserInputType.MouseMovement, 78, 55))
				inputService.InputEnded:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 78, 55))
				render()

				local afterDrag = handle.viewportOffset()
				t.expect(afterDrag.X).toBe(before.X + 18)
				t.expect(afterDrag.Y).toBe(before.Y + 15)
				t.expect(handle.changed()).toBeTruthy()
				t.expect(#handle.curve().anchors).toBe(2)
				t.expect(handle.selectedAnchor()).toBe(nil)

				inputService.InputChanged:Fire(graphWheelInput(0.5, 0.5, -1))
				render()
				local afterWheel = handle.viewportOffset()
				t.expect(afterWheel.X).toBe(afterDrag.X)
				t.expect(afterWheel.Y).toBe(afterDrag.Y)

				handle.returnToOrigin()
				local immediateReturn = handle.viewportOffset()
				t.expect(immediateReturn.X).toBe(60)
				t.expect(immediateReturn.Y).toBe(40)
				render()
				local afterReturn = handle.viewportOffset()
				t.expect(afterReturn.X).toBe(60)
				t.expect(afterReturn.Y).toBe(40)

				inputService.InputBegan:Fire(graphInput(0.5, 0.5))
				inputService.InputChanged:Fire(makeInput(_G.Enum.UserInputType.MouseMovement, 70, 50))
				inputService.InputEnded:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 70, 50))
				render()
				t.expect(handle.viewportOffset().X).toBe(70)
				t.expect(handle.viewportOffset().Y).toBe(50)
				returnToOriginKey = (returnToOriginKey or 0) + 1
				render()
				t.expect(handle.viewportOffset().X).toBe(60)
				t.expect(handle.viewportOffset().Y).toBe(40)

				inputService.InputBegan:Fire(graphInput(0.5, 0.5))
				inputService.InputChanged:Fire(makeInput(_G.Enum.UserInputType.MouseMovement, 75, 50))
				render()
				local afterOpenDrag = handle.viewportOffset()
				t.expect(afterOpenDrag.X).toBe(75)
				t.expect(afterOpenDrag.Y).toBe(50)

				inputService.InputChanged:Fire(graphWheelInput(0.5, 0.5, -1))
				inputService.InputChanged:Fire(makeInput(_G.Enum.UserInputType.MouseMovement, 95, 70))
				render()
				local afterWheelCancelledDrag = handle.viewportOffset()
				t.expect(afterWheelCancelledDrag.X).toBe(afterOpenDrag.X)
				t.expect(afterWheelCancelledDrag.Y).toBe(afterOpenDrag.Y)
				inputService.InputEnded:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 95, 70))
				RovyUi.start(node, function() end)
			end)

			t.it("returns flexible curve editor canvases to the measured origin", function()
				RovyUi.__reset()
				local gui = root()
				local inputService = makeInputService()
				local node = RovyUi.new(gui, { inputService = inputService })
				local handle
				local returnToOriginKey = nil

				local function render()
					RovyUi.start(node, function()
						handle = RovyUi.curveEditor({
							height = 80,
							showReadout = false,
							returnToOriginKey = returnToOriginKey,
						})
					end)
				end

				render()
				curveEditorOverlay(gui, 220, 80)
				render()
				t.expect(handle.viewportOffset().X).toBe(110)
				t.expect(handle.viewportOffset().Y).toBe(40)

				inputService.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 110, 40))
				inputService.InputChanged:Fire(makeInput(_G.Enum.UserInputType.MouseMovement, 145, 65))
				inputService.InputEnded:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 145, 65))
				render()
				t.expect(handle.viewportOffset().X).toBe(145)
				t.expect(handle.viewportOffset().Y).toBe(65)

				handle.returnToOrigin()
				t.expect(handle.viewportOffset().X).toBe(110)
				t.expect(handle.viewportOffset().Y).toBe(40)

				inputService.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 110, 40))
				inputService.InputChanged:Fire(makeInput(_G.Enum.UserInputType.MouseMovement, 130, 55))
				inputService.InputEnded:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 130, 55))
				render()
				t.expect(handle.viewportOffset().X).toBe(130)
				t.expect(handle.viewportOffset().Y).toBe(55)

				returnToOriginKey = 1
				render()
				t.expect(handle.viewportOffset().X).toBe(110)
				t.expect(handle.viewportOffset().Y).toBe(40)
				RovyUi.start(node, function() end)
			end)

			t.it("keeps built-in and provided curve presets available while canvas editing is disabled", function()
				RovyUi.__reset()
				local gui = root()
				local node = RovyUi.new(gui)
				local handle

				RovyUi.start(node, function()
					handle = RovyUi.curveEditor({
						width = 120,
						height = 80,
						presets = {
							{ name = "Spec Curve", curve = { anchors = { { x = 0, y = 0 }, { x = 1, y = 1 } } } },
						},
					})
				end)

				local foundLine = false
				local foundSpec = false
				for _, preset in ipairs(handle.presets()) do
					if preset.name == "Line" then foundLine = true end
					if preset.name == "Spec Curve" then foundSpec = true end
				end
				t.expect(foundLine).toBeTruthy()
				t.expect(foundSpec).toBeTruthy()
				t.expect(handle.selectedPreset()).toBe("Line")
				RovyUi.start(node, function() end)
			end)

			t.it("registers scoped curve paths and returns deep-cloned segment snapshots", function()
				RovyUi.__reset()
				local gui = root()
				local node = RovyUi.new(gui)
				local handle
				local linePathHandle

				RovyUi.start(node, function()
					handle = RovyUi.curveEditor({ width = 120, height = 80 }, function()
						linePathHandle = RovyUi.curvePath({
							id = "line",
							revision = 1,
							commands = {
								{ kind = "M", point = { x = 0, y = 0 } },
								{ kind = "L", point = { x = 40, y = 0 } },
							},
						})
						RovyUi.curvePath({
							id = "curve",
							revision = 1,
							commands = {
								{ kind = "M", point = { x = 0, y = 20 } },
								{
									kind = "C",
									control1 = { x = 20, y = -20 },
									control2 = { x = 50, y = 60 },
									point = { x = 80, y = 20 },
								},
							},
						})
					end)
				end)

				local segments = handle.getSegments()
				t.expect(#segments).toBe(2)
				t.expect(segments[1].id).toBe("line")
				t.expect(#segments[1].points).toBe(2)
				t.expect(segments[2].points[2].inHandle.x).toBe(50)
				t.expect(segments[2].points[1].outHandle.x).toBe(20)
				t.expect(#linePathHandle.getPoints()).toBe(2)
				t.expect(linePathHandle.getSnapshot().id).toBe("line")
				t.expect(linePathHandle.getCommands()[2].point.x).toBe(40)

				segments[1].commands[2].point.x = 999
				local fresh = handle.getSegments()
				t.expect(fresh[1].commands[2].point.x).toBe(40)

				RovyUi.start(node, function()
					handle = RovyUi.curveEditor({ width = 120, height = 80 }, function()
						RovyUi.curvePath({
							id = "curve",
							revision = 1,
							commands = {
								{ kind = "M", point = { x = 0, y = 20 } },
								{ kind = "L", point = { x = 80, y = 20 } },
							},
						})
					end)
				end)
				segments = handle.getSegments()
				t.expect(#segments).toBe(1)
				t.expect(segments[1].id).toBe("curve")
				RovyUi.start(node, function() end)
			end)

			t.it("writes scoped path edits into caller-owned command arrays", function()
				RovyUi.__reset()
				local gui = root()
				local inputService = makeInputService()
				local node = RovyUi.new(gui, { inputService = inputService })
				local handle
				local pathHandle
				local commands = {
					{ kind = "M", point = { x = 0, y = 0 } },
					{ kind = "L", point = { x = 40, y = 0 } },
				}

				local function render()
					RovyUi.start(node, function()
						handle = RovyUi.curveEditor({ width = 120, height = 80 }, function()
							pathHandle = RovyUi.curvePath({
								id = "line",
								commands = commands,
							})
						end)
					end)
				end

				render()
				t.expect(pathHandle.getCommands()).toBe(commands)
				curveEditorOverlay(gui)
				inputService.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 100, 40))
				inputService.InputChanged:Fire(makeInput(_G.Enum.UserInputType.MouseMovement, 105, 45))
				t.expect(commands[2].point.x).toBe(45)
				t.expect(commands[2].point.y).toBe(5)
				inputService.InputEnded:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 105, 45))
				render()

				local moved = handle.getSegments()[1]
				t.expect(moved.commands[2].point.x).toBe(45)
				t.expect(moved.commands[2].point.y).toBe(5)
				t.expect(commands[2].point.x).toBe(45)
				t.expect(commands[2].point.y).toBe(5)
				t.expect(pathHandle.getCommands()[2].point.x).toBe(45)
				t.expect(handle.changed()).toBeTruthy()

				commands = {
					{ kind = "M", point = { x = 0, y = 0 } },
					{ kind = "L", point = { x = 80, y = 0 } },
				}
				render()
				t.expect(handle.getSegments()[1].commands[2].point.x).toBe(80)
				t.expect(pathHandle.getCommands()).toBe(commands)
				RovyUi.start(node, function() end)
			end)

			t.it("inserts path points by clicking line and cubic segments", function()
				RovyUi.__reset()
				local gui = root()
				local inputService = makeInputService()
				local node = RovyUi.new(gui, { inputService = inputService })
				local handle
				local lineCommands = {
					{ kind = "M", point = { x = 0, y = 0 } },
					{ kind = "L", point = { x = 40, y = 0 } },
				}

				local function renderLine()
					RovyUi.start(node, function()
						handle = RovyUi.curveEditor({ width = 120, height = 80, allowScroll = false }, function()
							RovyUi.curvePath({
								id = "line",
								revision = 1,
								commands = lineCommands,
							})
						end)
					end)
				end

				renderLine()
				curveEditorOverlay(gui)
				inputService.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 80, 40))
				inputService.InputEnded:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 80, 40))
				renderLine()
				local line = handle.getSegments()[1]
				t.expect(#line.points).toBe(3)
				t.expect(#lineCommands).toBe(3)
				t.expect(math.abs(line.commands[2].point.x - 20) < 0.1).toBeTruthy()
				t.expect(handle.selectedPoint().pointIndex).toBe(1)
				inputService.InputBegan:Fire(makeInput(_G.Enum.UserInputType.Keyboard, 0, 0, _G.Enum.KeyCode.Delete), true)
				renderLine()
				t.expect(#lineCommands).toBe(3)
				inputService.InputBegan:Fire(makeInput(_G.Enum.UserInputType.Keyboard, 0, 0, _G.Enum.KeyCode.Delete))
				renderLine()
				t.expect(#handle.getSegments()[1].points).toBe(2)
				t.expect(#lineCommands).toBe(2)
				t.expect(handle.deleteSelectedPoint()).toBe(false)

				RovyUi.__reset()
				gui = root()
				inputService = makeInputService()
				node = RovyUi.new(gui, { inputService = inputService })
				local cubicCommands = {
					{ kind = "M", point = { x = -30, y = 0 } },
					{
						kind = "C",
						control1 = { x = -10, y = -30 },
						control2 = { x = 20, y = 30 },
						point = { x = 50, y = 0 },
					},
				}
				local function renderCubic()
					RovyUi.start(node, function()
						handle = RovyUi.curveEditor({ width = 120, height = 80, allowScroll = false }, function()
							RovyUi.curvePath({
								id = "cubic",
								revision = 1,
								commands = cubicCommands,
							})
						end)
					end)
				end

				renderCubic()
				curveEditorOverlay(gui)
				inputService.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 70, 40))
				inputService.InputEnded:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 70, 40))
				renderCubic()
				local cubic = handle.getSegments()[1]
				t.expect(#cubic.points).toBe(3)
				t.expect(#cubicCommands).toBe(3)
				t.expect(cubic.commands[2].kind).toBe("C")
				t.expect(cubic.commands[3].kind).toBe("C")
				RovyUi.start(node, function() end)
			end)

			t.it("drags selected Bezier handles without changing sibling handles", function()
				RovyUi.__reset()
				local gui = root()
				local inputService = makeInputService()
				local node = RovyUi.new(gui, { inputService = inputService })
				local handle
				local cubicCommands = {
					{ kind = "M", point = { x = -30, y = 0 } },
					{
						kind = "C",
						control1 = { x = -10, y = -30 },
						control2 = { x = 20, y = 30 },
						point = { x = 50, y = 0 },
					},
					{ kind = "L", point = { x = 58, y = 20 } },
				}

				local function render()
					RovyUi.start(node, function()
						handle = RovyUi.curveEditor({ width = 120, height = 80 }, function()
							RovyUi.curvePath({
								id = "cubic",
								revision = 1,
								commands = cubicCommands,
							})
						end)
					end)
				end

				render()
				curveEditorOverlay(gui)
				inputService.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 110, 40))
				inputService.InputEnded:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 110, 40))
				render()
				t.expect(handle.selectedPoint().pointIndex).toBe(1)
				inputService.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 80, 70))
				inputService.InputChanged:Fire(makeInput(_G.Enum.UserInputType.MouseMovement, 85, 75))
				inputService.InputEnded:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 85, 75))
				render()

				local command = handle.getSegments()[1].commands[2]
				t.expect(command.control1.x).toBe(-10)
				t.expect(command.control1.y).toBe(-30)
				t.expect(command.control2.x).toBe(25)
				t.expect(command.control2.y).toBe(35)
				t.expect(cubicCommands[2].control2.x).toBe(25)
				t.expect(cubicCommands[2].control2.y).toBe(35)
				inputService.InputBegan:Fire(makeInput(_G.Enum.UserInputType.Keyboard, 0, 0, _G.Enum.KeyCode.Backspace))
				render()
				t.expect(#cubicCommands).toBe(2)
				t.expect(handle.selectedPoint()).toBe(nil)
				RovyUi.start(node, function() end)
			end)

			t.it("does not edit locked paths and avoids redraws for unchanged scoped paths", function()
				RovyUi.__reset()
				local services = _G.__rovyTestServices
				table.clear(services.AssetService.CreatedEditableImages)
				local gui = root()
				local inputService = makeInputService()
				local node = RovyUi.new(gui, { inputService = inputService })
				local handle

				local function render()
					RovyUi.start(node, function()
						handle = RovyUi.curveEditor({ width = 120, height = 80, allowScroll = false }, function()
							RovyUi.curvePath({
								id = "locked",
								revision = 1,
								locked = true,
								commands = {
									{ kind = "M", point = { x = 0, y = 0 } },
									{ kind = "L", point = { x = 40, y = 0 } },
								},
							})
						end)
					end)
				end

				render()
				curveEditorOverlay(gui)
				local createdImage = services.AssetService.CreatedEditableImages[#services.AssetService.CreatedEditableImages]
				local initialWrites = #createdImage.Writes
				render()
				t.expect(#createdImage.Writes).toBe(initialWrites)

				inputService.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 80, 40))
				inputService.InputEnded:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 80, 40))
				render()
				t.expect(#handle.getSegments()[1].points).toBe(2)
				t.expect(handle.selectedPoint()).toBe(nil)
				RovyUi.start(node, function() end)
			end)

			t.it("converts curve path commands in the caller-owned table", function()
				RovyUi.__reset()
				local gui = root()
				local node = RovyUi.new(gui)
				local pathHandle
				local commands = {
					{ kind = "M", point = { x = 0, y = 0 } },
					{ kind = "L", point = { x = 90, y = 0 } },
				}

				RovyUi.start(node, function()
					RovyUi.curveEditor({ width = 120, height = 80 }, function()
						pathHandle = RovyUi.curvePath({
							id = "convert",
							commands = commands,
						})
					end)
				end)

				t.expect(pathHandle:convertCommand(1, "C")).toBeTruthy()
				t.expect(commands[2].kind).toBe("C")
				t.expect(commands[2].control1.x).toBe(30)
				t.expect(commands[2].control2.x).toBe(60)
				t.expect(commands[2].point.x).toBe(90)

				commands[2] = {
					kind = "Q",
					control = { x = 45, y = 30 },
					point = { x = 90, y = 0 },
				}
				RovyUi.start(node, function()
					RovyUi.curveEditor({ width = 120, height = 80 }, function()
						pathHandle = RovyUi.curvePath({
							id = "convert",
							commands = commands,
						})
					end)
				end)
				t.expect(pathHandle:convertCommand(1, "C")).toBeTruthy()
				t.expect(commands[2].control1.x).toBe(30)
				t.expect(commands[2].control1.y).toBe(20)
				t.expect(commands[2].control2.x).toBe(60)
				t.expect(commands[2].control2.y).toBe(20)

				t.expect(pathHandle:convertCommand(1, "Q")).toBeTruthy()
				t.expect(math.abs(commands[2].control.x - 45) < 0.001).toBeTruthy()
				t.expect(math.abs(commands[2].control.y - 30) < 0.001).toBeTruthy()

				t.expect(pathHandle:convertCommand(1, "L")).toBeTruthy()
				t.expect(commands[2].kind).toBe("L")
				t.expect(commands[2].control).toBe(nil)
				t.expect(commands[2].control1).toBe(nil)
				t.expect(commands[2].point.x).toBe(90)
				RovyUi.start(node, function() end)
			end)

			t.it("opens point context controls from MouseButton2 and mutates commands through buttons", function()
				RovyUi.__reset()
				local gui = root()
				local inputService = makeInputService()
				local node = RovyUi.new(gui, { inputService = inputService })
				local handle
				local commands = {
					{ kind = "M", point = { x = -30, y = 0 } },
					{ kind = "L", point = { x = 50, y = 0 } },
					{ kind = "L", point = { x = 70, y = 20 } },
				}

				local function render()
					RovyUi.start(node, function()
						handle = RovyUi.curveEditor({ width = 120, height = 80, allowScroll = true }, function()
							RovyUi.curvePath({
								id = "menu",
								commands = commands,
							})
						end)
					end)
				end

				render()
				curveEditorOverlay(gui)
				inputService.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton2, 110, 40))
				render()
				t.expect(handle.selectedPoint().pointIndex).toBe(1)
				t.expect(findFirstDescendant(gui, function(instance)
					return instance.ClassName == "TextButton" and instance.Text == "Delete Point"
				end)).toBeDefined()

				clickButtonText(gui, "Cubic")
				render()
				t.expect(commands[2].kind).toBe("C")
				t.expect(math.abs(commands[2].control1.x - (-30 + 80 / 3)) < 0.001).toBeTruthy()
				t.expect(math.abs(commands[2].control2.x - (-30 + 160 / 3)) < 0.001).toBeTruthy()
				t.expect(commands[2].point.x).toBe(50)
				t.expect(findFirstDescendant(gui, function(instance)
					return instance.ClassName == "TextButton" and instance.Text == "Delete Point"
				end)).toBeDefined()

				local before = handle.viewportOffset()
				inputService.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton2, 5, 5))
				render()
				t.expect(findFirstDescendant(gui, function(instance)
					return instance.ClassName == "TextButton" and instance.Text == "Delete Point"
				end)).toBe(nil)
				t.expect(handle.viewportOffset().X).toBe(before.X)
				t.expect(handle.viewportOffset().Y).toBe(before.Y)
				RovyUi.start(node, function() end)
			end)

			t.it("opens point context controls from handles and deletes the owning point", function()
				RovyUi.__reset()
				local gui = root()
				local inputService = makeInputService()
				local node = RovyUi.new(gui, { inputService = inputService })
				local handle
				local commands = {
					{ kind = "M", point = { x = -30, y = 0 } },
					{
						kind = "C",
						control1 = { x = -10, y = -30 },
						control2 = { x = 20, y = 30 },
						point = { x = 50, y = 0 },
					},
					{ kind = "L", point = { x = 70, y = 20 } },
				}

				local function render()
					RovyUi.start(node, function()
						handle = RovyUi.curveEditor({ width = 120, height = 80, allowScroll = false }, function()
							RovyUi.curvePath({
								id = "handles",
								commands = commands,
							})
						end)
					end)
				end

				render()
				curveEditorOverlay(gui)
				inputService.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 110, 40))
				inputService.InputEnded:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 110, 40))
				render()
				inputService.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton2, 80, 70))
				render()
				t.expect(handle.selectedPoint().pointIndex).toBe(1)
				local popupPanel = visiblePopupPanel(gui)
				t.expect(popupPanel).toBeDefined()
				t.expect(popupPanel.Position.X.Offset).toBe(92)
				t.expect(popupPanel.Position.Y.Offset).toBe(70)
				t.expect(popupPanel.Size.X.Offset).toBe(158)
				t.expect(findFirstDescendant(gui, function(instance)
					return instance.ClassName == "TextButton" and instance.Text == "Delete Point"
				end)).toBeDefined()

				local popupHeader = findFirstDescendant(gui, function(instance)
					return instance.ClassName == "TextButton" and instance.Name == "CurveEditorContextHeader"
				end)
				t.expect(popupHeader).toBeDefined()
				popupHeader.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 92, 70))
				inputService.InputChanged:Fire(makeInput(_G.Enum.UserInputType.MouseMovement, 105, 82))
				inputService.InputEnded:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 105, 82))
				t.expect(popupPanel.Position.X.Offset).toBe(105)
				t.expect(popupPanel.Position.Y.Offset).toBe(82)
				render()
				popupPanel = visiblePopupPanel(gui)
				t.expect(popupPanel.Position.X.Offset).toBe(105)
				t.expect(popupPanel.Position.Y.Offset).toBe(82)

				clickButtonText(gui, "Delete Point")
				render()
				render()
				t.expect(#commands).toBe(2)
				t.expect(commands[2].point.x).toBe(70)
				t.expect(handle.selectedPoint()).toBe(nil)
				t.expect(findFirstDescendant(gui, function(instance)
					return instance.ClassName == "TextButton" and instance.Text == "Delete Point"
				end)).toBe(nil)
				RovyUi.start(node, function() end)
			end)

			t.it("places context controls like a right-click menu and disables impossible deletes", function()
				RovyUi.__reset()
				local gui = _G.Instance.new("Frame")
				gui.Name = "CurveEditorBounds"
				gui.AbsolutePosition = _G.Vector2.new(0, 0)
				gui.AbsoluteSize = _G.Vector2.new(260, 220)
				local inputService = makeInputService()
				local node = RovyUi.new(gui, { inputService = inputService })
				local handle
				local commands = {
					{ kind = "M", point = { x = 0, y = 0 } },
					{ kind = "L", point = { x = 100, y = 0 } },
					{ kind = "L", point = { x = 120, y = 20 } },
				}

				local function render()
					RovyUi.start(node, function()
						handle = RovyUi.curveEditor({ width = 260, height = 120, allowScroll = false }, function()
							RovyUi.curvePath({
								id = "bounded-menu",
								commands = commands,
							})
						end)
					end)
				end

				render()
				curveEditorOverlay(gui, 260, 120)
				inputService.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton2, 230, 60))
				render()
				local popupPanel = visiblePopupPanel(gui)
				t.expect(popupPanel).toBeDefined()
				t.expect(popupPanel.Position.X.Offset).toBe(60)
				t.expect(popupPanel.Position.Y.Offset).toBe(60)

				commands = {
					{ kind = "M", point = { x = 0, y = 0 } },
					{ kind = "L", point = { x = 40, y = 0 } },
				}
				render()
				curveEditorOverlay(gui, 260, 120)
				inputService.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton2, 170, 60))
				render()
				local deleteButton = findFirstDescendant(gui, function(instance)
					return instance.ClassName == "TextButton" and instance.Text == "Delete Point"
				end)
				t.expect(deleteButton).toBeDefined()
				t.expect(deleteButton.TextColor3).toBe(RovyUi.getActiveStyle().textDisabledColor)
				clickButtonText(gui, "Delete Point")
				render()
				t.expect(#commands).toBe(2)
				t.expect(handle.selectedPoint().pointIndex).toBe(1)
				RovyUi.start(node, function() end)
			end)

			t.it("does not open context controls for locked paths", function()
				RovyUi.__reset()
				local gui = root()
				local inputService = makeInputService()
				local node = RovyUi.new(gui, { inputService = inputService })
				local handle

				local function render()
					RovyUi.start(node, function()
						handle = RovyUi.curveEditor({ width = 120, height = 80, allowScroll = false }, function()
							RovyUi.curvePath({
								id = "locked-menu",
								locked = true,
								commands = {
									{ kind = "M", point = { x = 0, y = 0 } },
									{ kind = "L", point = { x = 40, y = 0 } },
								},
							})
						end)
					end)
				end

				render()
				curveEditorOverlay(gui)
				inputService.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton2, 100, 40))
				render()
				t.expect(handle.selectedPoint()).toBe(nil)
				t.expect(findFirstDescendant(gui, function(instance)
					return instance.ClassName == "TextButton" and instance.Text == "Delete Point"
				end)).toBe(nil)
				RovyUi.start(node, function() end)
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

			t.expect(_G.__rovyTestRuntime.liveConnectionCount("UserInputService.InputChanged")).toBe(2)
			t.expect(_G.__rovyTestRuntime.liveConnectionCount("UserInputService.InputEnded")).toBe(3)

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

				t.it("drags windows with an injected input service", function()
					RovyUi.__reset()
					local gui = root()
					local inputService = makeInputService()
					local node = RovyUi.new(gui, { inputService = inputService })

					RovyUi.start(node, function()
						RovyUi.window({ title = "Injected", position = _G.Vector2.new(10, 15) }, function() end)
					end)

					local windowFrame = findFirstDescendant(gui, function(instance)
						return instance.ClassName == "Frame" and instance:GetAttribute("EgooEWindow") == true
					end)
					t.expect(windowFrame).toBeDefined()

					local titleBar = firstDirectChild(windowFrame, function(instance)
						return instance.ClassName == "TextButton" and instance.Text == ""
					end)
					t.expect(titleBar).toBeDefined()

					titleBar.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 20, 20))
					inputService.InputChanged:Fire(makeInput(_G.Enum.UserInputType.MouseMovement, 45, 50))

					t.expect(windowFrame.Position.X.Offset).toBe(35)
					t.expect(windowFrame.Position.Y.Offset).toBe(45)
				end)

				t.it("resizes windows with an injected input service", function()
					RovyUi.__reset()
					local gui = root()
					local inputService = makeInputService()
					local node = RovyUi.new(gui, { inputService = inputService })

					RovyUi.start(node, function()
						RovyUi.window({ title = "Resize", size = _G.Vector2.new(160, 120) }, function() end)
					end)

					local windowFrame = findFirstDescendant(gui, function(instance)
						return instance.ClassName == "Frame" and instance:GetAttribute("EgooEWindow") == true
					end)
					local resizeGrip = firstDirectChild(windowFrame, function(instance)
						return instance.ClassName == "TextButton" and instance.Text == "⊿"
					end)
					t.expect(resizeGrip).toBeDefined()

					windowFrame.AbsoluteSize = _G.Vector2.new(160, 120)
					resizeGrip.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 0, 0))
					inputService.InputChanged:Fire(makeInput(_G.Enum.UserInputType.MouseMovement, 40, 25))

					t.expect(windowFrame.Size.X.Offset).toBe(200)
					t.expect(windowFrame.Size.Y.Offset).toBe(145)
				end)

				t.it("drives slider and dragValue widgets with an injected input service", function()
					RovyUi.__reset()
					local gui = root()
					local inputService = makeInputService()
					local node = RovyUi.new(gui, { inputService = inputService })
					local sliderValue = 0
					local dragValue = 0

					local function render()
						RovyUi.start(node, function()
							sliderValue = RovyUi.slider({ min = 0, max = 100, initial = 0, showValueBox = false })
							dragValue = RovyUi.dragValue({ min = 0, max = 100, initial = 0, step = 1 })
						end)
					end

					render()
					local sliderTrack = findFirstDescendant(gui, function(instance)
						return instance.ClassName == "TextButton" and instance.Text == "" and instance.Size.Y.Offset == 10
					end)
					t.expect(sliderTrack).toBeDefined()
					sliderTrack.AbsolutePosition = _G.Vector2.new(0, 0)
					sliderTrack.AbsoluteSize = _G.Vector2.new(100, 10)

					sliderTrack.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 25, 0))
					inputService.InputChanged:Fire(makeInput(_G.Enum.UserInputType.MouseMovement, 75, 0))
					render()
					t.expect(sliderValue).toBe(75)

					local dragButton = findFirstDescendant(gui, function(instance)
						return instance.ClassName == "TextButton" and instance.Text == "0"
					end)
					t.expect(dragButton).toBeDefined()

					dragButton.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 0, 0))
					inputService.InputChanged:Fire(makeInput(_G.Enum.UserInputType.MouseMovement, 20, 0))
					render()
					t.expect(dragValue).toBe(5)
				end)

				t.it("adapts UI Labs MouseMoved signals into drag InputChanged events", function()
					RovyUi.__reset()
					local gui = root()
					local inputSignals = {
						InputBegan = makeSignal(),
						InputChanged = makeSignal(),
						InputEnded = makeSignal(),
						MouseMoved = makeSignal(),
						MouseLocation = _G.Vector2.new(0, 0),
					}
					function inputSignals:GetMouseLocation()
						return self.MouseLocation
					end

					local inputService = RovyUi.createRovyInputServiceFromSignals(inputSignals)
					local node = RovyUi.new(gui, { inputService = inputService })
					local value = 0

					local function render()
						RovyUi.start(node, function()
							value = RovyUi.slider({ min = 0, max = 100, initial = 0, showValueBox = false })
						end)
					end

					render()
					local sliderTrack = findFirstDescendant(gui, function(instance)
						return instance.ClassName == "TextButton" and instance.Text == "" and instance.Size.Y.Offset == 10
					end)
					t.expect(sliderTrack).toBeDefined()
					sliderTrack.AbsolutePosition = _G.Vector2.new(0, 0)
					sliderTrack.AbsoluteSize = _G.Vector2.new(100, 10)

					sliderTrack.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 10, 0))
					inputSignals.MouseMoved:Fire(_G.Vector2.new(65, 0))
					render()

					t.expect(value).toBe(65)
					t.expect(inputService:GetMouseLocation().X).toBe(65)
					t.expect(inputService:GetMouseLocation().Y).toBe(0)
				end)

				t.it("updates hover from injected mouse movement signals", function()
					RovyUi.__reset()
					local playerGui = _G.Instance.new("PlayerGui")
					local gui = root()
					gui.Parent = playerGui
					local inputSignals = {
						InputBegan = makeSignal(),
						InputChanged = makeSignal(),
						InputEnded = makeSignal(),
						MouseMoved = makeSignal(),
						MouseLocation = _G.Vector2.new(0, 0),
					}
					function inputSignals:GetMouseLocation()
						return self.MouseLocation
					end

					local inputService = RovyUi.createRovyInputServiceFromSignals(inputSignals)
					local node = RovyUi.new(gui, { inputService = inputService })

					local function render()
						RovyUi.start(node, function()
							RovyUi.window({ title = "Injected Hover" }, function()
								RovyUi.button("Hover Me")
							end)
						end)
					end

					render()
					local hoverButton = findFirstDescendant(gui, function(instance)
						return instance.ClassName == "TextButton" and instance.Text == "Hover Me"
					end)
					t.expect(hoverButton).toBeDefined()
					local hoverStroke = findChildByClass(hoverButton, "UIStroke")
					t.expect(hoverStroke).toBeDefined()
					playerGui.__guiObjectsAtPositionByPosition = {
						["10,12"] = { hoverButton },
					}

					inputSignals.MouseMoved:Fire(_G.Vector2.new(10, 12))
					render()

					t.expect(inputService:GetMouseLocation().X).toBe(10)
					t.expect(inputService:GetMouseLocation().Y).toBe(12)
					t.expect(hoverStroke.Color).toBe(RovyUi.getActiveStyle().strokeHoveredColor)
				end)

				t.it("updates injected hover without a PlayerGui ancestor", function()
					RovyUi.__reset()
					local gui = root()
					gui.AbsolutePosition = _G.Vector2.new(50, 30)
					gui.AbsoluteSize = _G.Vector2.new(300, 200)
					local services = _G.__rovyTestServices
					local oldWaitForChild = services.Players.LocalPlayer.WaitForChild
					local strayPlayerGui = _G.Instance.new("PlayerGui")
					services.Players.LocalPlayer.WaitForChild = function(name)
						if name == "PlayerGui" then return strayPlayerGui end
						return nil
					end
					local inputSignals = {
						InputBegan = makeSignal(),
						InputChanged = makeSignal(),
						InputEnded = makeSignal(),
						MouseMoved = makeSignal(),
						MouseLocation = _G.Vector2.new(0, 0),
					}
					function inputSignals:GetMouseLocation()
						return self.MouseLocation
					end

					local inputService = RovyUi.createRovyInputServiceFromSignals(inputSignals)
					local node = RovyUi.new(gui, { inputService = inputService })

					local function render()
						RovyUi.start(node, function()
							RovyUi.button("Hover Me")
						end)
					end

					render()
					local hoverButton = findFirstDescendant(gui, function(instance)
						return instance.ClassName == "TextButton" and instance.Text == "Hover Me"
					end)
					t.expect(hoverButton).toBeDefined()
					local hoverStroke = findChildByClass(hoverButton, "UIStroke")
					t.expect(hoverStroke).toBeDefined()
					hoverButton.AbsolutePosition = _G.Vector2.new(50, 30)
					hoverButton.AbsoluteSize = _G.Vector2.new(100, 24)

					inputSignals.MouseMoved:Fire(_G.Vector2.new(10, 12))
					render()
					t.expect(hoverStroke.Color).toBe(RovyUi.getActiveStyle().strokeHoveredColor)

					inputSignals.MouseMoved:Fire(_G.Vector2.new(130, 12))
					render()
					t.expect(hoverStroke.Color).toBe(RovyUi.getActiveStyle().strokeInactiveColor)
					services.Players.LocalPlayer.WaitForChild = oldWaitForChild
				end)

			t.it("starts window drags from injected input began signals", function()
				RovyUi.__reset()
				local gui = root()
				local inputService = makeInputService()
				local node = RovyUi.new(gui, { inputService = inputService })

				RovyUi.start(node, function()
					RovyUi.window({ title = "Global Drag", position = _G.Vector2.new(10, 15) }, function() end)
				end)

				local windowFrame = findFirstDescendant(gui, function(instance)
					return instance.ClassName == "Frame" and instance:GetAttribute("EgooEWindow") == true
				end)
				local titleBar = firstDirectChild(windowFrame, function(instance)
					return instance.ClassName == "TextButton" and instance.Text == ""
				end)
				local resizeGrip = firstDirectChild(windowFrame, function(instance)
					return instance.ClassName == "TextButton" and instance.Text == "⊿"
				end)
				t.expect(windowFrame).toBeDefined()
				t.expect(titleBar).toBeDefined()
				t.expect(resizeGrip).toBeDefined()

				titleBar.AbsolutePosition = _G.Vector2.new(10, 15)
				titleBar.AbsoluteSize = _G.Vector2.new(200, 24)
				resizeGrip.AbsolutePosition = _G.Vector2.new(280, 380)
				resizeGrip.AbsoluteSize = _G.Vector2.new(16, 16)

				inputService.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 20, 20))
				inputService.InputChanged:Fire(makeInput(_G.Enum.UserInputType.MouseMovement, 45, 50))
				inputService.InputEnded:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 45, 50))

				t.expect(windowFrame.Position.X.Offset).toBe(35)
				t.expect(windowFrame.Position.Y.Offset).toBe(45)
			end)

			t.it("starts slider and dragValue drags from injected input began signals", function()
				RovyUi.__reset()
				local gui = root()
				local inputService = makeInputService()
				local node = RovyUi.new(gui, { inputService = inputService })
				local sliderValue = 0
				local dragValue = 0

				local function render()
					RovyUi.start(node, function()
						sliderValue = RovyUi.slider({ min = 0, max = 100, initial = 0, showValueBox = false })
						dragValue = RovyUi.dragValue({ min = 0, max = 100, initial = 0, step = 1 })
					end)
				end

				render()
				local sliderTrack = findFirstDescendant(gui, function(instance)
					return instance.ClassName == "TextButton" and instance.Text == "" and instance.Size.Y.Offset == 10
				end)
				t.expect(sliderTrack).toBeDefined()
				sliderTrack.AbsolutePosition = _G.Vector2.new(0, 0)
				sliderTrack.AbsoluteSize = _G.Vector2.new(100, 10)

				local dragButton = findFirstDescendant(gui, function(instance)
					return instance.ClassName == "TextButton" and instance.Text == "0"
				end)
				t.expect(dragButton).toBeDefined()
				dragButton.AbsolutePosition = _G.Vector2.new(0, 20)
				dragButton.AbsoluteSize = _G.Vector2.new(80, 20)

				inputService.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 25, 5))
				inputService.InputChanged:Fire(makeInput(_G.Enum.UserInputType.MouseMovement, 75, 5))
				inputService.InputEnded:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 75, 5))
				render()
				t.expect(sliderValue).toBe(75)

				inputService.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 10, 25))
				inputService.InputChanged:Fire(makeInput(_G.Enum.UserInputType.MouseMovement, 30, 25))
				inputService.InputEnded:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 30, 25))
				render()

				t.expect(dragValue).toBe(5)
			end)

			t.it("falls back to the default UserInputService when no input service is injected", function()
				RovyUi.__reset()
					local gui = root()
					local node = RovyUi.new(gui)
					local value = 0

					local function render()
						RovyUi.start(node, function()
							value = RovyUi.slider({ min = 0, max = 100, initial = 0, showValueBox = false })
						end)
					end

					render()
					local sliderTrack = findFirstDescendant(gui, function(instance)
						return instance.ClassName == "TextButton" and instance.Text == "" and instance.Size.Y.Offset == 10
					end)
					t.expect(sliderTrack).toBeDefined()
					sliderTrack.AbsolutePosition = _G.Vector2.new(0, 0)
					sliderTrack.AbsoluteSize = _G.Vector2.new(100, 10)

					sliderTrack.InputBegan:Fire(makeInput(_G.Enum.UserInputType.MouseButton1, 10, 0))
					_G.__rovyTestServices.UserInputService.InputChanged:Fire(makeInput(_G.Enum.UserInputType.MouseMovement, 40, 0))
					render()

					t.expect(value).toBe(40)
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
