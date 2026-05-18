--!nocheck
local process = require("@lune/process")
local TS = require("./harness/runtime")

local clientGame = TS.loadPath("out/client/game")
local result = clientGame.runUiSmoke()

local function expect(name: string, value, expected)
	if value ~= expected then
		error(string.format("%s: expected %s, got %s", name, tostring(expected), tostring(value)), 2)
	end
end

expect("rootReady", result.rootReady, true)
expect("guiReady", result.guiReady, true)
expect("renderCount", result.renderCount, 1)
expect("demoRendered", result.demoRendered, true)
expect("inventoryRendered", result.inventoryRendered, true)
expect("itemCount", result.itemCount, 4)

print("ok  ui inventory Luau smoke")
process.exit(0)
