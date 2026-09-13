-- Shared kernel execution and payload ownership rules; no Roblox services required.
local Kernel = {}

function Kernel.call(callback, ...)
	local thread = coroutine.create(callback)
	local ok, result = coroutine.resume(thread, ...)
	if coroutine.status(thread) ~= "dead" then
		pcall(task.cancel, thread)
		pcall(coroutine.close, thread)
		return false, "parallel callbacks must not yield"
	end
	return ok, result
end

function Kernel.run(definition, state, input, output)
	table.clear(output)
	-- A suspended kernel would let another message reuse its worker-local state.
	-- Detect suspension before publishing anything; never resume that coroutine.
	local ok, message = Kernel.call(definition.run, definition, input, output, state)
	if not ok then return false, tostring(message) end
	for i = 1, input.count do
		if output[i] == nil then return false, "job must write one non-nil output per row" end
	end
	return true
end

function Kernel.snapshot(value, seen)
	local kind = typeof(value)
	if kind == "function" or kind == "thread" then error("[rovy/parallel] functions and threads cannot cross Actors", 0) end
	if kind == "SharedTable" then
		assert(SharedTable.isFrozen(value), "[rovy/parallel] SharedTable inputs must be frozen")
		seen = seen or {}
		if seen[value] then return value end
		seen[value] = true
		for _, child in value do
			if typeof(child) == "SharedTable" then Kernel.snapshot(child, seen) end
		end
		return value
	end
	if kind == "buffer" then
		local copy = buffer.create(buffer.len(value))
		buffer.copy(copy, 0, value)
		return copy
	end
	if kind ~= "table" then return value end
	assert(getmetatable(value) == nil, "[rovy/parallel] send data values, not class instances or metatables")
	seen = seen or {}
	assert(not seen[value], "[rovy/parallel] cyclic input tables are unsupported")
	seen[value] = true
	local copy = {}
	for key, child in value do
		assert(type(key) == "string" or type(key) == "number", "[rovy/parallel] input keys must be strings or numbers")
		copy[key] = Kernel.snapshot(child, seen)
	end
	seen[value] = nil
	return copy
end

return Kernel
