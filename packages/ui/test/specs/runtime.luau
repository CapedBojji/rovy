--!nocheck

return function(TS, t)
	local ui = TS.loadPath("out/init")
	local RovyUi = ui.default

	local function root()
		local r = { ClassName = "ScreenGui", Name = "ScreenGui", __children = {} }
		function r:GetChildren()
			return self.__children
		end
		function r:Destroy()
			self.Destroyed = true
		end
		return r
	end

	local function run(fn)
		local node = RovyUi.new(root())
		RovyUi.start(node, fn)
		return node
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
			end, { id = "spec@Widget", name = "Widget", params = {} })
			run(function()
				RovyUi.__callWidget(Widget, "call:widget", { "ok" })
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
			end, { id = "spec@Counter", name = "Counter", params = {} })
			local node = RovyUi.new(root())

			RovyUi.start(node, function()
				RovyUi.__callWidget(Widget, "call:a", { "A" })
				RovyUi.__callWidget(Widget, "call:b", { "B" })
			end)
			RovyUi.start(node, function()
				RovyUi.__callWidget(Widget, "call:a", { "A" })
			end)

			t.expect(seen[1]).toBe("A:0")
			t.expect(seen[2]).toBe("B:0")
			t.expect(seen[3]).toBe("A:1")
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
			end, { id = "spec@Effect", name = "Effect", params = {} })
			local node = RovyUi.new(root())

			RovyUi.start(node, function()
				RovyUi.__callWidget(Widget, "call:effect", { "a" })
			end)
			RovyUi.start(node, function()
				RovyUi.__callWidget(Widget, "call:effect", { "a" })
			end)
			RovyUi.start(node, function()
				RovyUi.__callWidget(Widget, "call:effect", { "b" })
			end)
			t.expect(runs).toBe(2)
			t.expect(cleanups).toBe(1)
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
				end)
			end)
			local hasChildren = false
			for _ in pairs(node.children) do
				hasChildren = true
				break
			end
			t.expect(hasChildren).toBeTruthy()
		end)

		t.it("resolves injected params from active app context", function()
			RovyUi.__reset()
			local core = TS.import(nil, TS.getModule(nil, "@rovy", "rovy-core"))
			local app = core.App.new()
			local Theme = {}
			Theme.__index = Theme
			function Theme.new()
				return setmetatable({ title = "HUD" }, Theme)
			end

			core.rovy:__reset()
			core.rovy:__resource(Theme, "spec@Theme")
			app:start()

			local seen
			local Widget = RovyUi.__widget(function(theme, label)
				seen = theme.title .. ":" .. label
			end, {
				id = "spec@Inject",
				name = "Inject",
				params = { { kind = "res", ctor = Theme } },
			})
			run(function()
				RovyUi.withApp(app, function()
					RovyUi.__callWidget(Widget, "call:inject", { "Inventory" })
				end)
			end)
			t.expect(seen).toBe("HUD:Inventory")
		end)
	end)
end
