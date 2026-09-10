--!nocheck

local fs = zune.fs
local luau = zune.luau
local task = zune.task
local process = zune.process

-- Controllable `task.defer` shim. The retained-ui runtime is the only module
-- that touches `task` (scheduleFlush → task.defer). We queue those callbacks
-- instead of running them eagerly so specs can assert scheduling/batching
-- deterministically: `_G.__rovyDrainTasks()` runs the whole queue,
-- `_G.__rovyPendingTasks()` reports depth. `spawn` stays synchronous (nothing
-- in core/jecs relies on it, but keep it safe). Everything else falls through
-- to the real zune.task via the metatable.
local deferQueue = {}
local taskShim = setmetatable({
	defer = function(fn, ...)
		table.insert(deferQueue, { fn = fn, args = { ... } })
		return {}
	end,
	delay = function(_seconds, fn, ...)
		table.insert(deferQueue, { fn = fn, args = { ... } })
		return {}
	end,
	spawn = function(fn, ...)
		fn(...)
		return {}
	end,
	cancel = function() end,
	wait = function() end,
}, { __index = task })

local function drainTasks(limit)
	local budget = limit or 10000
	while #deferQueue > 0 and budget > 0 do
		local job = table.remove(deferQueue, 1)
		budget -= 1
		job.fn(table.unpack(job.args))
	end
end

local function pendingTasks()
	return #deferQueue
end

local function clearTasks()
	table.clear(deferQueue)
end

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

local function lineCountsFromCoverage(coverageEntries)
	local out: { [number]: number } = {}
	for _, entry in ipairs(coverageEntries) do
		for key, count in pairs(entry) do
			if type(key) == "number" then
				out[key] = (out[key] or 0) + (tonumber(count) or 0)
			end
		end
	end
	return out
end

local coverageTracker: { [string]: { chunks: { [number]: (...any) -> ...any } } } = {}
if _G.__rovyCoverageTracker == nil then
	_G.__rovyCoverageTracker = coverageTracker
	_G.__rovyCoverageRegister = function(filePath: string, chunk: (...any) -> ...any): ()
		if _G.__rovyCoverageTracker[filePath] == nil then
			_G.__rovyCoverageTracker[filePath] = { chunks = {} }
		end
		table.insert(_G.__rovyCoverageTracker[filePath].chunks, chunk)
	end
	_G.__rovyCoverageReset = function(): ()
		_G.__rovyCoverageBaseline = {}
		for path, state in pairs(_G.__rovyCoverageTracker) do
			_G.__rovyCoverageBaseline[path] = lineCountsFromCoverage(luau.coverage(state.chunks[1]))
			for i = 2, #state.chunks do
				for line, count in pairs(lineCountsFromCoverage(luau.coverage(state.chunks[i]))) do
					_G.__rovyCoverageBaseline[path][line] = (_G.__rovyCoverageBaseline[path][line] or 0) + count
				end
			end
		end
	end
	_G.__rovyCoverageSummary = function(): { files: { [string]: { total: number, covered: number, percent: number, uncovered: { [number]: number } } }, total: number, covered: number, percent: number }
		local files = {}
		local totalLines = 0
		local coveredLines = 0
		for path, state in pairs(_G.__rovyCoverageTracker) do
			local baselines = (_G.__rovyCoverageBaseline and _G.__rovyCoverageBaseline[path]) or {}
			local current = {}
			local totals = {}
			local coveredLinesForFile = 0
			local totalLinesForFile = 0
			for _, chunk in ipairs(state.chunks) do
				for line, count in pairs(lineCountsFromCoverage(luau.coverage(chunk))) do
					current[line] = count
					totals[line] = true
				end
			end
			for line in pairs(current) do
				totalLinesForFile += 1
				if (current[line] - (baselines[line] or 0)) > 0 then
					coveredLinesForFile += 1
				end
			end
			local uncoveredLines = {}
			for line in pairs(totals) do
				if (current[line] or 0) - (baselines[line] or 0) <= 0 then
					table.insert(uncoveredLines, line)
				end
			end
			table.sort(uncoveredLines)
			files[path] = {
				total = totalLinesForFile,
				covered = coveredLinesForFile,
				percent = totalLinesForFile == 0 and 1 or coveredLinesForFile / totalLinesForFile,
				uncovered = uncoveredLines,
			}
			totalLines += totalLinesForFile
			coveredLines += coveredLinesForFile
		end
		return {
			files = files,
			total = totalLines,
			covered = coveredLines,
			percent = totalLines == 0 and 1 or coveredLines / totalLines,
		}
	end
	_G.__rovyCoverageInitialized = true
end

local function isUiInitSource(fsPath: string): boolean
	return fsPath:match("[/\\]packages[/\\]ui[/\\]out[/\\]init%.luau$") ~= nil
end

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

local function isLuauModule(node): boolean
	local file = rawget(node, "__file")
	return file ~= nil and (file:match("%.luau$") ~= nil or file:match("%.lua$") ~= nil)
end

