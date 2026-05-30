--!nocheck

local fs = zune.fs
local luau = zune.luau
local task = zune.task
local process = zune.process

local function kind(path: string): string?
	local ok, stat = pcall(fs.stat, path)
	if ok and stat ~= nil then
		return stat.kind
	end
	return nil
end

local function isFile(path: string): boolean
	return kind(path) == "file"
end

local function isDir(path: string): boolean
	return kind(path) == "directory"
end

local function readDir(path: string): { string }
	local names = {}
	for _, entry in fs.entries(path) do
		table.insert(names, entry.name)
	end
	return names
end

local ROOT = (process.cwd() :: string):gsub("[/\\]+$", "")

local TS = {}
local moduleCache: { [string]: { value: any } } = {}
local Node = {}

TS.TRY_RETURN = 1
TS.TRY_BREAK = 2
TS.TRY_CONTINUE = 3

function TS.try(try, catch, finally)
	local trySuccess, exitTypeOrTryError, returns = pcall(try)
	local exitType, tryError
	if trySuccess then
		exitType = exitTypeOrTryError
	else
		tryError = exitTypeOrTryError
	end

	local catchSuccess = true
	local catchError
	if not trySuccess and catch then
		local newExitTypeOrCatchError, newReturns
		catchSuccess, newExitTypeOrCatchError, newReturns = pcall(catch, tryError)
		if catchSuccess then
			if newExitTypeOrCatchError then
				exitType, returns = newExitTypeOrCatchError, newReturns
			end
		else
			catchError = newExitTypeOrCatchError
		end
	end

	if finally then
		local newExitType, newReturns = finally()
		if newExitType then
			exitType, returns = newExitType, newReturns
		end
	end

	if exitType ~= TS.TRY_RETURN and exitType ~= TS.TRY_BREAK and exitType ~= TS.TRY_CONTINUE then
		if not catchSuccess then
			error(catchError, 2)
		end
		if not trySuccess and not catch then
			error(tryError, 2)
		end
	end

	return exitType, returns
end

local function newNode(path: string)
	return setmetatable({ __path = path, __file = nil, children = {} }, Node)
end

local function scan(path: string): any
	local node = newNode(path)
	if isFile(path) then
		node.__file = path
		return node
	end
	local packageJsonPath = path .. "/package.json"
	local packageMainPath: string? = nil
	if isFile(packageJsonPath) then
		local packageJson = fs.readFile(packageJsonPath)
		local main = packageJson:match('"main"%s*:%s*"([^"]+)"')
		if main then
			packageMainPath = path .. "/" .. main
		end
	end
	if not isDir(path) and packageMainPath == nil then
		return node
	end
	for _, entry in readDir(path) do
		local childPath = path .. "/" .. entry
		if isDir(childPath) then
			node.children[entry] = scan(childPath)
		elseif isFile(childPath) then
			local child = node.children[entry] or newNode(childPath)
			child.__file = childPath
			node.children[entry] = child
			local stem = entry:match("^(.*)%.luau$") or entry:match("^(.*)%.lua$")
			if stem and not node.children[stem] then
				local sn = newNode(childPath)
				sn.__file = childPath
				node.children[stem] = sn
			end
		end
	end
	local init = node.children["init"]
	if init and init.__file then
		node.__file = init.__file
	elseif packageMainPath ~= nil and isFile(packageMainPath) then
		node.__file = packageMainPath
	end
	return node
end

Node.__index = function(self, key: string)
	local m = rawget(Node, key)
	if m ~= nil then
		return m
	end
	local kids = rawget(self, "children")
	if kids and kids[key] ~= nil then
		return kids[key]
	end
	if key == "Parent" then
		local p = (rawget(self, "__path") :: string):match("^(.*)[/\\][^/\\]+$")
		return p and (treeIndex(p) :: any) or nil
	end
	return nil
end

function Node.FindFirstChild(self, name: string)
	return rawget(self, "children")[name]
end

local roots: { [string]: any } = {}
local function ensureRoot(rel: string)
	if not roots[rel] then
		roots[rel] = scan(ROOT .. "/" .. rel)
	end
	return roots[rel]
end
ensureRoot("out")
ensureRoot("node_modules/@rbxts")
ensureRoot("node_modules/@rovy")

