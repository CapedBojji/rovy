--!nocheck
local testing = zune.testing
local TS = require("./harness/runtime")
local expect = testing.expect

local core = TS.import(nil, TS.getModule(nil, "@rovy", "core").out)
local rovy = core.rovy
local App = core.App

local function runClientSnapshotSmoke()
	rovy:__reset()
	rovy:loadPaths("src/shared", "src/client")
	local clientGame = TS.loadPath("$services/StarterPlayer/StarterPlayerScripts/TS/game")
	local clientComponents = TS.loadPath("$services/StarterPlayer/StarterPlayerScripts/TS/components")
	local sharedContracts = TS.loadPath("out/shared/contracts")
	local sharedNetwork = TS.loadPath("out/shared/network")

	local app = App.new()
	app:configureSets(clientGame.Render, { clientGame.ModelSet })
	app:start()

	local snapshot = sharedContracts.TowerSnapshotPayload.new(
		12,
		0.4,
		"running",
		3,
		1,
		1,
		1,
		1,
		2,
		1,
		0,
		12,
		1,
		99,
		{
			{
				id = 77,
				position = Vector3.new(-12, 3, 0),
				health = 50,
				maxHealth = 100,
				progress = 0.42,
				spawnIndex = 2,
				willBeHit = true,
				shotTaken = false,
			},
		},
		{}
	)

	app.commands:send(sharedNetwork.toTowerSnapshotNet(snapshot))
	app:runSchedule(clientGame.Render)

	local hud = app.world:resource(clientGame.HudState)
	local nem = app.world:resource(clientGame.NetworkEntityMap)
	local monsterEntity = nem.monsters[77]

	return {
		damageEvents = hud.damageEvents,
		lastClientFrameSeenByServer = hud.lastClientFrameSeenByServer,
		monsterCreated = monsterEntity ~= nil and app.world:has(monsterEntity, clientComponents.ClientMonster),
	}
end

local clientSmoke = runClientSnapshotSmoke()
local main = TS.loadPath("out/server/main.server")
local result = main.runTowerDefenseSmoke()

testing.test("tower defense server sim", function()
	expect(result.started).toBe(true)
	expect(result.ticksRan).toBeGreaterThanOrEqual(300)
	expect(result.monstersSpawned).toBeGreaterThanOrEqual(5)
	expect(result.shotsFired).toBeGreaterThan(0)
	expect(result.snapshotCount).toBeGreaterThan(0)
	expect(result.maxActiveMonstersObserved <= 3).toBe(true)
	expect(result.monstersEscaped).toBeGreaterThan(0)
	expect(result.damageEvents).toBeGreaterThan(0)
	expect(result.clientHeartbeatApplied).toBe(true)
end)

testing.test("tower defense client snapshot", function()
	expect(clientSmoke.damageEvents).toBe(1)
	expect(clientSmoke.lastClientFrameSeenByServer).toBe(99)
	expect(clientSmoke.monsterCreated).toBe(true)
end)

print("ok  tower-defense-game Luau smoke")