-- The rovy-build package facade (out/init.luau) walks its own tree with
-- IsA/GetChildren, so nodes have to answer both to be loadable here.
function Node.IsA(self, className: string): boolean
	if className == "ModuleScript" then
		return isLuauModule(self)
	end
	if className == "Folder" then
		return not isLuauModule(self)
	end
	return className == "Instance"
end

-- `scan` registers each file twice (with and without its extension), so
-- dedupe by path or the facade would require every module twice.
function Node.GetChildren(self)
	local seen: { [string]: boolean } = {}
	local ordered = {}
	for _, child in rawget(self, "children") do
		local path = rawget(child, "__path")
		if not seen[path] then
			seen[path] = true
			table.insert(ordered, child)
		end
	end
	return ordered
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

local function newVector2(x, y)
	local vector = {}
	vector.X = x
	vector.Y = y
	vector.Magnitude = math.sqrt(x * x + y * y)
	function vector:add(other)
		return newVector2(self.X + other.X, self.Y + other.Y)
	end
	function vector:sub(other)
		return newVector2(self.X - other.X, self.Y - other.Y)
	end
	return setmetatable(vector, {
		__add = function(left, right)
			return newVector2(left.X + right.X, left.Y + right.Y)
		end,
		__sub = function(left, right)
			return newVector2(left.X - right.X, left.Y - right.Y)
		end,
	})
end

local function newVector3(x, y, z)
	local vector = {}
	vector.X = x
	vector.Y = y
	vector.Z = z
	vector.Magnitude = math.sqrt(x * x + y * y + z * z)
	return vector
end

local function newUDim2(xs, xo, ys, yo)
	local value = { X = { Scale = xs, Offset = xo }, Y = { Scale = ys, Offset = yo } }
	function value:sub(other)
		return newUDim2(
			self.X.Scale - other.X.Scale,
			self.X.Offset - other.X.Offset,
			self.Y.Scale - other.Y.Scale,
			self.Y.Offset - other.Y.Offset
		)
	end
	return setmetatable(value, {
		__sub = function(left, right)
			return newUDim2(
				left.X.Scale - right.X.Scale,
				left.X.Offset - right.X.Offset,
				left.Y.Scale - right.Y.Scale,
				left.Y.Offset - right.Y.Offset
			)
		end,
	})
end

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
function FakeInstance:GetDescendants()
	local out = {}
	local function walk(node)
		for _, child in ipairs(node:GetChildren()) do
			table.insert(out, child)
			walk(child)
		end
	end
	walk(self)
	return out
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
function FakeInstance:FindFirstChildWhichIsA(className)
	for _, child in ipairs(self:GetChildren()) do
		if child:IsA(className) then return child end
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
		AbsolutePosition = newVector2(0, 0),
		AbsoluteSize = newVector2(100, 100),
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
		Heartbeat = signal("RunService.Heartbeat"),
		Stepped = signal("RunService.Stepped"),
		-- @rovy/ui renders on the client, and package boundary providers ask
		-- RunService which side they are on. Answer, rather than leaving these
		-- missing and making every caller fall back to "unknown".
		IsClient = function()
			return true
		end,
		IsServer = function()
			return false
		end,
		IsStudio = function()
			return false
		end,
		IsRunning = function()
			return true
		end,
	},
	Players = (function()
		local localPlayer = newInstance("Player")
		localPlayer.Name = "LocalPlayer"
		localPlayer.Mouse = { Icon = "" }
		function localPlayer:GetMouse()
			return self.Mouse
		end
		function localPlayer:WaitForChild(name)
			return self:FindFirstChild(name)
		end
		local playerGui = newInstance("PlayerGui")
		playerGui.Parent = localPlayer
		return { LocalPlayer = localPlayer }
	end)(),
	AssetService = {
		CreatedEditableImages = {},
		FailCreate = false,
		CreateEditableImageCalls = 0,
		CreateEditableImage = function(self, options)
			self.CreateEditableImageCalls += 1
			if self.FailCreate then
				error("CreateEditableImage failed", 2)
			end
			local image = makeEditableImage(options and options.Size or { X = 512, Y = 512 })
			table.insert(self.CreatedEditableImages, image)
			return image
		end,
	},
	ReflectionService = {
		GetClasses = function()
			return {}
		end,
	},
}

-- Capturing `warn` shim. The retained-ui runtime warns (instead of throwing)
-- when a component's render() fails during a flush, so specs need `warn` to
-- exist and to be observable. `_G.__rovyWarnings` accumulates messages;
-- `_G.__rovyClearWarnings()` resets it (called from H.reset).
local warnLog = {}

local bufferApi = _G.buffer or fakeBuffer()

