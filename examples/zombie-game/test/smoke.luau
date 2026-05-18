--!nocheck
local testing = zune.testing
local TS = require("./harness/runtime")
local expect = testing.expect

-- The smoke loads main.server (which exports runZombieGameSmoke). The
-- top-level engine attachment inside main.server is gated behind a pcall
-- on game:GetService("RunService"); the test harness only stubs
-- ReplicatedStorage / ServerScriptService / StarterPlayer, so the engine
-- half is skipped and we drive the Rovy app deterministically here.
local main = TS.loadPath("out/server/main.server")
local result = main.runZombieGameSmoke()

testing.test("zombie smoke", function()
	expect(result.started).toBe(true)
	expect(result.ticksRan).toBeGreaterThanOrEqual(60)
	expect(result.zombiesSpawned).toBeGreaterThanOrEqual(1)
	expect(result.zombiesKilled).toBeGreaterThanOrEqual(1)
	expect(result.shotsFired).toBeGreaterThanOrEqual(1)
	expect(result.snapshotCount).toBeGreaterThanOrEqual(1)
	expect(result.playerHealth).toBe(100)
	expect(result.defeatReached).toBe(true)
	expect(result.restartApplied).toBe(true)
	expect(result.waveNumber).toBe(0)
	expect(result.phase).toBe("intermission")
	expect(result.serializerRoundTripOk).toBe(true)
end)

print("ok  zombie-game Luau smoke")
