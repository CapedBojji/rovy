--!nocheck
local fs = require("@lune/fs")
local luau = require("@lune/luau")
local task = require("@lune/task")
local process = require("@lune/process")

local TS = {}
local moduleCache: { [string]: { value: any } } = {}
local nodeByPath: { [string]: any } = {}

if _G.Vector3 == nil then
	local Vector3 = {}
	Vector3.__index = function(self, key)
		if key == "Magnitude" then
			return math.sqrt(self.X * self.X + self.Y * self.Y + self.Z * self.Z)
		end
		return Vector3[key]
	end
	Vector3.__add = function(a, b)
		return Vector3.new(a.X + b.X, a.Y + b.Y, a.Z + b.Z)
	end
	Vector3.__sub = function(a, b)
		return Vector3.new(a.X - b.X, a.Y - b.Y, a.Z - b.Z)
	end
	Vector3.__mul = function(a, b)
		if type(a) == "number" then
			return Vector3.new(a * b.X, a * b.Y, a * b.Z)
		elseif type(b) == "number" then
			return Vector3.new(a.X * b, a.Y * b, a.Z * b)
		end
		error("Vector3.__mul expects number", 2)
	end
	Vector3.__div = function(a, b)
		return Vector3.new(a.X / b, a.Y / b, a.Z / b)
	end
	Vector3.__tostring = function(self)
		return string.format("Vector3(%s, %s, %s)", tostring(self.X), tostring(self.Y), tostring(self.Z))
	end
	function Vector3.new(x, y, z)
		return setmetatable({
			X = x or 0,
			Y = y or 0,
			Z = z or 0,
		}, Vector3)
	end
	function Vector3:add(other)
		return self + other
	end
	function Vector3:sub(other)
		return self - other
	end
	function Vector3:mul(value)
		return self * value
	end
	function Vector3:div(value)
		return self / value
	end
	_G.Vector3 = Vector3
end

if _G.CFrame == nil then
	local CFrame = {}
	CFrame.__index = CFrame
	CFrame.__tostring = function()
		return "CFrame"
	end
	function CFrame.new(x, y, z)
		local position
		if type(x) == "table" and x.X ~= nil then
			position = x
		else
			position = _G.Vector3.new(x or 0, y or 0, z or 0)
		end
		return setmetatable({
			Position = position,
			LookVector = _G.Vector3.new(0, 0, -1),
		}, CFrame)
	end
	function CFrame.Angles(_x, _y, _z)
		return CFrame.new()
	end
	_G.CFrame = CFrame
end

if _G.Color3 == nil then
	local Color3 = {}
	function Color3.fromRGB(r, g, b)
		return { R = r, G = g, B = b }
	end
	_G.Color3 = Color3
end

if _G.Enum == nil then
	_G.Enum = {
		Material = {
			Metal = "Metal",
			SmoothPlastic = "SmoothPlastic",
			Neon = "Neon",
		},
		SurfaceType = {
			Smooth = "Smooth",
		},
		KeyCode = {
			R = "R",
		},
	}
end

local HarnessVector3 = _G.Vector3
local HarnessCFrame = _G.CFrame
local HarnessColor3 = _G.Color3
local HarnessEnum = _G.Enum

local Node = {}

local function normalize(path: string): string
	local parts = {}
	for part in path:gmatch("[^/\\]+") do
		if part == ".." then
			table.remove(parts)
		elseif part ~= "." and part ~= "" then
			table.insert(parts, part)
		end
	end
	return "/" .. table.concat(parts, "/")
end

local ROOT = normalize((process.cwd :: string):gsub("[/\\]+$", ""))
local REPO = normalize(ROOT .. "/../..")

local function newNode(path: string, className: string?)
	return setmetatable({ __path = normalize(path), __file = nil, __className = className or "Folder", children = {} }, Node)
end

local function scan(path: string): any
	path = normalize(path)
	local node = newNode(path)
	if fs.isFile(path) then
		node.__file = path
		node.__className = "ModuleScript"
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
			local child = node.children[entry] or newNode(childPath, "ModuleScript")
			child.__file = childPath
			child.__className = "ModuleScript"
			node.children[entry] = child
			local stem = entry:match("^(.*)%.luau$") or entry:match("^(.*)%.lua$")
			if stem and not node.children[stem] then
				local stemNode = newNode(childPath, "ModuleScript")
				stemNode.__file = childPath
				stemNode.__className = "ModuleScript"
				node.children[stem] = stemNode
			end
		end
	end
	local init = node.children["init"]
	if init and init.__file then
		node.__file = init.__file
		node.__className = "ModuleScript"
	end
	return node
end

local function indexTree(node)
	nodeByPath[node.__path] = node
	for _, child in node.children do
		indexTree(child)
	end
end

local roots: { [string]: any } = {}
local function ensureRoot(rel: string)
	if not roots[rel] then
		roots[rel] = scan(ROOT .. "/" .. rel)
		indexTree(roots[rel])
	end
	return roots[rel]
end

local function ensureRepoRoot(rel: string)
	local key = "repo:" .. rel
	if not roots[key] then
		roots[key] = scan(REPO .. "/" .. rel)
		indexTree(roots[key])
	end
	return roots[key]
end

local function treeIndex(path: string)
	return nodeByPath[normalize(path)]
