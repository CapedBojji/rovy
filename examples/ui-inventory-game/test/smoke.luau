--!nocheck
local process = require("@lune/process")
local TS = require("./harness/runtime")
local check = require("../../../test/luau/harness/checks")

local clientGame = TS.loadPath("out/client/game")
local result = clientGame.runUiSmoke()

check.equal("rootReady", result.rootReady, true)
check.equal("guiReady", result.guiReady, true)
check.equal("renderCount", result.renderCount, 1)
check.equal("demoRendered", result.demoRendered, true)
check.equal("inventoryRendered", result.inventoryRendered, true)
check.equal("itemCount", result.itemCount, 4)

print("ok  ui inventory Luau smoke")
process.exit(0)
