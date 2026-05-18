--!nocheck

local fs = zune.fs
local process = zune.process
local testing = zune.testing

type RunnerOptions = {
	runtimeModule: string?,
	loadPath: string?,
	specsDir: string?,
	specsRequirePrefix: string?,
	successMessage: string?,
	specHeaderFormat: string?,
}

local function run(options: RunnerOptions?): number
	local opts = options or {}
	local runtimeModule = opts.runtimeModule or "./harness/runtime"
	local loadPath = opts.loadPath or "out/init"
	local specsDir = opts.specsDir or "test/specs"
	local specsRequirePrefix = opts.specsRequirePrefix or "./specs/"
	local successMessage = opts.successMessage or ("ok  harness loaded " .. loadPath)
	local specHeaderFormat = opts.specHeaderFormat or "── %s ──"
	local t = {
		describe = testing.describe,
		it = testing.test,
		expect = testing.expect,
	}

	local TS = require(runtimeModule)
	local ok, err = pcall(function()
		TS.loadPath(loadPath)
	end)
	if not ok then
		print("FAIL  harness cannot load " .. loadPath .. ": " .. tostring(err))
		process.exit(1)
	end
	print(successMessage)

	if fs.isDir(specsDir) then
		local names = {}
		for _, entry in fs.readDir(specsDir) do
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

	return testing._failed
end

return { run = run }
