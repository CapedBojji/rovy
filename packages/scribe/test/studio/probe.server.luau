--!strict

local Players = game:GetService("Players")
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
local clientSignals: { [Player]: { [string]: boolean } } = {}

control.OnServerEvent:Connect(function(player: Player, name: any)
	if type(name) ~= "string" then
		return
	end
	local signals = clientSignals[player]
	if signals == nil then
		signals = {}
		clientSignals[player] = signals
	end
	signals[name] = true
end)

local function clientSignaled(player: Player, name: string): boolean
	local signals = clientSignals[player]
	return signals ~= nil and signals[name] == true
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

local function persistedSeed(coins: number)
	return {
		Coins = coins,
		EquippedItem = "",
		Inventory = {},
		Queue = {},
		CreatedAt = 1,
		Enabled = false,
		ActiveBoost = 1,
		Public = {
			Title = "",
		},
		Secret = {
			Flagged = false,
		},
	}
end

local function run()
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
	local FakeProfileStore = require(
		ReplicatedStorage.NativeScribe.test.Helpers.FakeProfileStore
	)
	local fake = FakeProfileStore.new()
	local binding = bindingModule.NativeScribeBinding.new(nativeScribe)
	local economyEvents = {}
	local serverSetups = {
		[fixture.DataId] = {
			profileStore = fake,
			onPlayerInit = function(_player: Player, data: any)
				if data.CreatedAt:get() == 0 then
					data.CreatedAt:set(123456)
				end
			end,
			productGrants = {
				CoinsPack = function(context: any)
					context.data.Coins:increment(5)
				end,
			},
			economy = {
				logEconomyEvent = function(
					player: Player,
					flow: EnumItem,
					currency: string,
					amount: number,
					balance: number,
					transactionType: string,
					itemSku: string,
					fields: any
				)
					table.insert(economyEvents, {
						player = player,
						flow = flow,
						currency = currency,
						amount = amount,
						balance = balance,
						transactionType = transactionType,
						itemSku = itemSku,
						fields = fields,
					})
				end,
			},
		},
		[fixture.SecondDataId] = {
			profileStore = fake,
		},
	}
	local runtime = runtimeModule.ScribeRuntime.new(
		"server",
		binding,
		{ fixture.Definition, fixture.SecondDefinition },
		nil,
		serverSetups,
		fixture.ServerRoutes(),
		{ fixture.CommandPlan }
	)
	local context, capture = newContext()

	ReplicatedStorage:SetAttribute(SERVER_STATE, "booted")
	local player = Players:GetPlayers()[1]
	if player == nil then
		player = Players.PlayerAdded:Wait()
	end

	local reader = runtime:handle("server-reader", fixture.DataId)
	local writer = runtime:handle("server-writer", fixture.DataId)
	local secondReader = runtime:handle(
		"server-reader",
		fixture.SecondDataId
	)
	local secondWriter = runtime:handle(
		"server-writer",
		fixture.SecondDataId
	)
	waitUntil("native profile readiness", function()
		return reader:state(player) == "Ready"
			and secondReader:state(player) == "Ready"
	end)
	waitUntil("deferred server ready event", function()
		runtime:flush(context)
		return latestOfKind(capture.sent, "ready") ~= nil
	end)

	local profile = reader:require(player)
	assert(profile.Coins:get() == 0, "initial server Coins was not zero")
	assert(profile.Coins:default() == 0, "server default projection failed")
	assert(profile.Coins:min() == 0, "server minimum projection failed")
	assert(profile.Coins:max() == 1000, "server maximum projection failed")
	assert(profile.CreatedAt:get() == 123456, "typed OnPlayerInit did not run")
	assert(profile.Secret.Flagged:get() == false, "server-only field is unavailable")
	assert(profile.Runtime.InCombat:get() == false, "session field is unavailable")
	local secondaryProfile = secondReader:require(player)
	assert(secondaryProfile.Points:get() == 0, "secondary bundle started dirty")
	assertDualPublished(capture, "ready")
	clearCapture(capture)

	waitUntil("client ready mirror", function()
		return clientSignaled(player, CLIENT_READY)
	end)

	local nativeRoot = ReplicatedStorage.NativeScribe.Scribe
	local NativeTemplate = require(nativeRoot.Internal.Template)
	local NativeWire = require(nativeRoot.Internal.Wire)
	local compiled = NativeTemplate.Compile(
		binding:compileTemplate(fixture.Definition.template)
	)
	local transportFolder = ReplicatedStorage:WaitForChild(
		"ScribeTransport_@rovy/scribe:native-runtime-gate"
	)
	local transportDown = transportFolder:WaitForChild("Down") :: RemoteEvent
	local sharedUserId = player.UserId + fixture.SharedUserIdOffset
	local function sendShared(
		frameType: number,
		ops: { any }
	)
		local bytes = NativeWire.EncodeOpsFrame(
			frameType,
			compiled,
			ops,
			function(writer: any)
				NativeWire.F64(writer, sharedUserId)
			end
		)
		transportDown:FireClient(player, bytes)
	end
	sendShared(NativeWire.Frames.SharedInit, {
		{
			Kind = "Set",
			Path = { "Public" },
			Value = {
				Title = "Shared One",
			},
		},
	})
	waitUntil("client shared init", function()
		return clientSignaled(player, CLIENT_SHARED_INIT)
	end)
	sendShared(NativeWire.Frames.SharedDiff, {
		{
			Kind = "Set",
			Path = { "Public", "Title" },
			Value = "Shared Two",
		},
	})
	waitUntil("client shared diff", function()
		return clientSignaled(player, CLIENT_SHARED_DIFF)
	end)
	local goneWriter = NativeWire.NewWriter()
	NativeWire.U8(goneWriter, NativeWire.Frames.SharedGone)
	NativeWire.F64(goneWriter, sharedUserId)
	transportDown:FireClient(player, NativeWire.Finish(goneWriter))
	waitUntil("client shared removal", function()
		return clientSignaled(player, CLIENT_SHARED_GONE)
	end)

	local writes = writer["for"](writer, player)
	local before = profile.Coins:get()
	writes.Coins:increment(50, {
		flow = "source",
		transactionType = "NativeGate",
		itemSku = "initial-credit",
		fields = {
			Region = "US",
		},
	})
	writes.Inventory:at("IronSword"):set({
		Amount = 1,
	})
	writes.Public.Title:set("Native Gate")
	secondWriter["for"](secondWriter, player).Points:set(7)
	assert(profile.Coins:get() == before, "same-set server read observed queued write")
	assert(
		secondaryProfile.Points:get() == 0,
		"secondary same-set read observed queued write"
	)
	runtime:flush(context)
	assert(profile.Coins:get() == 50, "server write did not commit at flush")
	assert(
		secondaryProfile.Points:get() == 7,
		"secondary bundle did not commit independently"
	)
	assert(
		profile.Inventory:at("IronSword").Amount:get() == 1,
		"dictionary write did not commit"
	)
	local inventorySnapshot = profile.Inventory:get()
	assert(table.isfrozen(inventorySnapshot), "reader get leaked a mutable table")
	local inventoryClone = profile.Inventory:clone()
	inventoryClone.IronSword.Amount = 77
	assert(
		profile.Inventory:at("IronSword").Amount:get() == 1,
		"reader clone aliased native profile state"
	)
	assert(profile.Inventory:count() == 1, "dictionary reader count is wrong")
	local coinEvent = assertDualPublished(capture, "changed")
	assert(coinEvent.before == 0 and coinEvent.after == 50, "wrong Coins change payload")
	assert(coinEvent.source == "serverWrite", "wrong server change source")
	local keyEvent = assertDualPublished(capture, "keyAdded")
	assert(keyEvent.key == "IronSword", "wrong dictionary key-added payload")
	assert(#economyEvents == 1, "tagged increment emitted wrong economy count")
	assert(
		economyEvents[1].player == player
			and economyEvents[1].flow == Enum.AnalyticsEconomyFlowType.Source
			and economyEvents[1].currency == "Gold"
			and economyEvents[1].amount == 50
			and economyEvents[1].balance == 50
			and economyEvents[1].transactionType == "NativeGate"
			and economyEvents[1].itemSku == "initial-credit",
		"economy metadata changed before native analytics"
	)
	clearCapture(capture)
	ReplicatedStorage:SetAttribute(SERVER_STATE, "committed-50")

	waitUntil("client authoritative 50", function()
		return clientSignaled(player, CLIENT_OBSERVED_50)
	end)
	waitUntil("client local optimistic write", function()
		return clientSignaled(player, CLIENT_LOCAL_APPLIED)
	end)
	assert(profile.Coins:get() == 50, "client-local write reached the server")

	local transaction = writer:transaction(player, function(transactionWrites: any)
		transactionWrites.Coins:increment(10)
		transactionWrites.Inventory
			:at("IronSword")
			.Amount
			:increment(1)
	end)
	assert(transaction.id >= 1, "transaction handle was not allocated")
	assert(profile.Coins:get() == 50, "same-set transaction leaked into reader")
	runtime:flush(context)
	assert(profile.Coins:get() == 60, "native transaction did not commit")
	assert(
		profile.Inventory:at("IronSword").Amount:get() == 2,
		"native transaction did not commit every operation"
	)

	writer:transaction(player, function(transactionWrites: any)
		transactionWrites.Coins:increment(100)
		transactionWrites.Inventory
			:at("IronSword")
			.Amount
			:set(0)
	end)
	runtime:flush(context)
	assert(profile.Coins:get() == 60, "failed transaction leaked a partial increment")
	assert(
		profile.Inventory:at("IronSword").Amount:get() == 2,
		"failed transaction leaked an invalid write"
	)
	local failures = runtime:drainWriteFailures()
	assert(#failures == 1, "native rejected transaction was not recorded once")
	assert(failures[1].transactionId ~= nil, "transaction failure lost its group id")
	local anomalyEvent = assertDualPublished(capture, "anomaly")
	assert(
		type(anomalyEvent.reason) == "string"
			and #anomalyEvent.reason > 0,
		"write anomaly lost its native reason"
	)
	clearCapture(capture)
	ReplicatedStorage:SetAttribute(SERVER_STATE, "committed-60")

	waitUntil("client authoritative overwrite", function()
		return clientSignaled(player, CLIENT_OBSERVED_60)
	end)

	local commandReader = runtime:commandReader(fixture.CommandId)
	local responder = runtime:commandResponder()
	waitUntil("native command ingress", function()
		runtime:flush(context)
		return commandReader:size() == 1
	end)
	local handled = 0
	commandReader:forEach(function(request: any)
		handled += 1
		assert(request.player == player, "native command lost sender identity")
		assert(request.value.itemId == "IronSword", "native command payload changed")
		writer["for"](writer, request.player).Coins:increment(40)
		writer["for"](writer, request.player).EquippedItem:set(
			request.value.itemId
		)
		responder:resolve(
			request,
			fixture.EquipItemResult.new(true)
		)
	end)
	assert(handled == 1, "command reader did not consume exactly one request")
	assert(profile.Coins:get() == 60, "command write applied before response flush")
	runtime:flush(context)
	assert(profile.Coins:get() == 100, "command-gated write did not commit")
	assert(
		profile.EquippedItem:get() == "IronSword",
		"command-gated string write did not commit"
	)
	ReplicatedStorage:SetAttribute(SERVER_STATE, "command-replied")

	waitUntil("client command completion", function()
		return clientSignaled(player, CLIENT_COMMAND_DONE)
	end)
	clearCapture(capture)

	writes.Coins:update(function(current: number)
		assert(current == 100, "update callback did not see latest committed value")
		return current + 5
	end)
	writes.Coins:decrement(5, {
		flow = "sink",
		transactionType = "NativeGateSpend",
		itemSku = "round-trip",
		fields = {
			Region = "US",
		},
	})
	writes.Enabled:toggle()
	writes.Queue:insert("A")
	writes.Queue:insert("B")
	writes.ActiveBoost:setTimed(2, 30)
	assert(profile.Coins:get() == 100, "mixed buffered operations leaked early")
	runtime:flush(context)
	assert(profile.Coins:get() == 100, "update/decrement ordering changed")
	assert(profile.Enabled:get() == true, "boolean toggle did not commit")
	assert(profile.Queue:count() == 2, "array inserts did not commit")
	assert(profile.Queue:find("A") == 0, "array find is not zero-based")
	assert(profile.Queue:has("B"), "array has did not find inserted value")
	assert(profile.Queue:at(1):get() == "B", "array at used wrong index base")
	local activeBoost = profile.ActiveBoost:active()
	assert(
		activeBoost.active and activeBoost.remaining ~= nil,
		"timed set did not arm the field"
	)
	assert(profile.ActiveBoost:get() == 2, "timed set stored wrong value")
	local inserted = eventsOfKind(capture.sent, "inserted")
	assert(#inserted == 2, "array structural ingress dropped an insert")
	assert(
		inserted[1].index == 0
			and inserted[1].value == "A"
			and inserted[2].index == 1
			and inserted[2].value == "B",
		"array insert records changed order or index base"
	)
	assert(#economyEvents == 2, "tagged decrement emitted wrong economy count")
	assert(
		economyEvents[2].flow == Enum.AnalyticsEconomyFlowType.Sink
			and economyEvents[2].amount == 5
			and economyEvents[2].balance == 100
			and economyEvents[2].transactionType == "NativeGateSpend",
		"tagged decrement economy record is wrong"
	)
	clearCapture(capture)

	writes.Queue:removeValue("A")
	writes.Queue:at(0):set("B2")
	writes.Enabled:toggle()
	writes.ActiveBoost:extendTimed(10)
	writes.Inventory:at("Temp"):set({
		Amount = 3,
	})
	runtime:flush(context)
	assert(profile.Queue:count() == 1, "array removeValue changed count incorrectly")
	assert(profile.Queue:at(0):get() == "B2", "array child set did not commit")
	assert(profile.Enabled:get() == false, "second boolean toggle did not commit")
	assert(
		profile.ActiveBoost:active().remaining ~= nil,
		"timed extend lost active state"
	)
	local removedA = assertDualPublished(capture, "removed")
	assert(
		removedA.index == 0 and removedA.value == "A",
		"array removeValue event payload is wrong"
	)
	assert(
		assertDualPublished(capture, "keyAdded").key == "Temp",
		"dynamic dictionary addition was not observed"
	)
	clearCapture(capture)

	writes.Queue:insert("C", 0)
	writes.Queue:remove(1)
	writes.Inventory:remove("Temp")
	runtime:flush(context)
	assert(
		profile.Queue:count() == 1 and profile.Queue:at(0):get() == "C",
		"ordered array insert/remove replay is wrong"
	)
	local removedB = assertDualPublished(capture, "removed")
	assert(
		removedB.index == 1 and removedB.value == "B2",
		"array remove(index) event payload is wrong"
	)
	local removedKey = assertDualPublished(capture, "keyRemoved")
	assert(
		removedKey.key == "Temp" and removedKey.value.Amount == 3,
		"dictionary remove event payload is wrong"
	)
	clearCapture(capture)

	writes.Queue:clear()
	writes.Inventory:clear()
	runtime:flush(context)
	assert(profile.Queue:count() == 0, "array clear did not commit")
	assert(profile.Inventory:count() == 0, "dictionary clear did not commit")
	assert(
		#eventsOfKind(capture.sent, "removed") == 0
			and #eventsOfKind(capture.sent, "keyRemoved") == 0,
		"wrapper fabricated per-entry removals for native bulk Clear"
	)
	clearCapture(capture)
	writes.Inventory:at("IronSword"):set({
		Amount = 2,
	})
	runtime:flush(context)
	assert(
		profile.Inventory:at("IronSword").Amount:get() == 2,
		"dictionary restore after clear failed"
	)
	clearCapture(capture)

	local ownership = runtime:handle("ownership", fixture.DataId)
	assert(not ownership:owns("VIP", player), "VIP started owned")
	ownership:grantPerk(player, "VIP")
	assert(not ownership:owns("VIP", player), "buffered perk grant applied early")
	runtime:flush(context)
	assert(ownership:owns("VIP", player), "buffered perk grant did not commit")
	local ownershipEvent = assertDualPublished(capture, "ownershipChanged")
	assert(
		ownershipEvent.key == "VIP" and ownershipEvent.owned == true,
		"ownership event payload is wrong"
	)
	clearCapture(capture)
	local ownsHandle = ownership:ownsAuthoritative(player, "VIP")
	local ownsResult = awaitJob(
		runtime,
		ownership,
		ownsHandle,
		context,
		"authoritative ownership job"
	)
	assert(ownsResult.ok and ownsResult.value == true, "ownership job returned false")

	local monetization = runtime:handle("monetization", fixture.DataId)
	local purchaseHandle = monetization:purchase(player, {
		cost = {
			path = "Coins",
			amount = 10,
		},
		category = "NativeGate",
		itemId = "PurchasedBadge",
		grant = function(grantWrites: any)
			grantWrites.Queue:insert("PurchasedBadge")
		end,
		metadata = {
			Source = "StudioGate",
		},
	})
	assert(profile.Coins:get() == 100, "buffered purchase debited early")
	runtime:flush(context)
	local purchaseResult = monetization:takeResult(purchaseHandle)
	assert(
		purchaseResult ~= nil and purchaseResult.ok and purchaseResult.value,
		"native atomic purchase failed"
	)
	assert(profile.Coins:get() == 90, "native purchase did not debit")
	assert(profile.Queue:has("PurchasedBadge"), "native purchase grant did not commit")
	local purchaseEvents = monetization:getPurchases(player, {
		kind = "InGame",
	})
	assert(#purchaseEvents == 1, "native purchase log was not recorded")
	assert(
		purchaseEvents[1].itemId == "PurchasedBadge",
		"purchase log item id changed"
	)
	local insertedEvent = assertDualPublished(capture, "inserted")
	assert(
		insertedEvent.index == 0 and insertedEvent.value == "PurchasedBadge",
		"array insertion event did not use zero-based index"
	)
	clearCapture(capture)

	local receipts = runtime:handle("receipts", fixture.DataId)
	local receiptHandle = receipts:tryHandleReceipt({
		PlayerId = player.UserId,
		PlaceIdWherePurchased = 1,
		PurchaseId = "rovy-native-gate-receipt",
		ProductId = 987654,
		CurrencySpent = 25,
		CurrencyType = Enum.CurrencyType.Robux,
	})
	local receiptResult = awaitJob(
		runtime,
		receipts,
		receiptHandle,
		context,
		"native receipt job"
	)
	assert(
		receiptResult.ok
			and receiptResult.value == Enum.ProductPurchaseDecision.PurchaseGranted,
		"native receipt was not granted"
	)
	assert(profile.Coins:get() == 95, "typed product grant did not commit")
	local unknownTry = awaitJob(
		runtime,
		receipts,
		receipts:tryHandleReceipt({
			PlayerId = player.UserId,
			PlaceIdWherePurchased = 1,
			PurchaseId = "rovy-native-gate-unknown-try",
			ProductId = 123456789,
			CurrencySpent = 1,
			CurrencyType = Enum.CurrencyType.Robux,
		}),
		context,
		"unknown native tryHandleReceipt"
	)
	assert(
		unknownTry.ok and unknownTry.value == nil,
		"tryHandleReceipt did not fall through for an unknown product"
	)
	local unknownHandle = awaitJob(
		runtime,
		receipts,
		receipts:handleReceipt({
			PlayerId = player.UserId,
			PlaceIdWherePurchased = 1,
			PurchaseId = "rovy-native-gate-unknown-handle",
			ProductId = 123456789,
			CurrencySpent = 1,
			CurrencyType = Enum.CurrencyType.Robux,
		}),
		context,
		"unknown native handleReceipt"
	)
	assert(
		unknownHandle.ok
			and unknownHandle.value
				== Enum.ProductPurchaseDecision.NotProcessedYet,
		"handleReceipt weakened native fail-closed behavior"
	)
	clearCapture(capture)

	local giftCreditReceipt = awaitJob(
		runtime,
		receipts,
		receipts:tryHandleReceipt({
			PlayerId = player.UserId,
			PlaceIdWherePurchased = 1,
			PurchaseId = "rovy-native-gate-gift-credit",
			ProductId = 987655,
			CurrencySpent = 50,
			CurrencyType = Enum.CurrencyType.Robux,
		}),
		context,
		"native gift-credit receipt"
	)
	assert(
		giftCreditReceipt.ok
			and giftCreditReceipt.value
				== Enum.ProductPurchaseDecision.PurchaseGranted,
		"native gift-credit receipt was not granted"
	)
	local giftCreditEvent = assertDualPublished(capture, "giftCredit")
	assert(
		giftCreditEvent.player == player
			and giftCreditEvent.product == "VipGift",
		"native gift-credit event payload is wrong"
	)
	assert(
		monetization:getGiftCredits(player).VipGift == 1,
		"native gift credit was not readable"
	)
	clearCapture(capture)

	local giftRecipient = player.UserId + fixture.SharedUserIdOffset + 1
	local promptGiftResult = awaitJob(
		runtime,
		monetization,
		monetization:promptGift(player, "VipGift", giftRecipient),
		context,
		"credit-funded native gift prompt"
	)
	assert(
		promptGiftResult.ok and promptGiftResult.value,
		"credit-funded native gift prompt failed"
	)
	assert(
		monetization:getGiftCredits(player).VipGift == nil,
		"native gift prompt did not consume its credit"
	)
	local giftMailboxKey =
		`RovyScribeNativeRuntimeGate/PLAYER_{giftRecipient}`
	assert(
		fake.Mailboxes[giftMailboxKey] ~= nil
			and #fake.Mailboxes[giftMailboxKey] == 1
			and fake.Mailboxes[giftMailboxKey][1].ScribeGift == true,
		"native gift prompt did not durably enqueue the offline gift"
	)

	local unsafe = runtime:handle("unsafe", fixture.DataId)
	local profileStore = unsafe.profileStore :: any
	local injectedGift = profileStore:MessageAsync(
		`PLAYER_{player.UserId}`,
		{
			ScribeGift = true,
			GiftId = "rovy-native-gate-gift-delivery",
			PurchaseId = "rovy-native-gate-gift-delivery",
			Product = "VipGift",
			FromUserId = giftRecipient,
		}
	)
	assert(injectedGift, "native ProfileStore rejected the gift message")
	waitUntil("native gift delivery signal", function()
		runtime:flush(context)
		return latestOfKind(capture.sent, "giftReceived") ~= nil
	end)
	local giftReceivedEvent = assertDualPublished(capture, "giftReceived")
	assert(
		giftReceivedEvent.player == player
			and giftReceivedEvent.fromUserId == giftRecipient
			and giftReceivedEvent.product == "VipGift"
			and giftReceivedEvent.giftId
				== "rovy-native-gate-gift-delivery",
		"native gift-received event payload is wrong"
	)
	clearCapture(capture)

	local cooldowns = runtime:handle("cooldowns", fixture.DataId)
	assert(not cooldowns:peek(player, "Dash").onCooldown, "cooldown started armed")
	local cooldownHandle = cooldowns:onCooldown(player, "Dash", 30)
	assert(
		not cooldowns:peek(player, "Dash").onCooldown,
		"buffered cooldown armed before flush"
	)
	runtime:flush(context)
	local cooldownResult = cooldowns:takeResult(cooldownHandle)
	assert(
		cooldownResult ~= nil
			and cooldownResult.ok
			and not cooldownResult.value.onCooldown,
		"first cooldown arm returned wrong state"
	)
	assert(cooldowns:peek(player, "Dash").onCooldown, "cooldown did not arm")
	cooldowns:clear(player, "Dash")
	assert(cooldowns:peek(player, "Dash").onCooldown, "cooldown cleared early")
	runtime:flush(context)
	assert(not cooldowns:peek(player, "Dash").onCooldown, "cooldown did not clear")

	local persistence = runtime:handle("persistence", fixture.DataId)
	local saveHandle = persistence:saveNow(player, {
		force = true,
	})
	local saveResult = awaitJob(
		runtime,
		persistence,
		saveHandle,
		context,
		"native save job"
	)
	assert(saveResult.ok and saveResult.value, "native saveNow failed")
	local persistedKey =
		`RovyScribeNativeRuntimeGate/PLAYER_{player.UserId}`
	local persisted = fake.Persisted[persistedKey]
	assert(persisted ~= nil and persisted.Coins == 95, "save did not persist committed data")
	assert(persisted.Runtime == nil, "session field leaked into persistence")
	local saveInfo = persistence:getSaveInfo(player)
	assert(not saveInfo.dirty, "save info remained dirty after forced save")
	local saveEvent = assertDualPublished(capture, "save")
	assert(saveEvent.ok == true, "save event reported failure")
	clearCapture(capture)

	local offlineUserId = player.UserId + 1000000
	local offlineKey =
		`RovyScribeNativeRuntimeGate/PLAYER_{offlineUserId}`
	fake.Persisted[offlineKey] = persistedSeed(7)
	local getOfflineResult = awaitJob(
		runtime,
		persistence,
		persistence:getOffline(offlineUserId),
		context,
		"native offline read"
	)
	assert(
		getOfflineResult.ok
			and getOfflineResult.value ~= nil
			and getOfflineResult.value.Coins == 7,
		"native offline read returned wrong data"
	)
	assert(
		getOfflineResult.value.Runtime == nil,
		"offline projection exposed a session field"
	)
	local updateOfflineResult = awaitJob(
		runtime,
		persistence,
		persistence:updateOffline(offlineUserId, function(current: any)
			local updated = table.clone(current)
			updated.Coins = current.Coins + 2
			return updated
		end),
		context,
		"native offline update"
	)
	assert(updateOfflineResult.ok and updateOfflineResult.value, "offline update failed")
	assert(fake.Persisted[offlineKey].Coins == 9, "offline update was not durable")
	local versionsResult = awaitJob(
		runtime,
		persistence,
		persistence:listVersions(offlineUserId, 5),
		context,
		"native version list"
	)
	assert(
		versionsResult.ok and #versionsResult.value >= 1,
		"native version list is empty"
	)
	local versionId = versionsResult.value[1].versionId
	local versionResult = awaitJob(
		runtime,
		persistence,
		persistence:getVersion(offlineUserId, versionId),
		context,
		"native version read"
	)
	assert(
		versionResult.ok
			and versionResult.value ~= nil
			and versionResult.value.Coins == 9,
		"native version read returned wrong data"
	)
	local exportHandle = persistence["export"](persistence, offlineUserId)
	local exportResult = awaitJob(
		runtime,
		persistence,
		exportHandle,
		context,
		"native profile export"
	)
	assert(
		exportResult.ok
			and type(exportResult.value) == "string"
			and string.find(exportResult.value, '"Coins":9', 1, true) ~= nil,
		"native profile export omitted updated data"
	)
	local restoreResult = awaitJob(
		runtime,
		persistence,
		persistence:restoreVersion(offlineUserId, versionId),
		context,
		"native version restore"
	)
	assert(restoreResult.ok and restoreResult.value, "native version restore failed")
	local eraseResult = awaitJob(
		runtime,
		persistence,
		persistence:erase(offlineUserId),
		context,
		"native profile erase"
	)
	assert(eraseResult.ok and eraseResult.value, "native profile erase failed")
	assert(fake.Persisted[offlineKey] == nil, "native profile erase was not durable")

	local messaging = runtime:handle("messaging", fixture.DataId)
	local recipient = offlineUserId + 1
	local messageResult = awaitJob(
		runtime,
		messaging,
		messaging:send(recipient, {
			kind = "NativeGate",
			value = 95,
		}),
		context,
		"native durable message"
	)
	assert(messageResult.ok and messageResult.value, "native message send failed")
	local mailboxKey =
		`RovyScribeNativeRuntimeGate/PLAYER_{recipient}`
	assert(
		fake.Mailboxes[mailboxKey] ~= nil
			and #fake.Mailboxes[mailboxKey] == 1,
		"native durable message did not reach the fake ProfileStore mailbox"
	)
	clearCapture(capture)
	local onlineMessage = awaitJob(
		runtime,
		messaging,
		messaging:send(player.UserId, {
			kind = "OnlineNativeGate",
			value = 95,
		}),
		context,
		"native online message"
	)
	assert(onlineMessage.ok and onlineMessage.value, "online native message failed")
	local messageEvent = assertDualPublished(capture, "message")
	assert(
		messageEvent.player == player
			and messageEvent.value.kind == "OnlineNativeGate"
			and messageEvent.value.value == 95,
		"online message event payload is wrong"
	)
	clearCapture(capture)

	local leaderboards = runtime:handle("leaderboards", fixture.DataId)
	local topCoins = {}
	waitUntil("native leaderboard refresh", function()
		runtime:flush(context)
		topCoins = leaderboards:get("TopCoins", 10)
		return #topCoins >= 1
			and topCoins[1].userId == player.UserId
			and topCoins[1].score == 95
	end, 15)
	assert(
		leaderboards:getMyRank("TopCoins", player) == 1,
		"native server leaderboard rank is wrong"
	)

	local NativeLog = require(nativeRoot.Internal.Log)
	local NativeHealth = require(nativeRoot.Internal.Health)
	clearCapture(capture)
	NativeLog.Error(
		"Lifecycle",
		"NATIVE_GATE_ISSUE",
		"native gate diagnostic",
		{
			Source = "Studio",
		}
	)
	runtime:flush(context)
	local issueEvent = assertDualPublished(capture, "issue")
	assert(
		issueEvent.entry.code == "NATIVE_GATE_ISSUE"
			and issueEvent.entry.level == "Error"
			and issueEvent.entry.context.Source == "Studio",
		"native issue normalization is wrong"
	)
	clearCapture(capture)
	NativeHealth.SetCritical(true)
	runtime:flush(context)
	local degradedEvent = assertDualPublished(capture, "serviceStatus")
	assert(degradedEvent.status == "Degraded", "native status did not degrade")
	clearCapture(capture)
	NativeHealth.SetCritical(false)
	for _ = 1, 5 do
		NativeHealth.ReportSuccess("NativeGate")
	end
	runtime:flush(context)
	local healthyEvent = assertDualPublished(capture, "serviceStatus")
	assert(healthyEvent.status == "Healthy", "native status did not recover")
	clearCapture(capture)

	ReplicatedStorage:SetAttribute(SERVER_FEATURES_DONE, true)
	waitUntil("client final native assertions", function()
		return clientSignaled(player, CLIENT_FINAL_DONE)
	end)
	ownership:revokePerk(player, "VIP")
	assert(ownership:owns("VIP", player), "buffered perk revoke applied early")
	runtime:flush(context)
	assert(not ownership:owns("VIP", player), "buffered perk revoke did not commit")
	local revokeEvent = assertDualPublished(capture, "ownershipChanged")
	assert(
		revokeEvent.key == "VIP" and revokeEvent.owned == false,
		"ownership revoke event payload is wrong"
	)
	clearCapture(capture)
	local activeProfile = fake.ActiveProfiles[persistedKey]
	assert(activeProfile ~= nil, "fake active profile disappeared before session test")
	activeProfile:EndSession()
	waitUntil("native session end", function()
		runtime:flush(context)
		return reader:state(player) == "SessionEnded"
			and latestOfKind(capture.sent, "sessionEnded") ~= nil
	end)
	local sessionEvent = assertDualPublished(capture, "sessionEnded")
	assert(
		sessionEvent.player == player
			and type(sessionEvent.reason) == "string"
			and #sessionEvent.reason > 0,
		"native session end event lost player or reason"
	)
	ReplicatedStorage:SetAttribute(SERVER_STATE, "ok")
	print("ROVY_SCRIBE_NATIVE_SERVER_OK", binding.version)
end

local ok, reason = xpcall(run, debug.traceback)
if not ok then
	ReplicatedStorage:SetAttribute(SERVER_STATE, `error: {tostring(reason)}`)
	ReplicatedStorage:SetAttribute(SERVER_FEATURES_DONE, false)
	warn("ROVY_SCRIBE_NATIVE_SERVER_FAILED", reason)
	error(reason)
end
