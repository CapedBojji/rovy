--!nocheck
local process = require("@lune/process")
local TS = require("./harness/runtime")

-- The smoke loads main.server (which exports runZombieGameSmoke). The
-- top-level engine attachment inside main.server is gated behind a pcall
-- on game:GetService("RunService"); the test harness only stubs
-- ReplicatedStorage / ServerScriptService / StarterPlayer, so the engine
-- half is skipped and we drive the Rovy app deterministically here.
local main = TS.loadPath("out/server/main.server")
local result = main.runZombieGameSmoke()

local function expect(name: string, value, expected)
	if value ~= expected then
		error(string.format("%s: expected %s, got %s", name, tostring(expected), tostring(value)), 2)
	end
end

local function expectAtLeast(name: string, value, minimum)
	if type(value) ~= "number" or value < minimum then
		error(string.format("%s: expected >= %s, got %s", name, tostring(minimum), tostring(value)), 2)
	end
end

expect("started", result.started, true)
expectAtLeast("ticksRan", result.ticksRan, 60)
expectAtLeast("zombiesSpawned", result.zombiesSpawned, 1)
expectAtLeast("zombiesKilled", result.zombiesKilled, 1)
expectAtLeast("shotsFired", result.shotsFired, 1)
expectAtLeast("snapshotCount", result.snapshotCount, 1)
expect("playerHealthAfterRestart", result.playerHealth, 100)
expect("defeatReached", result.defeatReached, true)
expect("restartApplied", result.restartApplied, true)
expect("waveAfterRestart", result.waveNumber, 0)
expect("phaseAfterRestart", result.phase, "intermission")
expect("serializerRoundTripOk", result.serializerRoundTripOk, true)

print("ok  zombie-game Luau smoke")
process.exit(0)
