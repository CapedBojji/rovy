--!nocheck
-- Shared helpers for the @rovy/ui zune specs.
--
-- Every spec receives (TS, t) from the shared spec_runner. These helpers wrap
-- the two moving parts a retained-ui test needs:
--   1. the compiled ui runtime (out/init) — mountUi/child/native/fragment/__ui
--   2. the compiled @rovy/core App + registry, loaded through the harness
--      module resolver so world/queries/lifecycle behave exactly as they ship.
--
-- Fixtures are registered by hand (mirroring the core specs' `class()` idiom)
-- so we exercise the runtime against the *same* metadata shape the transformer
-- emits: rovyUi:__ui(ctor, { id, methods = {"render"}, params, triggers }).

local Helpers = {}

function Helpers.load(TS)
	local ui = TS.loadPath("out/init")
	local RovyUi = ui.default

	-- Reach the compiled core artifact through the harness module graph.
	local core = TS.import(nil, TS.getModule(nil, "@rovy", "core").out)

	local H = {
		ui = ui,
		RovyUi = RovyUi,
		core = core,
		App = core.App,
		rovy = core.rovy,

		-- vnode factories
		mountUi = ui.mountUi,
		unmountUi = ui.unmountUi,
		child = ui.child,
		native = ui.native,
		fragment = ui.fragment,
		frame = ui.frame,
		textLabel = ui.textLabel,
		textButton = ui.textButton,
		uiListLayout = ui.uiListLayout,

		-- trigger / binding macros (same helpers the transformer lowers from)
		prop = ui["$prop"],
		queryTrigger = ui["$queryTrigger"],
		componentTrigger = ui["$componentTrigger"],
		resourceTrigger = ui["$resourceTrigger"],
		eventTrigger = ui["$eventTrigger"],
		relationTrigger = ui["$relationTrigger"],
		lifecycleTrigger = ui["$lifecycleTrigger"],
		propsTrigger = ui["$propsTrigger"],
	}

	-- Fresh registry + ui registry per scenario.
	function H.reset()
		core.rovy:__reset()
		RovyUi:__reset()
		if _G.__rovyClearTasks then _G.__rovyClearTasks() end
		if _G.__rovyClearWarnings then _G.__rovyClearWarnings() end
		if _G.__rovyTestRuntime then _G.__rovyTestRuntime.resetConnections() end
	end

	-- Build a plain ECS class (component/resource/event/relation/system ctor).
	function H.class(init)
		local C = {}
		C.__index = C
		C.new = function(...)
			return setmetatable(init and init(...) or {}, C)
		end
		return C
	end

	-- Register an @ui fixture. `render` is `function(self, ...params) -> vnode`.
	-- opts.params / opts.triggers mirror the transformer's descriptor arrays.
	function H.uiClass(id, render, opts)
		opts = opts or {}
		local C = {}
		C.__index = C
		C.new = function(props)
			return setmetatable({ props = props or {}, renders = 0 }, C)
		end
		C.render = render
		RovyUi:__ui(C, {
			id = id,
			methods = { "render" },
			params = opts.params or {},
			triggers = opts.triggers or {},
		})
		return C
	end

	-- A resource used only to force re-renders. Register (returns the ctor)
	-- before startedApp, pair it with H.resourceTrigger(Bump) on a component,
	-- then call H.bump(app, n) to make that component re-render deterministically.
	function H.rerenderResource(id)
		local Bump = H.class(function(n)
			return { n = n or 0 }
		end)
		core.rovy:__resource(Bump, id or "test/Bump")
		H._bumpCtor = Bump
		H._bumpN = 0
		return Bump
	end

	function H.bump(app, Bump)
		Bump = Bump or H._bumpCtor
		H._bumpN += 1
		app.world:insertResource(Bump.new(H._bumpN))
		H.settle(app)
	end

	-- A target Instance (ScreenGui) to mount into.
	function H.target(name)
		local gui = _G.Instance.new("ScreenGui")
		gui.Name = name or "TestGui"
		return gui
	end

	-- Start an App. Core refuses an empty active registry, so we always seed a
	-- throwaway component; callers register their own components/resources first.
	function H.startedApp()
		local Seed = H.class(function() return {} end)
		core.rovy:__component(Seed, "test/__Seed")
		local app = H.App.new()
		app:start()
		return app
	end

	-- Expose the tree walkers on the instance too, for convenience in specs.
	H.walkNodes = Helpers.walkNodes
	H.collectInstances = Helpers.collectInstances
	H.findInstance = Helpers.findInstance
	H.findByName = Helpers.findByName
	H.countClass = Helpers.countClass
	H.texts = Helpers.texts
	H.hasText = Helpers.hasText

	-- Force any queued task.defer flushes + a post-flush pass to settle the ui.
	function H.settle(app)
		if _G.__rovyDrainTasks then _G.__rovyDrainTasks() end
		if app then app:flush() end
		if _G.__rovyDrainTasks then _G.__rovyDrainTasks() end
	end

	return H
end

-- Tree walkers over the ui runtime node graph (component/native/fragment).

function Helpers.walkNodes(node, visit)
	if node == nil then return end
	visit(node)
	if node.child ~= nil then Helpers.walkNodes(node.child, visit) end
	if node.children ~= nil then
		for _, child in pairs(node.children) do
			Helpers.walkNodes(child, visit)
		end
	end
end

function Helpers.collectInstances(node)
	local out = {}
	Helpers.walkNodes(node, function(n)
		if n.instance ~= nil then table.insert(out, n.instance) end
	end)
	return out
end

function Helpers.findInstance(node, predicate)
	local found
	Helpers.walkNodes(node, function(n)
		if found == nil and n.instance ~= nil and predicate(n.instance) then
			found = n.instance
		end
	end)
	return found
end

function Helpers.findByName(node, name)
	return Helpers.findInstance(node, function(instance)
		return instance.Name == name
	end)
end

function Helpers.countClass(node, className)
	local total = 0
	Helpers.walkNodes(node, function(n)
		if n.instance ~= nil and n.instance.ClassName == className then
			total += 1
		end
	end)
	return total
end

-- Descendant text scan over a mounted target Instance (mirrors the proof place).
function Helpers.texts(target)
	local out = {}
	for _, descendant in ipairs(target:GetDescendants()) do
		if descendant.ClassName == "TextLabel" or descendant.ClassName == "TextButton" then
			table.insert(out, descendant.Text)
		end
	end
	return out
end

function Helpers.hasText(target, fragment)
	for _, text in ipairs(Helpers.texts(target)) do
		if type(text) == "string" and string.find(text, fragment, 1, true) then
			return true
		end
	end
	return false
end

return Helpers