local nodeByPath: { [string]: any } = {}
local function indexTree(node)
	nodeByPath[node.__path] = node
	for _, c in node.children do
		indexTree(c)
	end
end
function treeIndex(path: string)
	return nodeByPath[path]
end
for _, r in roots do
	indexTree(r)
end

local allConnections = {}

local function liveConnectionCount(label)
	local total = 0
	for _, connection in ipairs(allConnections) do
		if connection.Connected and (label == nil or connection.__label == label) then
			total += 1
		end
	end
	return total
end

local function disconnectLoggedConnections()
	for _, connection in ipairs(allConnections) do
		if connection.Connected then
			connection:Disconnect()
		end
	end
	table.clear(allConnections)
end

local function signal(label)
	local listeners = {}
	return {
		Connect = function(_self, fn)
			local listener = { connected = true, fn = fn, connection = nil }
			table.insert(listeners, listener)
			local connection = {
				Connected = true,
				__label = label,
				Disconnect = function(self)
					listener.connected = false
					self.Connected = false
				end,
			}
			listener.connection = connection
			table.insert(allConnections, connection)
			return connection
		end,
		DisconnectAll = function(_self)
			for _, listener in ipairs(listeners) do
				if listener.connection ~= nil then
					listener.connection:Disconnect()
				else
					listener.connected = false
				end
			end
		end,
		LiveConnectionCount = function(_self)
			local total = 0
			for _, listener in ipairs(listeners) do
				if listener.connected then total += 1 end
			end
			return total
		end,
		Fire = function(_self, ...)
			for _, listener in ipairs(listeners) do
				if listener.connected then
					listener.fn(...)
				end
			end
		end,
	}
end

local allInstances = {}
local FakeInstance = {}
local signalKeys = {
	Changed = true,
	Destroying = true,
	AncestryChanged = true,
	Heartbeat = true,
	RenderStepped = true,
	Stepped = true,
	Activated = true,
	MouseButton1Click = true,
	MouseButton1Down = true,
	MouseButton1Up = true,
	MouseEnter = true,
	MouseLeave = true,
	MouseMoved = true,
	InputBegan = true,
	InputChanged = true,
	InputEnded = true,
}
FakeInstance.__index = function(self, key)
	local value = rawget(FakeInstance, key)
	if value ~= nil then
		return value
	end
	local existing = rawget(self, key)
	if existing ~= nil then
		return existing
	end
	if signalKeys[key] == nil then
		return nil
	end
	local events = rawget(self, "__events")
	if events[key] == nil then
		events[key] = signal(tostring(rawget(self, "ClassName")) .. "." .. tostring(key))
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
	local propertyEvents = rawget(self, "__propertyEvents")
	local propertyEvent = propertyEvents and propertyEvents[key]
	if propertyEvent ~= nil then
		propertyEvent:Fire()
	end
end
function FakeInstance:IsA(className)
	return self.ClassName == className or className == "Instance" or (className == "GuiObject" and self.__isGui)
end
function FakeInstance:Destroy()
	self.Destroyed = true
	self.Parent = nil
	for _, event in pairs(self.__events) do
		if event.DisconnectAll ~= nil then
			event:DisconnectAll()
		end
	end
	for _, event in pairs(self.__propertyEvents) do
		if event.DisconnectAll ~= nil then
			event:DisconnectAll()
		end
	end
	for _, child in ipairs(self:GetChildren()) do
		child:Destroy()
	end
	self.__children = {}
end
function FakeInstance:GetChildren()
	local children = {}
	for _, instance in ipairs(allInstances) do
		if not instance.Destroyed and instance.Parent == self then
			table.insert(children, instance)
		end
	end
	return children
end
function FakeInstance:FindFirstChild(name)
	for _, child in ipairs(self:GetChildren()) do
		if child.Name == name then return child end
	end
	return nil
end
function FakeInstance:FindFirstChildOfClass(className)
	for _, child in ipairs(self:GetChildren()) do
		if child.ClassName == className then return child end
	end
	return nil
end
function FakeInstance:GetGuiObjectsAtPosition(x, y)
	local byPosition = self.__guiObjectsAtPositionByPosition
	if byPosition ~= nil then
		return byPosition[tostring(x) .. "," .. tostring(y)] or {}
	end
	return self.__guiObjectsAtPosition or {}
