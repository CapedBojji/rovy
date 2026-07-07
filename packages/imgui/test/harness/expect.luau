--!nocheck

local state = { passed = 0, failed = 0, failures = {} :: { string }, stack = {} :: { string } }

local function path(): string
	return table.concat(state.stack, " > ")
end

local function describe(name: string, fn: () -> ())
	table.insert(state.stack, name)
	fn()
	table.remove(state.stack)
end

local function it(name: string, fn: () -> ())
	table.insert(state.stack, name)
	local ok, err = pcall(fn)
	if ok then
		state.passed += 1
		print("  ok  " .. path())
	else
		state.failed += 1
		local msg = path() .. "\n        " .. tostring(err)
		table.insert(state.failures, msg)
		print("FAIL  " .. path() .. "  - " .. tostring(err))
	end
	table.remove(state.stack)
end

local function expect(value: any)
	return {
		toBe = function(exp)
			if value ~= exp then
				error(string.format("expected %s to be %s", tostring(value), tostring(exp)), 2)
			end
		end,
		toBeDefined = function()
			if value == nil then
				error("expected value to be defined", 2)
			end
		end,
		toThrow = function()
			local ok = pcall(value)
			if ok then
				error("expected function to throw", 2)
			end
		end,
		toBeTruthy = function()
			if not value then
				error("expected truthy, got " .. tostring(value), 2)
			end
		end,
	}
end

local function report(): number
	print(string.format("\n%d passed, %d failed", state.passed, state.failed))
	return state.failed
end

return { describe = describe, it = it, expect = expect, report = report }