local fakeGlobals = {
	Color3 = {
		new = function(r, g, b)
			return { R = r, G = g, B = b }
		end,
		fromRGB = function(r, g, b)
			return { R = r / 255, G = g / 255, B = b / 255 }
		end,
	},
	vector = {
		create = function(x, y, z)
			return { x, y, z }
		end,
	},
	Vector2 = { new = newVector2 },
	Vector3 = { new = newVector3 },
	UDim2 = { new = newUDim2 },
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
	__rovyDrainTasks = drainTasks,
	__rovyPendingTasks = pendingTasks,
	__rovyClearTasks = clearTasks,
	__rovyWarnings = warnLog,
	__rovyClearWarnings = function()
		table.clear(warnLog)
	end,
	warn = function(...)
		local parts = {}
		for _, value in ipairs({ ... }) do
			table.insert(parts, tostring(value))
		end
		table.insert(warnLog, table.concat(parts, " "))
	end,
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

-- rovy-build writes this header at the top of every generated package facade
-- (see pluginFacadeLuau in packages/transformer/src/partition.ts).
local FACADE_MARKER = "-- Generated by rovy-build. Do not edit."

-- Shared first, matching the facade: boundary exports win on any key collision.
local FACADE_BOUNDARIES = { "shared", "server", "client" }

local loadFacade

local function loadModule(node): any
	local fsPath = rawget(node, "__file")
	assert(fsPath, "rovy imgui test harness: not a requirable module: " .. tostring(rawget(node, "__path")))
	local cached = moduleCache[fsPath]
	if cached ~= nil then
		return cached.value
	end
	moduleCache[fsPath] = { value = nil }

	local rawSource = fs.readFile(fsPath)
	if rawSource:sub(1, #FACADE_MARKER) == FACADE_MARKER then
		local value = loadFacade(fsPath)
		moduleCache[fsPath] = { value = value }
		return value
	end

	local src = rawSource
	if isUiInitSource(fsPath) and _G.__rovyCoverageTracker ~= nil then
		src = luau.compile(src, {
			coverage_level = 2,
		})
		assert(src ~= nil, "rovy imgui test harness: coverage compile failed for: " .. tostring(fsPath))
	else
		src = luau.compile(src, {})
	end
	local scriptNode = node
	if fsPath:match("[/\\]init%.luau$") or fsPath:match("[/\\]init%.lua$") then
		local dir = fsPath:match("^(.*)[/\\]init%.lua[u]?$")
		scriptNode = (dir and treeIndex(dir)) or node
	end
	rawset(sharedG, scriptNode, TS)

	local env = setmetatable({
		script = scriptNode,
		_G = sharedG,
		task = taskShim,
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
				local n = treeIndex(p) or treeIndex(p .. ".luau") or treeIndex(p .. ".lua") or treeIndex(p:gsub("%.luau$", ""):gsub("%.lua$", ""))
				if not n then
					if isFile(p .. ".luau") then
						n = scan(p .. ".luau")
					elseif isFile(p .. ".lua") then
						n = scan(p .. ".lua")
					else
						n = scan(p)
					end
					indexTree(n)
				end
				return loadModule(n)
			end
			return loadModule(target)
		end,
	}, { __index = sharedG })

	local chunk = luau.load(src, { chunk_name = fsPath, env = env })
	if isUiInitSource(fsPath) and _G.__rovyCoverageRegister ~= nil then
		_G.__rovyCoverageRegister(fsPath, chunk)
	end
	local value = chunk()
	moduleCache[fsPath] = { value = value }
	return value
end

-- The facade requires every module under a boundary, not just the ones its
-- init re-exports, so module-scope registration side effects still run.
local function requireTree(node)
	if isLuauModule(node) then
		loadModule(node)
	end
	for _, child in Node.GetChildren(node) do
		requireTree(child)
	end
end

-- A rovy-build package facade loads `shared` plus whichever single boundary
-- RunService reports. Zune has no `game`, so that check yields nothing and
-- every client-only and server-only export would be missing. Load them all.
function loadFacade(fsPath: string): any
	local dir = fsPath:match("^(.*)[/\\]init%.lua[u]?$")
	assert(dir, "rovy imgui test harness: facade outside a package dir: " .. fsPath)

	local exports = {}
	for _, boundary in FACADE_BOUNDARIES do
		local node = treeIndex(dir .. "/" .. boundary)
		if node ~= nil then
			requireTree(node)
			if isLuauModule(node) then
				local value = loadModule(node)
				if type(value) == "table" then
					for key, item in pairs(value) do
						exports[key] = item
					end
				end
			end
		end
	end
	return exports
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
	-- Cross-package integration specs pull in siblings @rovy/ui does not carry
	-- as a devDependency, so there is no node_modules link to follow.
	if n == nil and scope == "@rovy" then
		local sibling = ROOT .. "/../" .. moduleName
		if isDir(sibling) then
			n = scan(sibling)
			indexTree(n)
		end
	end
	assert(n, "rovy imgui test harness: module not found " .. scope .. "/" .. moduleName)
	return n
end

function TS.import(_context, module, ...)
	local target = module
	for _, name in { ... } do
		target = (target :: any)[name]
		assert(target ~= nil, "rovy imgui test harness: import miss at '" .. tostring(name) .. "'")
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
	assert(n, "rovy imgui test harness: no module at " .. relPath)
	return loadModule(n)
end

return TS
