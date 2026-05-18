--!nocheck
local process = require("@lune/process")
local TS = require("./harness/runtime")
local check = require("../../../test/luau/harness/checks")

-- The smoke loads main.server (which exports runZombieGameSmoke). The
-- top-level engine attachment inside main.server is gated behind a pcall
-- on game:GetService("RunService"); the test harness only stubs
-- ReplicatedStorage / ServerScriptService / StarterPlayer, so the engine
-- half is skipped and we drive the Rovy app deterministically here.
local main = TS.loadPath("out/server/main.server")
local result = main.runZombieGameSmoke()

check.equal("started", result.started, true)
check.atLeast("ticksRan", result.ticksRan, 60)
check.atLeast("zombiesSpawned", result.zombiesSpawned, 1)
check.atLeast("zombiesKilled", result.zombiesKilled, 1)
check.atLeast("shotsFired", result.shotsFired, 1)
check.atLeast("snapshotCount", result.snapshotCount, 1)
check.equal("playerHealthAfterRestart", result.playerHealth, 100)
check.equal("defeatReached", result.defeatReached, true)
check.equal("restartApplied", result.restartApplied, true)
check.equal("waveAfterRestart", result.waveNumber, 0)
check.equal("phaseAfterRestart", result.phase, "intermission")
check.equal("serializerRoundTripOk", result.serializerRoundTripOk, true)

print("ok  zombie-game Luau smoke")
process.exit(0)
