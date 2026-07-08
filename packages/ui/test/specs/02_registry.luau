--!nocheck
-- The ui registry: __ui pushes metadata, __reset clears it, __callsite tags a
-- node, and mounting an unregistered @ui class throws a clear error.

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)
	local RovyUi = H.RovyUi

	t.describe("rovyUi registry", function()
		t.it("default export exposes registry + __ui + __reset + __callsite", function()
			t.expect(RovyUi.registry).toBeDefined()
			t.expect(RovyUi.__ui).toBeDefined()
			t.expect(RovyUi.__reset).toBeDefined()
			t.expect(RovyUi.__callsite).toBeDefined()
			t.expect(H.ui.rovyUi).toBe(RovyUi)
		end)

		t.it("__ui pushes an entry carrying ctor + meta", function()
			RovyUi:__reset()
			local Ctor = {}
			RovyUi:__ui(Ctor, { id = "test/Reg", methods = { "render" }, params = {}, triggers = {} })
			t.expect(#RovyUi.registry).toBe(1)
			t.expect(RovyUi.registry[1].ctor).toBe(Ctor)
			t.expect(RovyUi.registry[1].id).toBe("test/Reg")
			t.expect(RovyUi.registry[1].methods[1]).toBe("render")
		end)

		t.it("__reset empties the registry", function()
			RovyUi:__reset()
			RovyUi:__ui({}, { id = "a", methods = { "render" } })
			RovyUi:__ui({}, { id = "b", methods = { "render" } })
			t.expect(#RovyUi.registry).toBe(2)
			RovyUi:__reset()
			t.expect(#RovyUi.registry).toBe(0)
		end)

		t.it("__callsite tags a node and returns it; nil passes through", function()
			local node = H.ui.frame({ Name = "X" })
			local tagged = RovyUi:__callsite(node, "file:1")
			t.expect(tagged).toBe(node)
			t.expect(node.__callsite).toBe("file:1")
			t.expect(RovyUi:__callsite(nil, "file:2")).toBeUndefined()
		end)

		t.it("mounting a registered @ui class without render() throws", function()
			H.reset()
			local Ctor = {}
			Ctor.__index = Ctor
			Ctor.new = function()
				return setmetatable({}, Ctor)
			end
			-- registered metadata exists, but render implementation is missing
			RovyUi:__ui(Ctor, { id = "test/NoRender", methods = { "render" }, params = {}, triggers = {} })
			local app = H.startedApp()
			local ok, err = pcall(function()
				H.mountUi(app, Ctor, { target = H.target() })
			end)
			t.expect(ok).toBe(false)
			t.expect(string.find(tostring(err), "requires render(...)") ~= nil).toBeTruthy()
		end)

		t.it("the `ui` decorator is a no-op for runtime metadata", function()
			H.reset()
			local Ctor = {}
			local before = #RovyUi.registry
			H.ui.ui(Ctor)
			t.expect(#RovyUi.registry).toBe(before)
		end)

		t.it("mounting an unregistered @ui class throws", function()
			H.reset()
			local Unregistered = H.class(function() return {} end)
			Unregistered.render = function() return H.ui.frame({}) end
			local app = H.startedApp()
			local ok, err = pcall(function()
				H.mountUi(app, Unregistered, { target = H.target() })
			end)
			t.expect(ok).toBe(false)
			t.expect(string.find(tostring(err), "[rovy/ui] @ui class is not registered", 1, true) ~= nil).toBeTruthy()
		end)

		t.it("mountUi requires a started app", function()
			H.reset()
			local Comp = H.uiClass("test/NeedsStart", function()
				return H.ui.frame({})
			end)
			local app = H.App.new()
			local ok, err = pcall(function()
				H.mountUi(app, Comp, { target = H.target() })
			end)
			t.expect(ok).toBe(false)
			t.expect(string.find(tostring(err), "mountUi requires app.start()", 1, true) ~= nil).toBeTruthy()
		end)
	end)
end
