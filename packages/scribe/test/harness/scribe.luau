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
	local module = {
		Version = version or "1.0.10",
		Datatypes = {},
		OnStatusChanged = {},
		OnIssue = {},
	}
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
	function module:GetStatus()
		return "Healthy"
	end
	function module:AddLogSink(sink)
		table.insert(sinks, sink)
	end
	function module:GetRecentLogs()
		return {}
	end
	function module:GetMetrics()
		return { Bundles = #created }
	end
	return module, created, sinks
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
