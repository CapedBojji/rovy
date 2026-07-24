--!strict

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local CLIENT_STATE = "RovyScribeNativeClient"
local SERVER_STATE = "RovyScribeNativeServer"
local CLIENT_READY = "RovyScribeNativeClientReady"
local CLIENT_SHARED_INIT = "RovyScribeNativeClientSharedInit"
local CLIENT_SHARED_DIFF = "RovyScribeNativeClientSharedDiff"
local CLIENT_SHARED_GONE = "RovyScribeNativeClientSharedGone"
local CLIENT_OBSERVED_50 = "RovyScribeNativeClientObserved50"
local CLIENT_LOCAL_APPLIED = "RovyScribeNativeClientLocalApplied"
local CLIENT_OBSERVED_60 = "RovyScribeNativeClientObserved60"
local CLIENT_COMMAND_DONE = "RovyScribeNativeClientCommandDone"
local CLIENT_FINAL_DONE = "RovyScribeNativeClientFinalDone"
local SERVER_FEATURES_DONE = "RovyScribeNativeServerFeaturesDone"
local control = ReplicatedStorage.RovyScribeGateControl :: RemoteEvent

local function signalServer(name: string)
	control:FireServer(name)
end

local function waitUntil(
	label: string,
	predicate: () -> boolean,
	timeout: number?
)
	local deadline = os.clock() + (timeout or 10)
	while os.clock() < deadline do
		if predicate() then
			return
		end
		task.wait()
	end
	error(`timed out waiting for {label}`, 2)
end

local function newContext()
	local commands = {
		sent = {},
		triggered = {},
	}
	function commands:send(event: any)
		table.insert(self.sent, event)
	end
	function commands:trigger(event: any)
		table.insert(self.triggered, event)
	end
	return {
		commands = commands,
	}, commands
end

local function eventsOfKind(events: { any }, kind: string): { any }
	local found = {}
	for _, event in events do
		if event._kind == kind then
			table.insert(found, event)
		end
	end
	return found
end

