--!nocheck

local fs = require("@lune/fs")
local process = require("@lune/process")

local TS = require("./harness/runtime")
local t = require("./harness/expect")

local ok, err = pcall(function()
	TS.loadPath("out/init")
end)
if not ok then
	print("FAIL  harness cannot load out/init: " .. tostring(err))
	process.exit(1)
end
print("ok  harness loaded out/init")

local specsDir = "test/specs"
if fs.isDir(specsDir) then
	for _, entry in fs.readDir(specsDir) do
		if entry:match("%.luau$") then
			print("\n-- " .. entry .. " --")
			require("./specs/" .. entry:gsub("%.luau$", ""))(TS, t)
		end
	end
end

process.exit(t.report())
