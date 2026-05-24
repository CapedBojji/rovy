--!nocheck
local fs = zune.fs
local luau = zune.luau
local task = zune.task
local process = zune.process
local roblox = require("../../../../test/luau/harness/roblox")

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
	function Vector3:Lerp(other, alpha)
		return Vector3.new(
			self.X + (other.X - self.X) * alpha,
			self.Y + (other.Y - self.Y) * alpha,
			self.Z + (other.Z - self.Z) * alpha
		)
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

if _G.Vector2 == nil then
	local Vector2 = {}
	Vector2.__index = function(self, key)
		if key == "Magnitude" then
			return math.sqrt(self.X * self.X + self.Y * self.Y)
		end
		return Vector2[key]
	end
	Vector2.__add = function(a, b)
		return Vector2.new(a.X + b.X, a.Y + b.Y)
	end
	Vector2.__sub = function(a, b)
		return Vector2.new(a.X - b.X, a.Y - b.Y)
	end
	function Vector2.new(x, y)
		return setmetatable({ X = x or 0, Y = y or 0 }, Vector2)
	end
	_G.Vector2 = Vector2
end

if _G.UDim == nil then
	local UDim = {}
	UDim.__index = UDim
	function UDim.new(scale, offset)
		return setmetatable({ Scale = scale or 0, Offset = offset or 0 }, UDim)
	end
	_G.UDim = UDim
end

if _G.UDim2 == nil then
	local UDim2 = {}
	UDim2.__index = UDim2
	function UDim2.new(xScale, xOffset, yScale, yOffset)
		return setmetatable({
			X = _G.UDim.new(xScale, xOffset),
			Y = _G.UDim.new(yScale, yOffset),
		}, UDim2)
	end
	_G.UDim2 = UDim2
end

if _G.Instance == nil then
	local Instance = {}
	function Instance.new(className: string)
		local object = {
			ClassName = className,
			Name = className,
			Parent = nil,
			Destroyed = false,
			children = {},
		}
		function object:IsA(query: string)
			return self.ClassName == query or query == "Instance" or (query == "BasePart" and self.ClassName == "Part")
		end
		function object:Destroy()
			self.Destroyed = true
			self.Parent = nil
		end
		function object:FindFirstChild(_name: string)
			return nil
		end
		function object:FindFirstChildOfClass(_className: string)
			return nil
		end
		return object
	end
	_G.Instance = Instance
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
		ZIndexBehavior = {
			Sibling = "Sibling",
		},
		Font = {
			Code = "Code",
		},
		KeyCode = {
			R = "R",
			P = "P",
		},
	}
end

local HarnessVector3 = _G.Vector3
local HarnessVector2 = _G.Vector2
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

local ROOT = normalize((process.cwd() :: string):gsub("[/\\]+$", ""))
local REPO = normalize(ROOT .. "/../..")

local function newNode(path: string, className: string?)
	return setmetatable({ __path = normalize(path), __file = nil, __className = className or "Folder", children = {} }, Node)
end

local newSignal = roblox.createSignal

local function newRemote(path: string, name: string)
	local remote = newNode(path, "RemoteEvent")
	remote.Name = name
	remote.OnServerEvent = newSignal()
	remote.OnClientEvent = newSignal()
	function remote:FireServer(...)
		self.OnServerEvent:Fire(nil, ...)
	end
	function remote:FireClient(_player, ...)
		self.OnClientEvent:Fire(...)
	end
	function remote:FireAllClients(...)
		self.OnClientEvent:Fire(...)
	end
	return remote
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
ensureRoot("node_modules/@flamework")
ensureRepoRoot("packages/core")
ensureRepoRoot("packages/networking")
ensureRepoRoot("packages/ui")
ensureRepoRoot("packages/world-inspector")

local replicatedStorage = newNode(ROOT .. "/$services/ReplicatedStorage", "ReplicatedStorage")
replicatedStorage.children.TS = treeIndex(ROOT .. "/out/shared")
local networkingFolder = newNode(ROOT .. "/$services/ReplicatedStorage/RovyNetworking", "Folder")
replicatedStorage.children.RovyNetworking = networkingFolder
networkingFolder.children.ReliableClientToServer =
	newRemote(ROOT .. "/$services/ReplicatedStorage/RovyNetworking/ReliableClientToServer", "ReliableClientToServer")
networkingFolder.children.UnreliableClientToServer =
	newRemote(ROOT .. "/$services/ReplicatedStorage/RovyNetworking/UnreliableClientToServer", "UnreliableClientToServer")
networkingFolder.children.ReliableServerToClient =
	newRemote(ROOT .. "/$services/ReplicatedStorage/RovyNetworking/ReliableServerToClient", "ReliableServerToClient")
networkingFolder.children.UnreliableServerToClient =
	newRemote(ROOT .. "/$services/ReplicatedStorage/RovyNetworking/UnreliableServerToClient", "UnreliableServerToClient")
