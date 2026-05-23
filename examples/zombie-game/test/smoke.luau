--!nocheck
local testing = zune.testing
local TS = require("./harness/runtime")
local expect = testing.expect

local core = TS.import(nil, TS.getModule(nil, "@rovy", "core").out)
local rovy = core.rovy
local App = core.App

-- The smoke loads main.server (which exports runZombieGameSmoke). The
-- top-level engine attachment inside main.server is gated behind a pcall
-- on game:GetService("RunService"); the test harness only stubs
-- ReplicatedStorage / ServerScriptService / StarterPlayer, so the engine
-- half is skipped and we drive the Rovy app deterministically here.
local function runClientSnapshotSelfHealSmoke()
	rovy:__reset()
	rovy:loadPaths("src/shared", "src/client")
	local clientGame = TS.loadPath("$services/StarterPlayer/StarterPlayerScripts/TS/game")
	local clientComponents = TS.loadPath("$services/StarterPlayer/StarterPlayerScripts/TS/components")
	local sharedContracts = TS.loadPath("out/shared/contracts")
	local sharedNetwork = TS.loadPath("out/shared/network")

	local app = App.new()
	app:configureSets(clientGame.Render, { clientGame.FrameSet, clientGame.SnapshotSet })
	app:start()

	local snapshot = sharedContracts.WorldSnapshotPayload.new(
		1,
		"wave",
		1,
		1,
		100,
		100,
		Vector3.new(),
		{ { id = 77, position = Vector3.new(8, 0, 0), health = 60, maxHealth = 60 } },
		{},
		false
	)

	app.commands:send(sharedNetwork.toWorldSnapshotNet(snapshot))
	app:runSchedule(clientGame.Render)

	local nem = app.world:resource(clientGame.NetworkEntityMap)
	local initialEntity = nem.zombies[77]
	assert(initialEntity ~= nil, "expected first snapshot to spawn zombie")

	app.world:despawn(initialEntity)
	app.commands:send(sharedNetwork.toWorldSnapshotNet(snapshot))
	app:runSchedule(clientGame.Render)

	local recreatedEntity = nem.zombies[77]
	assert(recreatedEntity ~= nil, "expected second snapshot to recreate zombie")

	return {
		initialEntityId = initialEntity,
		recreatedEntityId = recreatedEntity,
		recreated = recreatedEntity ~= initialEntity and app.world:has(recreatedEntity, clientComponents.ClientZombie),
	}
end

local clientSelfHeal = runClientSnapshotSelfHealSmoke()
local main = TS.loadPath("out/server/main.server")
local result = main.runZombieGameSmoke()

testing.test("zombie smoke", function()
	expect(result.started).toBe(true)
	expect(result.ticksRan).toBeGreaterThanOrEqual(60)
	expect(result.zombiesSpawned).toBeGreaterThanOrEqual(1)
	expect(result.zombiesKilled).toBeGreaterThanOrEqual(1)
	expect(result.shotsFired).toBeGreaterThanOrEqual(1)
	expect(result.snapshotCount).toBeGreaterThanOrEqual(1)
	expect(result.pauseFreezeVerified).toBe(true)
	expect(result.playerHealth).toBe(100)
	expect(result.defeatReached).toBe(true)
	expect(result.restartApplied).toBe(true)
	expect(result.waveNumber).toBe(0)
	expect(result.phase).toBe("intermission")
end)

testing.test("client snapshot recreates despawned zombie", function()
	expect(clientSelfHeal.recreated).toBe(true)
	expect(clientSelfHeal.recreatedEntityId).never.toBe(clientSelfHeal.initialEntityId)
end)

print("ok  zombie-game Luau smoke")