end

Node.__index = function(self, key: string)
	local method = rawget(Node, key)
	if method ~= nil then
		return method
	end
	local kids = rawget(self, "children")
	if kids and kids[key] ~= nil then
		return kids[key]
	end
	if key == "Parent" then
		local p = (rawget(self, "__path") :: string):match("^(.*)/[^/]+$")
		return p and treeIndex(p) or nil
	end
	return nil
end

function Node.FindFirstChild(self, name: string)
	return rawget(self, "children")[name]
end

function Node.WaitForChild(self, name: string)
	local child = rawget(self, "children")[name]
	assert(child ~= nil, "WaitForChild miss: " .. tostring(name) .. " under " .. tostring(rawget(self, "__path")))
	return child
end

function Node.IsA(self, className: string)
	return rawget(self, "__className") == className
end

function Node.GetDescendants(self)
	local out = {}
	local function visit(node)
		for _, child in rawget(node, "children") do
			table.insert(out, child)
			visit(child)
		end
	end
	visit(self)
	return out
end

ensureRoot("out")
ensureRoot("node_modules/@rbxts")
ensureRoot("node_modules/@flamework")
ensureRepoRoot("packages/core")

local replicatedStorage = newNode(ROOT .. "/$services/ReplicatedStorage", "ReplicatedStorage")
replicatedStorage.children.TS = treeIndex(ROOT .. "/out/shared")
local serverScriptService = newNode(ROOT .. "/$services/ServerScriptService", "ServerScriptService")
serverScriptService.children.TS = treeIndex(ROOT .. "/out/server")
local starterPlayer = newNode(ROOT .. "/$services/StarterPlayer", "StarterPlayer")
local starterPlayerScripts = newNode(ROOT .. "/$services/StarterPlayer/StarterPlayerScripts", "StarterPlayerScripts")
starterPlayer.children.StarterPlayerScripts = starterPlayerScripts
starterPlayerScripts.children.TS = treeIndex(ROOT .. "/out/client")

local rbxtsInclude = newNode(ROOT .. "/$services/ReplicatedStorage/rbxts_include")
replicatedStorage.children.rbxts_include = rbxtsInclude
local runtimeLib = newNode(ROOT .. "/$services/ReplicatedStorage/rbxts_include/RuntimeLib", "ModuleScript")
runtimeLib.__runtimeLib = true
rbxtsInclude.children.RuntimeLib = runtimeLib
local nodeModules = newNode(ROOT .. "/$services/ReplicatedStorage/rbxts_include/node_modules")
rbxtsInclude.children.node_modules = nodeModules
local rbxtsScope = treeIndex(ROOT .. "/node_modules/@rbxts")
assert(rbxtsScope, "rovy example harness: missing node_modules/@rbxts")
nodeModules.children["@rbxts"] = rbxtsScope
local flameworkScope = treeIndex(ROOT .. "/node_modules/@flamework")
assert(flameworkScope, "rovy example harness: missing node_modules/@flamework")
nodeModules.children["@flamework"] = flameworkScope
local rovyScope = newNode(ROOT .. "/$services/ReplicatedStorage/rbxts_include/node_modules/@rovy")
nodeModules.children["@rovy"] = rovyScope
local rovyCore = treeIndex(REPO .. "/packages/core/out")
assert(rovyCore, "rovy example harness: missing packages/core/out")
rovyScope.children["rovy-core"] = rovyCore

local gameObject = {}
function gameObject:GetService(name: string)
	if name == "ReplicatedStorage" then
		return replicatedStorage
	elseif name == "ServerScriptService" then
		return serverScriptService
	elseif name == "StarterPlayer" then
		return starterPlayer
	end
	error("unknown fake service: " .. name)
end

local sharedG = setmetatable({}, { __index = _G })

local function loadModule(node): any
	if rawget(node, "__runtimeLib") then
		return TS
	end
	local fsPath = rawget(node, "__file")
	assert(fsPath, "rovy example harness: not a ModuleScript: " .. tostring(rawget(node, "__path")))
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
		game = gameObject,
		task = task,
		Vector3 = HarnessVector3,
		CFrame = HarnessCFrame,
		Color3 = HarnessColor3,
		Enum = HarnessEnum,
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
				local n = treeIndex(p) or treeIndex((p:gsub("%.luau$", ""):gsub("%.lua$", "")))
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

function TS.getModule(_context, scope: string, moduleName: string)
	if scope == "@rovy" and moduleName == "rovy-core" then
		return rovyCore
	end
	if scope == "@rbxts" then
		local scopeNode = ensureRoot("node_modules/@rbxts")
		local n = scopeNode.children[moduleName]
		assert(n, "rovy example harness: module not found " .. scope .. "/" .. moduleName)
		return n
	end
	local scopeNode = ensureRoot("node_modules/" .. scope)
	local n = scopeNode.children[moduleName]
	assert(n, "rovy example harness: module not found " .. scope .. "/" .. moduleName)
	return n
end

function TS.import(_context, module, ...)
	local target = module
	for _, name in { ... } do
		target = (target :: any)[name]
		assert(target ~= nil, "rovy example harness: import miss at '" .. tostring(name) .. "'")
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
	assert(n, "rovy example harness: no module at " .. relPath)
	return loadModule(n)
end

return TS