local serverScriptService = newNode(ROOT .. "/$services/ServerScriptService", "ServerScriptService")
serverScriptService.children.TS = treeIndex(ROOT .. "/out/server")
local starterPlayer = newNode(ROOT .. "/$services/StarterPlayer", "StarterPlayer")
local starterPlayerScripts = newNode(ROOT .. "/$services/StarterPlayer/StarterPlayerScripts", "StarterPlayerScripts")
starterPlayer.children.StarterPlayerScripts = starterPlayerScripts
starterPlayerScripts.children.TS = treeIndex(ROOT .. "/out/client")

local dataModelRoot = newNode(ROOT, "DataModel")
dataModelRoot.children.ReplicatedStorage = replicatedStorage
dataModelRoot.children.ServerScriptService = serverScriptService
dataModelRoot.children.StarterPlayer = starterPlayer
local workspace = newNode(ROOT .. "/$services/Workspace", "Workspace")
dataModelRoot.children.Workspace = workspace
indexTree(dataModelRoot)

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
local rovyJecs = treeIndex(REPO .. "/packages/jecs")
assert(rovyJecs, "rovy example harness: missing packages/jecs")
rovyScope.children.jecs = rovyJecs
local rovyCorePackage = treeIndex(REPO .. "/packages/core")
assert(rovyCorePackage, "rovy example harness: missing packages/core")
local rovyCore = treeIndex(REPO .. "/packages/core/out")
assert(rovyCore, "rovy example harness: missing packages/core/out")
rovyScope.children.core = rovyCorePackage
rovyScope.children["rovy-core"] = rovyCore
local rovyNetworking = treeIndex(REPO .. "/packages/networking")
assert(rovyNetworking, "rovy example harness: missing packages/networking")
rovyScope.children.networking = rovyNetworking
local rovyUi = treeIndex(REPO .. "/packages/ui")
assert(rovyUi, "rovy example harness: missing packages/ui")
rovyScope.children.ui = rovyUi
local rovyWorldInspector = treeIndex(REPO .. "/packages/world-inspector")
assert(rovyWorldInspector, "rovy example harness: missing packages/world-inspector")
rovyScope.children["world-inspector"] = rovyWorldInspector

local textService = {
	GetTextSize = function(_self, text, _textSize, _font, _bounds)
		return _G.Vector2.new((tostring(text):len()) * 7, 16)
	end,
}

local localPlayerGui = _G.Instance.new("PlayerGui")
local localPlayer = {
	UserId = 999,
	Name = "LocalPlayer",
	DisplayName = "LocalPlayer",
	PlayerGui = localPlayerGui,
	Character = nil,
	CharacterAdded = newSignal(),
	CharacterRemoving = newSignal(),
	WaitForChild = function(self, name)
		return self[name]
	end,
	GetMouse = function(_self)
		return {
			Hit = {
				Position = _G.Vector3.new(),
			},
		}
	end,
}

local playersService = {
	LocalPlayer = localPlayer,
	PlayerAdded = newSignal(),
	PlayerRemoving = newSignal(),
	GetPlayers = function(_self)
		return {}
	end,
}

local userInputService = {
	InputBegan = newSignal(),
}

local guiService = {
	GetGuiInset = function(_self)
		return _G.Vector2.new(0, 0)
	end,
}

local gameObject = roblox.createGame({
	ReplicatedStorage = replicatedStorage,
	ServerScriptService = serverScriptService,
	StarterPlayer = starterPlayer,
	Workspace = workspace,
	TextService = textService,
	Players = playersService,
	UserInputService = userInputService,
	GuiService = guiService,
})
gameObject.ReplicatedStorage = replicatedStorage
gameObject.ServerScriptService = serverScriptService
gameObject.StarterPlayer = starterPlayer
gameObject.Workspace = workspace
gameObject.TextService = textService
gameObject.Players = playersService
gameObject.UserInputService = userInputService
gameObject.GuiService = guiService

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
		Vector2 = HarnessVector2,
		CFrame = HarnessCFrame,
		Color3 = HarnessColor3,
		UDim = _G.UDim,
		UDim2 = _G.UDim2,
		Enum = HarnessEnum,
		Instance = _G.Instance,
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
	moduleCache[fsPath] = { value = value }
	return value
end

function TS.getModule(_context, scope: string, moduleName: string)
	if scope == "@rovy" and moduleName == "rovy-core" then
		return rovyCore
	end
	if scope == "@rovy" then
		local n = rovyScope.children[moduleName]
		assert(n, "rovy example harness: module not found " .. scope .. "/" .. moduleName)
		return n
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
	if not n and relPath:sub(1, 10) == "$services/" then
		local target = dataModelRoot
		for segment in relPath:gmatch("[^/]+") do
			if segment == "$services" then
				continue
			end
			target = target and target[segment]
		end
		n = target
	end
	assert(n, "rovy example harness: no module at " .. relPath)
	return loadModule(n)
end

return TS
