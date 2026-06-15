--!nocheck

local function createSignal()
	local listeners = {}
	return {
		Connect = function(_self, fn)
			table.insert(listeners, fn)
			return {
				Disconnect = function()
					for i = #listeners, 1, -1 do
						if listeners[i] == fn then
							table.remove(listeners, i)
							break
						end
					end
				end,
			}
		end,
		Fire = function(_self, ...)
			for _, fn in listeners do
				fn(...)
			end
		end,
	}
end

local function createRunService()
	return {
		RenderStepped = createSignal(),
		Heartbeat = createSignal(),
		Stepped = createSignal(),
	}
end

local function createStepper(runService)
	local state = { steps = 0, time = 0 }

	local function step(dt: number?)
		local delta = dt or (1 / 60)
		state.steps += 1
		state.time += delta

		if runService.Stepped and runService.Stepped.Fire then
			runService.Stepped:Fire(state.time, delta)
		end
		if runService.Heartbeat and runService.Heartbeat.Fire then
			runService.Heartbeat:Fire(delta)
		end
		if runService.RenderStepped and runService.RenderStepped.Fire then
			runService.RenderStepped:Fire(delta)
		end
	end

	local function stepN(count: number, dt: number?)
		for _ = 1, count do
			step(dt)
		end
	end

	return {
		state = state,
		step = step,
		stepN = stepN,
	}
end

local function createTree()
	local allInstances = {}
	local FakeInstance = {}

	FakeInstance.__index = function(self, key)
		local value = rawget(FakeInstance, key)
		if value ~= nil then
			return value
		end
		local events = rawget(self, "__events")
		if events[key] == nil then
			events[key] = createSignal()
		end
		return events[key]
	end

	FakeInstance.__newindex = function(self, key, value)
		if key == "Parent" then
			local old = rawget(self, "Parent")
			if old and old.__children then
				for i, child in ipairs(old.__children) do
					if child == self then
						table.remove(old.__children, i)
						break
					end
				end
			end
			rawset(self, key, value)
			if value and value.__children then
				table.insert(value.__children, self)
			end
		else
			rawset(self, key, value)
		end
	end

	function FakeInstance:IsA(className: string)
		return self.ClassName == className or className == "Instance" or (className == "GuiObject" and self.__isGui)
	end

	function FakeInstance:Destroy()
		self.Destroyed = true
		for _, child in ipairs(self:GetChildren()) do
			child:Destroy()
		end
		local oldParent = rawget(self, "Parent")
		if oldParent and oldParent.__children then
			for i, child in ipairs(oldParent.__children) do
				if child == self then
					table.remove(oldParent.__children, i)
					break
				end
			end
		end
		-- Use rawset to avoid retriggering __newindex parent-walk logic during
		-- teardown; we already detached this node from its previous parent above.
		rawset(self, "Parent", nil)
		self.__children = {}
	end

	function FakeInstance:GetChildren()
		local children = {}
		for _, child in ipairs(self.__children) do
			table.insert(children, child)
		end
		return children
	end

	function FakeInstance:FindFirstChild(name: string)
		for _, child in ipairs(self:GetChildren()) do
			if child.Name == name then
				return child
			end
		end
		return nil
	end

	function FakeInstance:FindFirstChildOfClass(className: string)
		for _, child in ipairs(self:GetChildren()) do
			if child.ClassName == className then
				return child
			end
		end
		return nil
	end

	function FakeInstance:WaitForChild(name: string)
		local child = self:FindFirstChild(name)
		assert(child ~= nil, "WaitForChild miss: " .. tostring(name))
		return child
	end

	function FakeInstance:GetDescendants()
		local out = {}
		local function visit(node)
			for _, child in ipairs(node:GetChildren()) do
				table.insert(out, child)
				visit(child)
			end
		end
		visit(self)
		return out
	end

	function FakeInstance:SetAttribute(name: string, value: any)
		self.__attributes[name] = value
	end

	function FakeInstance:GetAttribute(name: string)
		return self.__attributes[name]
	end

	local GUI_CLASSES = {
		ScreenGui = true,
		PlayerGui = true,
		Frame = true,
		ScrollingFrame = true,
		TextLabel = true,
		TextButton = true,
		ImageLabel = true,
		ImageButton = true,
		UIListLayout = true,
		UIPadding = true,
		UIStroke = true,
	}

	local function isGuiClass(className: string): boolean
		return GUI_CLASSES[className] == true
	end

	local function createInstance(className: string)
		local instance = setmetatable({
			ClassName = className,
			Name = className,
			Parent = nil,
			Destroyed = false,
			__children = {},
			__events = {},
			__attributes = {},
			__isGui = isGuiClass(className),
			LayoutOrder = 0,
			AbsolutePosition = { X = 0, Y = 0 },
			AbsoluteSize = { X = 100, Y = 100 },
			Visible = true,
		}, FakeInstance)
		table.insert(allInstances, instance)
		return instance
	end

	local instanceLib = {
		new = function(className: string, parent)
			local instance = createInstance(className)
			if parent ~= nil then
				instance.Parent = parent
			end
			return instance
		end,
	}

	local services = {}

	local function addService(name: string, classNameOrInstance: any?)
		local service
		if type(classNameOrInstance) == "table" and type(classNameOrInstance.IsA) == "function" then
			service = classNameOrInstance
		else
			service = createInstance(classNameOrInstance or name)
			service.Name = name
		end
		services[name] = service
		return service
	end

	local function getService(name: string)
		local service = services[name]
		if service ~= nil then
			return service
		end
		return addService(name, name)
	end

	local game = {
		GetService = function(_self, name: string)
			return getService(name)
		end,
	}

	local function typeofFn(value: any): string
		if type(value) == "table" and type(value.IsA) == "function" and value:IsA("Instance") then
			return "Instance"
		end
		return type(value)
	end

	return {
		Instance = instanceLib,
		createInstance = createInstance,
		allInstances = allInstances,
		services = services,
		addService = addService,
		getService = getService,
		game = game,
		typeof = typeofFn,
	}
end

local function createGame(services)
	if type(services) == "table" and type(services.getService) == "function" then
		return {
			GetService = function(_self, name: string)
				return services.getService(name)
			end,
		}
	end

	return {
		GetService = function(_self, name: string)
			local service = services[name]
			if service ~= nil then
				return service
			end
			error("unknown fake service: " .. tostring(name))
		end,
	}
end

return {
	createSignal = createSignal,
	createRunService = createRunService,
	createStepper = createStepper,
	createTree = createTree,
	createGame = createGame,
}
