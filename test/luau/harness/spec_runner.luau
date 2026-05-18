--!nocheck

local fs = zune.fs
local testing = zune.testing

local function isDir(path: string): boolean
	local ok, stat = pcall(fs.stat, path)
	return ok and stat ~= nil and stat.kind == "directory"
end

local function readDir(path: string): { string }
	local names = {}
	for _, entry in fs.entries(path) do
		table.insert(names, entry.name)
	end
	return names
end

type RunnerOptions = {
	runtimeModule: string?,
	loadPath: string?,
	specsDir: string?,
	specsRequirePrefix: string?,
	successMessage: string?,
	specHeaderFormat: string?,
}

local function run(options: RunnerOptions?)
	local opts = options or {}
	local runtimeModule = opts.runtimeModule or "./harness/runtime"
	local loadPath = opts.loadPath or "out/init"
	local specsDir = opts.specsDir or "test/specs"
	local specsRequirePrefix = opts.specsRequirePrefix or "./specs/"
	local successMessage = opts.successMessage or ("ok  harness loaded " .. loadPath)
	local specHeaderFormat = opts.specHeaderFormat or "── %s ──"
	local function expect(value: any)
		local matcher = testing.expect(value)
		if matcher and matcher.toBeUndefined == nil then
			matcher.toBeUndefined = matcher.toBeNil or function()
				matcher.toBe(nil)
			end
		end
		if matcher and matcher.never and matcher.never.toBeUndefined == nil then
			matcher.never.toBeUndefined = matcher.never.toBeNil or function()
				matcher.never.toBe(nil)
			end
		end
		return matcher
	end

	local t = {
		describe = testing.describe,
		it = testing.test,
		expect = expect,
	}

	local TS = require(runtimeModule)
	local ok, err = pcall(function()
		TS.loadPath(loadPath)
	end)
	if not ok then
		error("harness cannot load " .. loadPath .. ": " .. tostring(err))
	end
	print(successMessage)

	if isDir(specsDir) then
		local names = {}
		for _, entry in readDir(specsDir) do
			if entry:match("%.luau$") then
				table.insert(names, entry)
			end
		end
		table.sort(names)

		for _, entry in names do
			print("\n" .. string.format(specHeaderFormat, entry))
			require(specsRequirePrefix .. entry:gsub("%.luau$", ""))(TS, t)
		end
	end

end

return { run = run }
