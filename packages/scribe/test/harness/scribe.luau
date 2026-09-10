--!nocheck

local M = {}

function M.load(TS, boundary)
	local result = {}
	local function merge(value)
		if type(value) ~= "table" then return end
		for key, item in value do
			result[key] = item
		end
	end
	merge(TS.loadPath("out/shared/init"))
	if boundary ~= nil then
		merge(TS.loadPath("out/" .. boundary .. "/init"))
	end
	return result
end

function M.nativeModule(version)
	local created = {}
	local sinks = {}
	local configured = {}
	local declaratorCalls = {}
	local module = {
		Version = version or "2.3.0",
		Datatypes = {},
		OnStatusChanged = {},
		OnIssue = {},
		__declaratorCalls = declaratorCalls,
	}
	local function declarator(name)
		module[name] = function(...)
			local args = { ... }
			local marker = {
				NativeKind = name,
				Default = args[1],
				Meta = args[2],
			}
			table.insert(declaratorCalls, {
				name = name,
				args = args,
				result = marker,
			})
			return marker
		end
	end
	for _, name in {
		"ServerOnly", "Shared", "Session",
		"Int", "Number", "String", "Enum", "Timed", "Dynamic", "Optional",
		"ArrayOf", "DictOf",
		"Vector3", "Vector2", "Vector3int16", "Vector2int16", "CFrame",
		"Color3", "BrickColor", "UDim", "UDim2", "Rect", "NumberRange",
		"NumberSequence", "ColorSequence", "DateTime", "EnumItem", "Font",
		"PhysicalProperties",
	} do
		declarator(name)
	end
	module.new = function(options)
		local sequence = #created + 1
		local bundle = {
			options = options,
			Client = { sequence = sequence, boundary = "client" },
			Server = { sequence = sequence, boundary = "server" },
		}
		table.insert(created, bundle)
		return bundle
	end
	module.GetStatus = function()
		return "Healthy"
	end
	module.AddLogSink = function(sink)
		table.insert(sinks, sink)
	end
	module.GetRecentLogs = function()
		return {}
	end
	module.GetMetrics = function()
		return { Bundles = #created }
	end
	module.Configure = function(config)
		table.insert(configured, config)
	end
	return module, created, sinks, configured
end

function M.sysClass(runFn)
	local C = {}
	C.__index = C
	C.new = function()
		return setmetatable({}, C)
	end
	C.run = function(self, ...)
		return runFn(self, ...)
	end
	return C
end

function M.registerData(scribe, id, name)
	return scribe.rovyScribe:__data({
		id = id,
		name = name or id,
		profileStoreIndex = name or id,
		profileKeyPrefix = "PLAYER_",
		template = { Coins = 0 },
		options = {},
	})
end

return M
