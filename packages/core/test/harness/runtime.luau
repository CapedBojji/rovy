--!nocheck
-- Minimal roblox-ts RuntimeLib emulation for running compiled `out/` Luau
-- under Zune without Roblox Studio. Implements only what roblox-ts emits for
-- the rovy core: `local TS = _G[script]`, `TS.import`, `TS.getModule`, and a
-- filesystem-backed fake-Instance tree. Promise/generator/try are intentionally
-- unsupported — core code must not depend on them (enforced by build).
--
-- Zune `zune.fs` is async (coroutine-yielding). Yielding inside an `__index`
-- metamethod (which roblox-ts triggers via node indexing) crashes with
-- "attempt to yield across metamethod/C-call boundary". So the module tree is
-- pre-scanned ONCE here (normal context); `__index` is pure table lookup.

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

-- Tree node: { __path, __file (resolvable module file or nil), children = {name=node} }
local Node = {}

local function newNode(path: string)
	return setmetatable({ __path = path, __file = nil, children = {} }, Node)
end

-- Eagerly scan a directory subtree into Node form. Pure table structure after.
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
			local child = scan(childPath)
			node.children[entry] = child
		elseif isFile(childPath) then
			-- expose both "foo.luau" and "foo" (roblox-ts indexes without ext)
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
	-- dir with init.luau/init.lua is itself requirable
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

-- Pre-scanned roots. Add deps here as the runtime grows.
local roots: { [string]: any } = {}
local function ensureRoot(rel: string)
	if not roots[rel] then
		roots[rel] = scan(ROOT .. "/" .. rel)
	end
	return roots[rel]
end
ensureRoot("out")
ensureRoot("node_modules/@rbxts")

-- Resolve an absolute fs path back to its scanned node (for Parent walks).
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

local sharedG = setmetatable({}, { __index = _G })

local function loadModule(node): any
	local fsPath = rawget(node, "__file")
	assert(fsPath, "rovy test harness: not a requirable module: " .. tostring(rawget(node, "__path")))
	local cached = moduleCache[fsPath]
	if cached ~= nil then
		return cached.value
	end
	-- placeholder to break require cycles
	moduleCache[fsPath] = { value = nil }

	local src = fs.readFile(fsPath)

	-- roblox-ts folder convention: a module emitted as `X/init.luau` runs with
	-- `script` = the folder node X (siblings = its children). A non-init module
	-- `X/foo.luau` runs with `script` = the file node (siblings via Parent).
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
				-- normalize ./ and ../ minimally
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
					-- lazily scan unseen path (normal context, safe)
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
	moduleCache[fsPath] = { value = value }
	return value
end

function TS.getModule(_context, scope: string, moduleName: string)
	local scopeNode = ensureRoot("node_modules/" .. scope)
	indexTree(scopeNode)
	local n = scopeNode.children[moduleName]
	assert(n, "rovy test harness: module not found " .. scope .. "/" .. moduleName)
	return n
end

function TS.import(_context, module, ...)
	local target = module
	for _, name in { ... } do
		target = (target :: any)[name]
		assert(target ~= nil, "rovy test harness: import miss at '" .. tostring(name) .. "'")
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

--- Load a compiled module by repo-relative path (e.g. "out/init"). Returns exports.
function TS.loadPath(relPath: string)
	local n = treeIndex(ROOT .. "/" .. relPath)
		or treeIndex(ROOT .. "/" .. relPath .. ".luau")
	assert(n, "rovy test harness: no module at " .. relPath)
	return loadModule(n)
end

return TS
