--!nocheck
-- Spec helpers: build fake `@netEvent` classes + registry metadata without
-- the transformer. roblox-ts classes are tables used as the instance
-- metatable, which is exactly what NetRuntime.metaForEvent / NetCodec rely on.

local M = {}

-- Define a class whose `.new(...)` assigns positional args to `fields`.
function M.eventClass(fields: { string })
	local C = {}
	C.__index = C
	function C.new(...)
		local args = { ... }
		local self = setmetatable({}, C)
		for i, name in fields do
			self[name] = args[i]
		end
		return self
	end
	return C
end

function M.reg(ctor, opts)
	return {
		ctor = ctor,
		id = opts.id or opts.name,
		name = opts.name,
		direction = opts.direction,
		channel = opts.channel or "reliable",
		receive = opts.receive or "send",
		fields = opts.fields,
		blink = opts.blink,
	}
end

function M.fnReg(ctor, resultCtor, opts)
	return {
		ctor = ctor,
		id = opts.id or opts.name,
		name = opts.name,
		direction = opts.direction or "clientToServer",
		fields = opts.fields,
		result = resultCtor,
		resultName = opts.resultName or "Result",
		resultFields = opts.resultFields,
		requestName = opts.requestName or (opts.name .. "Request"),
		resultWireName = opts.resultWireName or (opts.name .. "Result"),
		requestBlink = opts.requestBlink,
		resultBlink = opts.resultBlink,
	}
end

-- Minimal Commands stand-in capturing send/trigger calls.
function M.commands()
	local rec = { sent = {}, triggered = {} }
	function rec:send(e)
		table.insert(self.sent, e)
	end
	function rec:trigger(e)
		table.insert(self.triggered, e)
	end
	return rec
end

return M