local function latestOfKind(events: { any }, kind: string): any?
	local found = eventsOfKind(events, kind)
	return found[#found]
end

local function clearCapture(capture: any)
	table.clear(capture.sent)
	table.clear(capture.triggered)
end

local function assertDualPublished(capture: any, kind: string): any
	local sent = latestOfKind(capture.sent, kind)
	local triggered = latestOfKind(capture.triggered, kind)
	assert(sent ~= nil, `missing sent {kind} event`)
	assert(triggered ~= nil, `missing triggered {kind} event`)
	assert(sent == triggered, `{kind} send/trigger did not share one record`)
	assert(table.isfrozen(sent), `{kind} event is mutable`)
	return sent
end

local function awaitJob(
	runtime: any,
	service: any,
	handle: any,
	context: any,
	label: string
): any
	waitUntil(label, function()
		runtime:flush(context)
		return service:hasResult(handle)
	end)
	local result = service:takeResult(handle)
	assert(result ~= nil, `{label} result disappeared`)
	return result
end

local function runStudioCompatibility()
	local RuntimeLib = require(ReplicatedStorage.rbxts_include.RuntimeLib)
	local bindingModule = RuntimeLib.import(
		script,
		ReplicatedStorage.RovyScribe.binding
	)
	local schemaModule = RuntimeLib.import(
		script,
		ReplicatedStorage.RovyScribe.schema
	)
	local nativeScribe = require(ReplicatedStorage.NativeScribe.Scribe)
	local binding = bindingModule.NativeScribeBinding.new(nativeScribe)
	local capturedLog
	binding:addLogSink(function(entry)
		capturedLog = entry
	end)
	local template = binding:compileTemplate({
		Coins = schemaModule.s:int(0, {
			min = 0,
		}),
	})
	local transport = {
		Name = "RovyStudioCompatibility",
		SendToClient = function(_player: Player, _bytes: buffer) end,
		SendToAllClients = function(_bytes: buffer) end,
		ListenServer = function(_callback: (Player, buffer) -> ()) end,
		SendToServer = function(_bytes: buffer) end,
		ListenClient = function(_callback: (buffer) -> ()) end,
	}
	local bundle = binding:createBundle({
		Template = template,
		ProfileStoreIndex = "RovyScribeStudioCompatibility",
		ProfileKeyPrefix = "PLAYER_",
		Transport = transport,
		TransportChannel = "@rovy/scribe:studio-compat",
		StudioCompatibilityUnknownOption = true,
	})

	assert(binding.version == "1.0.11", "unexpected native Scribe version")
	assert(bundle.Client ~= nil, "wrapper binding did not construct the client bundle")
	assert(
		bundle.__ScribeTemplate == template,
		"wrapper did not preserve native Studio template metadata"
	)
	assert(table.isfrozen(template), "native Scribe did not freeze the template")
	assert(binding:status() == "Healthy", "native diagnostics status failed")
	local logs = binding:recentLogs({
		code = "UNKNOWN_OPTION",
		limit = 10,
	})
	assert(type(logs) == "table" and #logs >= 1, "native filtered log read failed")
	assert(type(binding:metrics()) == "table", "native metric read failed")
	assert(
		capturedLog ~= nil and capturedLog.Code == "UNKNOWN_OPTION",
		"native log sink did not receive the Studio diagnostic"
	)

	local hook = ReplicatedStorage:WaitForChild("_ScribeClientDebugHook", 5)
	assert(hook ~= nil, "native Scribe client debug hook did not attach")
	assert(hook:IsA("Folder"), "native Scribe client debug hook has the wrong class")
	assert(hook:FindFirstChild("Request") ~= nil, "debug hook request endpoint is absent")
	assert(hook:FindFirstChild("Stream") ~= nil, "debug hook stream endpoint is absent")

	ReplicatedStorage:SetAttribute("RovyScribeStudioCompatibility", "ok")
	print("ROVY_SCRIBE_STUDIO_COMPAT_OK", binding.version)
end

local function runNativeRuntimeGate()
	local RuntimeLib = require(ReplicatedStorage.rbxts_include.RuntimeLib)
	local bindingModule = RuntimeLib.import(
		script,
		ReplicatedStorage.RovyScribe.binding
	)
	local runtimeModule = RuntimeLib.import(
		script,
		ReplicatedStorage.RovyScribe.runtime
	)
	local fixture = require(ReplicatedStorage.RovyScribeNativeFixture)
	local nativeScribe = require(ReplicatedStorage.NativeScribe.Scribe)
	local binding = bindingModule.NativeScribeBinding.new(nativeScribe)
	local runtime = runtimeModule.ScribeRuntime.new(
		"client",
		binding,
		{ fixture.Definition, fixture.SecondDefinition },
		nil,
		nil,
		fixture.ClientRoutes(),
		{ fixture.CommandPlan }
	)
	local context, capture = newContext()
	local state = runtime:handle("client-state", fixture.DataId)
	local reader = runtime:handle("client-reader", fixture.DataId)
	local localWriter = runtime:handle("local-writer", fixture.DataId)
	local shared = runtime:handle("shared-reader", fixture.DataId)
	local secondState = runtime:handle(
		"client-state",
		fixture.SecondDataId
	)
	local secondReader = runtime:handle(
		"client-reader",
		fixture.SecondDataId
	)

	waitUntil("client Scribe readiness", function()
		runtime:flush(context)
		return state.ready and secondState.ready
	end)
	runtime:flush(context)
	assert(reader.Coins:get() == 0, "initial client Coins was not zero")
	assert(reader.Coins:default() == 0, "client default projection failed")
	assert(reader.Coins:min() == 0, "client minimum projection failed")
	assert(reader.Coins:max() == 1000, "client maximum projection failed")
	assert(reader.Secret == nil, "server-only field leaked into client reader")
	assert(state.serviceStatus == "Healthy", "client service status is not Healthy")
	assert(secondReader.Points:get() == 0, "secondary client bundle started dirty")
	assertDualPublished(capture, "ready")
	clearCapture(capture)
	ReplicatedStorage:SetAttribute(CLIENT_READY, true)
	signalServer(CLIENT_READY)
	ReplicatedStorage:SetAttribute(CLIENT_STATE, "ready")

	local sharedUserId =
		game.Players.LocalPlayer.UserId + fixture.SharedUserIdOffset
	assert(
		shared:get(sharedUserId) == nil,
		"shared reader fabricated an unknown player"
	)
	waitUntil("native shared init", function()
		runtime:flush(context)
		local value = shared:get(sharedUserId)
		return value ~= nil and value.Public.Title == "Shared One"
	end)
	local sharedInit = assertDualPublished(capture, "sharedChanged")
	assert(
		sharedInit.userId == sharedUserId
			and sharedInit.value.Public.Title == "Shared One"
			and table.isfrozen(sharedInit.value)
			and table.isfrozen(sharedInit.value.Public),
		"native shared-init event is wrong or mutable"
	)
	local sharedSnapshot = shared:get(sharedUserId)
	assert(
		sharedSnapshot ~= nil
			and sharedSnapshot.Public.Title == "Shared One"
			and sharedSnapshot.Secret == nil
			and table.isfrozen(sharedSnapshot)
			and table.isfrozen(sharedSnapshot.Public),
		"shared reader leaked visibility or mutability"
	)
	clearCapture(capture)
	signalServer(CLIENT_SHARED_INIT)

	waitUntil("native shared diff", function()
		runtime:flush(context)
		local value = shared:get(sharedUserId)
		return value ~= nil and value.Public.Title == "Shared Two"
	end)
	local sharedDiff = assertDualPublished(capture, "sharedChanged")
	assert(
		sharedDiff.userId == sharedUserId
			and sharedDiff.value.Public.Title == "Shared Two",
		"native shared-diff event payload is wrong"
	)
	clearCapture(capture)
	signalServer(CLIENT_SHARED_DIFF)

	waitUntil("native shared gone", function()
		runtime:flush(context)
		return shared:get(sharedUserId) == nil
			and latestOfKind(capture.sent, "sharedChanged") ~= nil
	end)
	local sharedGone = assertDualPublished(capture, "sharedChanged")
	assert(
		sharedGone.userId == sharedUserId and sharedGone.value == nil,
		"native shared-gone event payload is wrong"
	)
	clearCapture(capture)
	signalServer(CLIENT_SHARED_GONE)

	waitUntil("replicated server write", function()
		runtime:flush(context)
		return reader.Coins:get() == 50
			and reader.Inventory:at("IronSword").Amount:get() == 1
			and secondReader.Points:get() == 7
	end)
	assert(
		reader.Public.Title:get() == "Native Gate",
		"shared root is absent from the owner reader"
	)
	local replicatedEvent = assertDualPublished(capture, "changed")
	assert(
		replicatedEvent.before == 0
			and replicatedEvent.after == 50
			and replicatedEvent.source == "replication",
		"client replication event payload is wrong"
	)
	local keyEvent = assertDualPublished(capture, "keyAdded")
	assert(keyEvent.key == "IronSword", "client dictionary event key is wrong")
	clearCapture(capture)
	ReplicatedStorage:SetAttribute(CLIENT_OBSERVED_50, true)
	signalServer(CLIENT_OBSERVED_50)

	localWriter.Coins:increment(25)
	assert(reader.Coins:get() == 50, "same-set client read observed local write")
	runtime:flush(context)
	assert(reader.Coins:get() == 75, "client-local write did not apply at flush")
	local localEvent = assertDualPublished(capture, "changed")
	assert(
		localEvent.before == 50
			and localEvent.after == 75
			and localEvent.source == "clientLocalWrite",
		"client-local event source or payload is wrong"
	)
	clearCapture(capture)
	ReplicatedStorage:SetAttribute(CLIENT_LOCAL_APPLIED, true)
	signalServer(CLIENT_LOCAL_APPLIED)

	waitUntil("authoritative overwrite of optimistic mirror", function()
		runtime:flush(context)
		return reader.Coins:get() == 60
			and reader.Inventory:at("IronSword").Amount:get() == 2
	end)
	local overwriteEvent = assertDualPublished(capture, "changed")
	assert(
		overwriteEvent.before == 75
			and overwriteEvent.after == 60
			and overwriteEvent.source == "replication",
		"authoritative update did not replace optimistic state"
	)
	clearCapture(capture)
	ReplicatedStorage:SetAttribute(CLIENT_OBSERVED_60, true)
	signalServer(CLIENT_OBSERVED_60)

	local command = runtime:commandClient(fixture.CommandId)
	local handle = command:call(
		fixture.EquipItem.new("IronSword"),
		"native-runtime-gate"
	)
	assert(not command:hasResult(handle), "command result existed before native request")
	runtime:flush(context)
	waitUntil("native command reply", function()
		runtime:flush(context)
		return command:hasResult(handle)
	end)
	assert(
		reader.Coins:get() == 100,
		"command completion arrived before its authoritative diff"
	)
	assert(
		reader.EquippedItem:get() == "IronSword",
		"command completion arrived before its equipped-item diff"
	)
	local result = command:takeResult(handle)
	assert(
		result ~= nil and result.ok and result.value.equipped,
		"native command result did not round-trip"
	)
	assert(not command:hasResult(handle), "takeResult did not consume command result")
	local completions = eventsOfKind(capture.sent, "commandCompleted")
	assert(#completions == 1, "command completion event did not fire exactly once")
	assert(
		completions[1].handle == handle
			and completions[1].result.ok
			and completions[1].result.value.equipped,
		"command completion event payload is wrong"
	)
	assertDualPublished(capture, "commandCompleted")
	clearCapture(capture)
	ReplicatedStorage:SetAttribute(CLIENT_COMMAND_DONE, true)
	signalServer(CLIENT_COMMAND_DONE)

	waitUntil("server feature suite", function()
		runtime:flush(context)
		return ReplicatedStorage:GetAttribute(SERVER_FEATURES_DONE) == true
			and reader.Coins:get() == 95
	end)
	assert(reader.Queue:has("PurchasedBadge"), "purchase grant did not replicate")
	assert(reader.Queue:count() == 1, "array clear/restore sequence diverged")
	assert(reader.Queue:find("PurchasedBadge") == 0, "client array find is not zero-based")
	assert(reader.Enabled:get() == false, "boolean toggle sequence diverged")
	assert(reader.ActiveBoost:get() == 2, "timed value did not replicate")
	assert(reader.ActiveBoost:active().active, "timed active state did not replicate")
	assert(secondReader.Points:get() == 7, "secondary bundle state crossed definitions")
	local ownership = runtime:handle("ownership", fixture.DataId)
	assert(ownership:owns("VIP"), "perk grant did not replicate")
	local ownsSynced = awaitJob(
		runtime,
		ownership,
		ownership:ownsSynced("VIP", 2),
		context,
		"client ownership sync job"
	)
	assert(ownsSynced.ok and ownsSynced.value, "client ownership sync returned false")
	local monetization = runtime:handle("monetization", fixture.DataId)
	local giftCredits = monetization:getGiftCredits()
	assert(
		table.isfrozen(giftCredits) and next(giftCredits) == nil,
		"client gift credits are mutable or unexpectedly populated"
	)
	local purchases = monetization:getPurchases(nil, {
		limit = 10,
	})
	assert(#purchases >= 2, "replicated purchase logs are incomplete")
	local leaderboards = runtime:handle("leaderboards", fixture.DataId)
	local board = leaderboards:get("TopCoins", 10)
	assert(
		#board >= 1
			and board[1].userId == game.Players.LocalPlayer.UserId
			and board[1].score == 95,
		"client leaderboard mirror is wrong"
	)
	assert(
		leaderboards:getMyRank("TopCoins") == 1,
		"client leaderboard rank is wrong"
	)
	local leaderboardEvent = assertDualPublished(capture, "leaderboard")
	assert(
		leaderboardEvent.name == "TopCoins"
			and #leaderboardEvent.entries >= 1
			and leaderboardEvent.entries[1].score == 95,
		"client leaderboard event payload is wrong"
	)
	local statusEvents = eventsOfKind(capture.sent, "serviceStatus")
	assert(#statusEvents >= 2, "client service-status events were dropped")
	assert(
		statusEvents[#statusEvents].status == "Healthy",
		"client service status did not recover"
	)
	local clientState = runtime:handle("client-state", fixture.DataId)
	runtime:flush(context)
	assert(
		clientState.saveInfo.lastResult == "Ok"
			and not clientState.saveInfo.dirty,
		"client save-state mirror did not receive the forced save"
	)
	ReplicatedStorage:SetAttribute(CLIENT_FINAL_DONE, true)
	signalServer(CLIENT_FINAL_DONE)
	waitUntil("server session-end assertions", function()
		return ReplicatedStorage:GetAttribute(SERVER_STATE) == "ok"
	end)
	ReplicatedStorage:SetAttribute(CLIENT_STATE, "ok")
	print("ROVY_SCRIBE_NATIVE_CLIENT_OK", binding.version)
end

local ok, reason = xpcall(function()
	runStudioCompatibility()
	runNativeRuntimeGate()
end, debug.traceback)
if not ok then
	ReplicatedStorage:SetAttribute(
		"RovyScribeStudioCompatibility",
		tostring(reason)
	)
	ReplicatedStorage:SetAttribute(CLIENT_STATE, `error: {tostring(reason)}`)
	warn("ROVY_SCRIBE_NATIVE_CLIENT_FAILED", reason)
	error(reason)
end
