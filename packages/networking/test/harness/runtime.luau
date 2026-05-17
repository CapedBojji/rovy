--!nocheck
-- roblox-ts RuntimeLib emulation for @rovy/networking specs under Lune.
-- Same approach as packages/core/test/harness/runtime.luau, extended so
-- networking can load the compiled @rovy/core package (and its @rbxts/jecs
-- dependency) the way roblox-ts emits cross-package getModule(...) calls.

local fs = require("@lune/fs")
local luau = require("@lune/luau")
local task = require("@lune/task")
local process = require("@lune/process")

local ROOT = (process.cwd :: string):gsub("[/\\]+$", "")
local CORE = ROOT .. "/../core"

local TS = {}
local moduleCache: { [string]: { value: any } } = {}

local Node = {}

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

local roots: { [string]: any } = {}
local function ensureRoot(absPath: string)
	if not roots[absPath] then
		local n = scan(absPath)
		roots[absPath] = n
		indexTree(n)
	end
	return roots[absPath]
end

ensureRoot(ROOT .. "/out")

local sharedG = setmetatable({}, { __index = _G })

local function loadModule(node): any
	local fsPath = rawget(node, "__file")
	assert(fsPath, "rovy net test harness: not a requirable module: " .. tostring(rawget(node, "__path")))
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
	}, { __index = _G })

	local chunk = luau.load(src, { debugName = fsPath, environment = env })
	local value = chunk()
	moduleCache[fsPath] = { value = value }
	return value
end

-- roblox-ts flattens scoped packages to "<scope-without-@>-<name>" instance
-- names. Map those back to the on-disk node_modules layout.
local function moduleDir(scope: string, moduleName: string): string
	if scope == "@rovy" then
		if moduleName == "rovy-core" then
			return CORE
		end
		if moduleName == "rovy-networking" then
			return ROOT
		end
		return ROOT .. "/node_modules/@rovy/" .. moduleName
	end
	if scope == "@rbxts" then
		local here = ROOT .. "/node_modules/@rbxts/" .. moduleName
		if fs.isDir(here) then
			return here
		end
		return CORE .. "/node_modules/@rbxts/" .. moduleName
	end
	return ROOT .. "/node_modules/" .. scope .. "/" .. moduleName
end

function TS.getModule(_context, scope: string, moduleName: string)
	local dir = moduleDir(scope, moduleName)
	local node = ensureRoot(dir)
	-- A package root is requirable via its "main"; roblox-ts output is `out`.
	if rawget(node, "__file") == nil and node.children["out"] ~= nil then
		return node.children["out"]
	end
	return node
end

function TS.import(_context, module, ...)
	local target = module
	for _, name in { ... } do
		target = (target :: any)[name]
		assert(target ~= nil, "rovy net test harness: import miss at '" .. tostring(name) .. "'")
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
	assert(n, "rovy net test harness: no module at " .. relPath)
	return loadModule(n)
end

return TS
