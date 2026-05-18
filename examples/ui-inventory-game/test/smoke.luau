--!nocheck
local testing = zune.testing
local TS = require("./harness/runtime")
local expect = testing.expect

local clientGame = TS.loadPath("out/client/game")
local result = clientGame.runUiSmoke()

testing.test("ui inventory smoke", function()
	expect(result.rootReady).toBe(true)
	expect(result.guiReady).toBe(true)
	expect(result.renderCount).toBe(1)
	expect(result.demoRendered).toBe(true)
	expect(result.inventoryRendered).toBe(true)
	expect(result.itemCount).toBe(4)
end)

print("ok  ui inventory Luau smoke")
