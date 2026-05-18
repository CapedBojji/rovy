--!nocheck

local fs = require("@lune/fs")
local luau = require("@lune/luau")
local task = require("@lune/task")
local process = require("@lune/process")

local ROOT = (process.cwd :: string):gsub("[/\\]+$", "")

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
	if fs.isFile(path) then
		node.__file = path
		return node
	end
	if not fs.isDir(path) then
		return node
	end
	for _, entry in fs.readDir(path) do
		local childPath = path .. "/" .. entry
		if fs.isDir(childPath) then
			node.children[entry] = scan(childPath)
		elseif fs.isFile(childPath) then
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

local function signal()
	return {
		Connect = function(_self, _fn)
			return { Disconnect = function() end }
		end,
	}
end

local FakeInstance = {}
FakeInstance.__index = function(self, key)
	local value = rawget(FakeInstance, key)
	if value ~= nil then
		return value
	end
	local events = rawget(self, "__events")
	if events[key] == nil then
		events[key] = signal()
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
function FakeInstance:IsA(className)
	return self.ClassName == className or className == "Instance" or (className == "GuiObject" and self.__isGui)
end
function FakeInstance:Destroy()
	self.Destroyed = true
	for _, child in ipairs(self.__children) do
		child:Destroy()
	end
	self.__children = {}
end
function FakeInstance:GetChildren()
	return self.__children
end
function FakeInstance:FindFirstChild(name)
	for _, child in ipairs(self.__children) do
		if child.Name == name then return child end
	end
	return nil
end
function FakeInstance:FindFirstChildOfClass(className)
	for _, child in ipairs(self.__children) do
		if child.ClassName == className then return child end
	end
	return nil
end
function FakeInstance:SetAttribute(name, value)
	self.__attributes[name] = value
end
function FakeInstance:GetAttribute(name)
	return self.__attributes[name]
end

local function newInstance(className)
	return setmetatable({
		ClassName = className,
		Name = className,
		__children = {},
		__events = {},
		__attributes = {},
		__isGui = true,
		LayoutOrder = 0,
		AbsolutePosition = { X = 0, Y = 0 },
		AbsoluteSize = { X = 100, Y = 100 },
		Visible = true,
	}, FakeInstance)
end

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
	Enum = setmetatable({}, {
		__index = function(_, enumName)
			return setmetatable({}, {
				__index = function(_, itemName)
					return tostring(enumName) .. "." .. tostring(itemName)
				end,
			})
		end,
	}),
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

	local chunk = luau.load(src, { debugName = fsPath, environment = env })
	local value = chunk()
	moduleCache[fsPath] = { value = value }
	return value
end

function TS.getModule(_context, scope: string, moduleName: string)
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
