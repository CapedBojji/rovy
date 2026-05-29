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
local function class(init)
	local C = {}
	C.__index = C
	C.new = function(...)
		local self = setmetatable({}, C)
		if init then
			init(self, ...)
		end
		return self
	end
	return C
end

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

	local recreatedEntity = app.world:resource(clientGame.NetworkEntityMap).zombies[77]
	assert(recreatedEntity ~= nil, "expected second snapshot to recreate zombie")

	return {
		initialEntityId = initialEntity,
		recreatedEntityId = recreatedEntity,
		recreated = recreatedEntity ~= initialEntity and app.world:has(recreatedEntity, clientComponents.ClientZombie),
	}
end

local function runUiRootResourceCloneSmoke()
	rovy:__reset()
	local ui = TS.import(nil, TS.getModule(nil, "@rovy", "ui").out)
	local RovyUi = ui.default

	local Update = class()
	local Local = class(function(self)
		self.queue = {}
	end)
	function Local:push(value)
		table.insert(self.queue, value)
	end
	function Local:drain()
		local out = self.queue
		self.queue = {}
		return out
	end
	local UiState = class(function(self)
		self.node = RovyUi.new(Instance.new("ScreenGui"))
		self.localRef = nil
		self.nested = { count = 0 }
	end)
	local holder = {}
	local Render = class()
	function Render:run(state)
		holder.paramWasRaw = state == holder.raw
		holder.nodeWasRaw = state.node == holder.raw.node
		holder.localWasRaw = state.localRef == holder.raw.localRef
		holder.nestedWasRaw = state.nested == holder.raw.nested
		state.localRef:push("clicked")
		state.nested.count += 1
	end

	rovy:__collect(Local, "test/Local")
	rovy:__schedule(Update, { runOnStart = false })
	rovy:__resource(UiState, "test/UiState", {
		collectorRefs = { { key = "localRef", ctor = Local } },
		inspect = {
			fields = {
				{ key = "node", typeLabel = "table", validator = function()
					return true
				end },
				{ key = "localRef", typeLabel = "table", validator = function()
					return true
				end },
				{ key = "nested", typeLabel = "table", validator = function()
					return true
				end },
			},
		},
	})
	rovy:__system(Render, {
		id = "test/RenderUiRoot",
		schedule = Update,
		params = { { kind = "resMut", ctor = UiState } },
	})

	local app = App.new()
	app:start()
	holder.raw = app.world:resource(UiState)
	app:runSchedule(Update)

	local live = app.world:resource(UiState)
	return {
		resourceContainerPreserved = holder.paramWasRaw and live == holder.raw,
		rootNodePreserved = holder.nodeWasRaw and live.node == holder.raw.node,
		collectorRefPreserved = holder.localWasRaw and live.localRef == holder.raw.localRef,
		collectorQueueCommitted = #holder.raw.localRef:drain() == 1,
		normalTableStayedLive = holder.nestedWasRaw and live.nested == holder.raw.nested,
		nestedMutationCommitted = live.nested.count == 1,
	}
end

local clientSelfHeal = runClientSnapshotSelfHealSmoke()
local main = TS.loadPath("out/server/main.server")
local result = main.runZombieGameSmoke()
local uiRootClone = runUiRootResourceCloneSmoke()

testing.test("zombie smoke", function()
	expect(result.started).toBe(true)
	expect(result.ticksRan).toBeGreaterThanOrEqual(60)
	expect(result.zombiesSpawned).toBeGreaterThanOrEqual(1)
	expect(result.zombiesKilled).toBeGreaterThanOrEqual(1)
	expect(result.shotsFired).toBeGreaterThanOrEqual(1)
	expect(result.snapshotCount).toBeGreaterThanOrEqual(1)
	expect(result.score).toBeGreaterThan(0)
	expect(result.bestCombo).toBeGreaterThanOrEqual(1)
	expect(result.scoreResetVerified).toBe(true)
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

testing.test("UI root node survives inspected resource snapshot", function()
	expect(uiRootClone.resourceContainerPreserved).toBe(true)
	expect(uiRootClone.rootNodePreserved).toBe(true)
	expect(uiRootClone.collectorRefPreserved).toBe(true)
	expect(uiRootClone.collectorQueueCommitted).toBe(true)
	expect(uiRootClone.normalTableStayedLive).toBe(true)
	expect(uiRootClone.nestedMutationCommitted).toBe(true)
end)

print("ok  zombie-game Luau smoke")