end
function FakeInstance:SetAttribute(name, value)
	self.__attributes[name] = value
end
function FakeInstance:GetAttribute(name)
	return self.__attributes[name]
end
function FakeInstance:GetPropertyChangedSignal(name)
	local events = rawget(self, "__propertyEvents")
	if events[name] == nil then
		events[name] = signal(tostring(rawget(self, "ClassName")) .. "." .. tostring(name) .. "Changed")
	end
	return events[name]
end

local function newInstance(className)
	local instance = setmetatable({
		ClassName = className,
		Name = className,
		__children = {},
		__events = {},
		__propertyEvents = {},
		__attributes = {},
		__isGui = true,
		LayoutOrder = 0,
		AbsolutePosition = { X = 0, Y = 0 },
		AbsoluteSize = { X = 100, Y = 100 },
		Visible = true,
	}, FakeInstance)
	table.insert(allInstances, instance)
	return instance
end

local function fakeBuffer()
	local api = {}
	function api.create(size)
		local b = { __rovyBuffer = true, __len = size, __data = {} }
		for i = 0, size - 1 do
			b.__data[i] = 0
		end
		return b
	end
	function api.len(b)
		return b.__len
	end
	function api.readu8(b, offset)
		return b.__data[offset] or 0
	end
	function api.writeu8(b, offset, value)
		b.__data[offset] = math.clamp(math.floor(value), 0, 255)
	end
	function api.fill(b, offset, value, count)
		local n = count or (b.__len - offset)
		for i = offset, offset + n - 1 do
			api.writeu8(b, i, value)
		end
	end
	return api
end

local function makeEditableImage(size)
	return {
		ClassName = "EditableImage",
		Size = size,
		Writes = {},
		Destroyed = false,
		WritePixelsBuffer = function(self, position, writeSize, pixels)
			table.insert(self.Writes, {
				position = position,
				size = writeSize,
				pixels = pixels,
			})
		end,
		Destroy = function(self)
			self.Destroyed = true
		end,
	}
end

local services = {
	UserInputService = {
		InputBegan = signal("UserInputService.InputBegan"),
		InputChanged = signal("UserInputService.InputChanged"),
		InputEnded = signal("UserInputService.InputEnded"),
		MouseLocation = { X = 0, Y = 0 },
		GetMouseLocation = function(self)
			return self.MouseLocation
		end,
	},
	GuiService = {
		GuiInset = { X = 0, Y = 0 },
		GetGuiInset = function(self)
			return self.GuiInset, { X = 0, Y = 0 }
		end,
	},
	RunService = {
		RenderStepped = signal("RunService.RenderStepped"),
	},
	Players = {
		LocalPlayer = {
			Mouse = { Icon = "" },
			GetMouse = function(self)
				return self.Mouse
			end,
		},
	},
	AssetService = {
		CreatedEditableImages = {},
		FailCreate = false,
		CreateEditableImage = function(self, options)
			if self.FailCreate then
				error("CreateEditableImage failed", 2)
			end
			local image = makeEditableImage(options and options.Size or { X = 512, Y = 512 })
			table.insert(self.CreatedEditableImages, image)
			return image
		end,
	},
}

local bufferApi = _G.buffer or fakeBuffer()

local fakeGlobals = {
	Color3 = {
		fromRGB = function(r, g, b)
			return { R = r / 255, G = g / 255, B = b / 255 }
		end,
	},
	Vector2 = { new = function(x, y) return { X = x, Y = y } end },
	UDim2 = { new = function(xs, xo, ys, yo) return { X = { Scale = xs, Offset = xo }, Y = { Scale = ys, Offset = yo } } end },
	UDim = { new = function(scale, offset) return { Scale = scale, Offset = offset } end },
	Instance = { new = newInstance },
	Content = {
		fromObject = function(object)
			return { SourceType = "Object", Object = object }
		end,
		none = { SourceType = "None" },
	},
	buffer = bufferApi,
	game = {
		GetService = function(selfOrName, maybeName)
			local name = maybeName or selfOrName
			local service = services[name]
			if service == nil then
				error("service not found: " .. tostring(name), 2)
			end
			return service
		end,
	},
	__rovyTestServices = services,
	__rovyTestRuntime = {
		liveConnectionCount = liveConnectionCount,
		resetConnections = disconnectLoggedConnections,
	},
	Enum = setmetatable({}, {
		__index = function(_, enumName)
			return setmetatable({}, {
				__index = function(_, itemName)
					return tostring(enumName) .. "." .. tostring(itemName)
				end,
			})
		end,
	}),
	typeof = function(value)
		if type(value) == "table" and type(value.IsA) == "function" and value:IsA("Instance") then
			return "Instance"
		end
		return type(value)
	end,
}
for key, value in pairs(fakeGlobals) do
	_G[key] = value
