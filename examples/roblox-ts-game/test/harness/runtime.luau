--!nocheck
local fs = zune.fs
local luau = zune.luau
local task = zune.task
local process = zune.process
local roblox = require("../../../../tests/luau/harness/roblox")

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

local TS = {}
local moduleCache: { [string]: { value: any } } = {}
local nodeByPath: { [string]: any } = {}

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

local ROOT = normalize((process.cwd() :: string):gsub("[/\\]+$", ""))
local REPO = normalize(ROOT .. "/../..")

local function newNode(path: string, className: string?)
	return setmetatable({ __path = normalize(path), __file = nil, __className = className or "Folder", children = {} }, Node)
end

local function scan(path: string): any
	path = normalize(path)
	local node = newNode(path)
	if isFile(path) then
		node.__file = path
		node.__className = "ModuleScript"
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
	elseif packageMainPath ~= nil and isFile(packageMainPath) then
		node.__file = packageMainPath
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
ensureRepoRoot("packages/core")
ensureRepoRoot("examples/plugin-example")

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
local rovyScope = newNode(ROOT .. "/$services/ReplicatedStorage/rbxts_include/node_modules/@rovy")
nodeModules.children["@rovy"] = rovyScope
local rovyJecs = treeIndex(REPO .. "/packages/jecs")
assert(rovyJecs, "rovy example harness: missing packages/jecs")
rovyScope.children.jecs = rovyJecs
local rovyCore = treeIndex(REPO .. "/packages/core/out")
assert(rovyCore, "rovy example harness: missing packages/core/out")
rovyScope.children["rovy-core"] = rovyCore
local corePackage = newNode(ROOT .. "/$services/ReplicatedStorage/rbxts_include/node_modules/@rovy/core")
corePackage.children.out = rovyCore
rovyScope.children["core"] = corePackage
local gameClockPlugin = treeIndex(REPO .. "/examples/plugin-example/out")
assert(gameClockPlugin, "rovy example harness: missing examples/plugin-example")
local gameClockPackage = newNode(ROOT .. "/$services/ReplicatedStorage/rbxts_include/node_modules/@rovy/example-gameclock")
gameClockPackage.children.out = gameClockPlugin
rovyScope.children["example-gameclock"] = gameClockPackage

local gameObject = roblox.createGame({
	ReplicatedStorage = replicatedStorage,
	ServerScriptService = serverScriptService,
	StarterPlayer = starterPlayer,
})

local sharedG = setmetatable({}, { __index = _G })

local function loadModule(node): any
	if rawget(node, "__runtimeLib") then
		return TS
	end
	local fsPath = rawget(node, "__file")
	assert(fsPath, "rovy example harness: not a ModuleScript: " .. tostring(rawget(node, "__path")))
	local shouldCache = string.find(fsPath, "/examples/plugin-example/out/", 1, true) == nil
	if shouldCache then
		local cached = moduleCache[fsPath]
		if cached ~= nil then
			return cached.value
		end
		moduleCache[fsPath] = { value = nil }
	end

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

	local chunk = luau.load(luau.compile(src), { chunk_name = fsPath, env = env })
	local value = chunk()
	if shouldCache then
		moduleCache[fsPath] = { value = value }
	end
	return value
end

function TS.getModule(_context, scope: string, moduleName: string)
	if scope == "@rovy" and moduleName == "rovy-core" then
		return rovyCore
	end
	if scope == "@rovy" and moduleName == "jecs" then
		return rovyJecs
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