end

local sharedG = setmetatable(fakeGlobals, { __index = _G })

local function loadModule(node): any
	local fsPath = rawget(node, "__file")
	assert(fsPath, "rovy ui test harness: not a requirable module: " .. tostring(rawget(node, "__path")))
	local cached = moduleCache[fsPath]
	if cached ~= nil then
		return cached.value
	end
	moduleCache[fsPath] = { value = nil }

	local src = fs.readFile(fsPath)
	local scriptNode = node
	if fsPath:match("[/\\]init%.luau$") or fsPath:match("[/\\]init%.lua$") then
		local dir = fsPath:match("^(.*)[/\\]init%.lua[u]?$")
		scriptNode = (dir and treeIndex(dir)) or node
	end
	rawset(sharedG, scriptNode, TS)

	local env = setmetatable({
		script = scriptNode,
		_G = sharedG,
		task = task,
		require = function(target)
			if type(target) == "string" then
				local base = (fsPath:match("^(.*)[/\\][^/\\]+$")) or ROOT
				local p = base
				for seg in target:gmatch("[^/\\]+") do
					if seg == ".." then
						p = p:match("^(.*)[/\\][^/\\]+$") or p
					elseif seg ~= "." then
						p = p .. "/" .. seg
					end
				end
				local n = treeIndex(p) or treeIndex(p:gsub("%.luau$", ""):gsub("%.lua$", ""))
				if not n then
					n = scan(p)
					indexTree(n)
				end
				return loadModule(n)
			end
			return loadModule(target)
		end,
	}, { __index = sharedG })

	local chunk = luau.load(luau.compile(src), { chunk_name = fsPath, env = env })
	local value = chunk()
	moduleCache[fsPath] = { value = value }
	return value
end

function TS.getModule(_context, scope: string, moduleName: string)
	if scope == "@rovy" and moduleName == "jecs" then
		local n = scan(ROOT .. "/../jecs")
		indexTree(n)
		return n
	end
	local scopeNode = ensureRoot("node_modules/" .. scope)
	indexTree(scopeNode)
	local n = scopeNode.children[moduleName]
	if n == nil and scope == "@rovy" and moduleName == "rovy-core" then
		n = scopeNode.children["core"]
	end
	if scope == "@rovy" and moduleName == "rovy-core" and (n == nil or rawget(n, "__file") == nil) then
		n = scan(ROOT .. "/../core/out")
		indexTree(n)
	end
	if n == nil and scope == "@rbxts" then
		local rbxts = scan(ROOT .. "/../core/node_modules/@rbxts")
		indexTree(rbxts)
		n = rbxts.children[moduleName]
	end
	assert(n, "rovy ui test harness: module not found " .. scope .. "/" .. moduleName)
	return n
end

function TS.import(_context, module, ...)
	local target = module
	for _, name in { ... } do
		target = (target :: any)[name]
		assert(target ~= nil, "rovy ui test harness: import miss at '" .. tostring(name) .. "'")
	end
	return loadModule(target)
end

TS.instanceof = function(obj, class)
	if type(class) == "table" and type((class :: any).instanceof) == "function" then
		return (class :: any).instanceof(obj)
	end
	local mt = type(obj) == "table" and getmetatable(obj) or nil
	while mt do
		if mt == class then
			return true
		end
		mt = getmetatable(mt)
	end
	return false
end

function TS.loadPath(relPath: string)
	local n = treeIndex(ROOT .. "/" .. relPath) or treeIndex(ROOT .. "/" .. relPath .. ".luau")
	assert(n, "rovy ui test harness: no module at " .. relPath)
	return loadModule(n)
end

return TS
