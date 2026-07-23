--!nocheck

local help = require("../harness/scribe")

local function class()
	local C = {}
	C.__index = C
	C.new = function()
		return setmetatable({}, C)
	end
	return C
end

local function signal()
	local listeners = {}
	local value = {
		Connect = function(self, callback)
			table.insert(listeners, callback)
			local active = true
			return {
				Disconnect = function()
					if not active then return end
					active = false
					for index, current in listeners do
						if current == callback then
							table.remove(listeners, index)
							break
						end
					end
				end,
			}
		end,
		Fire = function(self, ...)
			for _, callback in table.clone(listeners) do
				callback(...)
			end
		end,
		count = function()
			return #listeners
		end,
	}
	return value
end

local function registerEvent(coreRovy, scribe, ctor, data, kind, path)
	coreRovy:__event(ctor, {})
	local metadata = {
		id = "game/" .. tostring(ctor),
		dataId = data.id,
		kind = kind,
	}
	if path ~= nil then metadata.path = path end
	scribe.rovyScribe:__event(ctor, metadata)
end

local function registerReaderSystem(coreRovy, schedule, id, events)
	local params = {}
	for _, event in events do
		table.insert(params, { kind = "eventReader", ctor = event })
	end
	coreRovy:__system(help.sysClass(function() end), {
		id = id,
		schedule = schedule,
		params = params,
	})
end

local function readEvents(app, ctor)
	local output = {}
	app.eventRegistry:readerForEach(ctor, function(event)
		table.insert(output, event)
	end)
	return output
end

local function registerData(scribe, id, template)
	return scribe.rovyScribe:__data({
		id = id,
		name = id,
		profileStoreIndex = id,
		profileKeyPrefix = "PLAYER_",
		template = template,
		options = {},
	})
end

local function serverChangeModule(baseModule)
	local current = 100
	local changed = {}
	local subscriptionCount = 0
	local batching = false
	local batchBefore

	local function publish(before)
		for _, callback in table.clone(changed) do
			callback(current, before)
		end
	end

	local coins = {
		Changed = function(callback)
			subscriptionCount += 1
			table.insert(changed, callback)
			return function() end
		end,
		Increment = function(amount)
			local before = current
			current += amount
			if batching then
				if batchBefore == nil then batchBefore = before end
			else
				publish(before)
			end
		end,
	}
	local root = { Coins = coins }
	local server = {
		GetState = function()
			return "Ready"
		end,
		Get = function()
			return root
		end,
		Batch = function(_, callback)
			batching = true
			batchBefore = nil
			callback()
			batching = false
			if batchBefore ~= nil and batchBefore ~= current then
				publish(batchBefore)
			end
		end,
	}
	baseModule.new = function()
		return {
			Client = {},
			Server = server,
		}
	end
	return {
		current = function() return current end,
		subscriptions = function() return subscriptionCount end,
	}
end

local function clientChangeModule(baseModule)
	local ready = false
	local coins = 10
	local changed = {}
	local profileChanged = {}
	local inserted = {}
	local removed = {}
	local keyAdded = {}
	local keyRemoved = {}

	local root = {
		Coins = {
			Changed = function(callback)
				table.insert(changed, callback)
				return function() end
			end,
			Set = function(value)
				local before = coins
				coins = value
				for _, callback in table.clone(changed) do
					callback(value, before)
				end
			end,
		},
		Profile = {
			Name = {},
			Changed = function(callback)
				table.insert(profileChanged, callback)
				return function() end
			end,
		},
		List = {
			OnInsert = function(callback)
				table.insert(inserted, callback)
				return function() end
			end,
			OnRemove = function(callback)
				table.insert(removed, callback)
				return function() end
			end,
		},
		Inventory = {
			OnKeyAdded = function(callback)
				table.insert(keyAdded, callback)
				return function() end
			end,
			OnKeyRemoved = function(callback)
				table.insert(keyRemoved, callback)
				return function() end
			end,
		},
		IsReady = function()
			return ready
		end,
	}
	baseModule.new = function()
		return {
			Client = root,
			Server = {},
		}
	end
	return {
		setReady = function(value) ready = value end,
		fireCoins = function(after, before)
			coins = after
			for _, callback in table.clone(changed) do
				callback(after, before)
			end
		end,
		fireProfile = function(value)
			for _, callback in table.clone(profileChanged) do
				callback(value, value)
			end
		end,
		fireInsert = function(value, index)
			for _, callback in table.clone(inserted) do callback(value, index) end
		end,
		fireRemove = function(value, index)
			for _, callback in table.clone(removed) do callback(value, index) end
		end,
		fireKeyAdded = function(key, value)
			for _, callback in table.clone(keyAdded) do callback(key, value) end
		end,
		fireKeyRemoved = function(key, value)
			for _, callback in table.clone(keyRemoved) do callback(key, value) end
		end,
	}
end

return function(TS, t)
	local clientScribe = help.load(TS, "client")
	local serverScribe = help.load(TS, "server")
	local core = TS.import(nil, TS.getModule(nil, "@rovy", "rovy-core"))
	local App = core.App
	local coreRovy = core.rovy

	t.describe("@rovy/scribe change journal and Rovy events", function()
		t.it("fans one native leaf subscription into send and trigger and converges observer writes", function()
			coreRovy:__reset()
			serverScribe.rovyScribe:__reset()
			local Update = {}
			coreRovy:__schedule(Update, { runOnStart = false })
			local data = registerData(serverScribe, "EventServer", {
				Coins = serverScribe.s:int(0),
			})
			local CoinsChanged = class()
			local CoinsChangedCopy = class()
			registerEvent(coreRovy, serverScribe, CoinsChanged, data, "changed", "Coins")
			registerEvent(coreRovy, serverScribe, CoinsChangedCopy, data, "changed", "Coins")
			registerReaderSystem(
				coreRovy,
				Update,
				"game/EventReaders",
				{ CoinsChanged, CoinsChangedCopy }
			)

			local observerEvents = {}
			local Observer = help.sysClass(function(_, event, writer)
				table.insert(observerEvents, event)
				if event.after == 150 then
					local writes = writer["for"](writer, event.player)
					writes.Coins:increment(25)
				end
			end)
			coreRovy:__observer(Observer, {
				event = CoinsChanged,
				priority = 0,
				params = {
					{ kind = "event" },
					{
						kind = "external",
						id = serverScribe.serverWriterParamId(data.id),
					},
				},
			})

			local module = help.nativeModule()
			local controls = serverChangeModule(module)
			local plugin = serverScribe.ScribeServerPlugin.new({ module = module })
			local app = App.new()
			app:addPlugin(plugin)
			app:start()
			local player = { Name = "JournalPlayer" }
			local writer = plugin.runtime:handle("server-writer", data.id)
			local writes = writer["for"](writer, player)

			writes.Coins:increment(20)
			writes.Coins:increment(30)
			app:flush()

			t.expect(controls.subscriptions()).toBe(1)
			t.expect(controls.current()).toBe(175)
			t.expect(#observerEvents).toBe(2)
			t.expect(observerEvents[1].before).toBe(100)
			t.expect(observerEvents[1].after).toBe(150)
			t.expect(observerEvents[2].before).toBe(150)
			t.expect(observerEvents[2].after).toBe(175)
			t.expect(observerEvents[1].source).toBe("serverWrite")
			t.expect(observerEvents[1].player).toBe(player)
			t.expect(table.isfrozen(observerEvents[1])).toBe(true)

			local primary = readEvents(app, CoinsChanged)
			local copy = readEvents(app, CoinsChangedCopy)
			t.expect(#primary).toBe(2)
			t.expect(#copy).toBe(2)
			-- The same immutable instance feeds EventReader and @observer.
			t.expect(primary[1]).toBe(observerEvents[1])
		end)

		t.it("labels initial replication and local changes and preserves structural payloads", function()
			coreRovy:__reset()
			clientScribe.rovyScribe:__reset()
			local Update = {}
			coreRovy:__schedule(Update, { runOnStart = false })
			local data = registerData(clientScribe, "EventClient", {
				Coins = clientScribe.s:int(0),
				Profile = { Name = clientScribe.s:string("") },
				List = clientScribe.s:arrayOf({ Amount = clientScribe.s:int(1) }),
				Inventory = clientScribe.s:dictOf({ Amount = clientScribe.s:int(1) }),
			})
			local CoinsChanged = class()
			local ProfileChanged = class()
			local Inserted = class()
			local Removed = class()
			local KeyAdded = class()
			local KeyRemoved = class()
			registerEvent(coreRovy, clientScribe, CoinsChanged, data, "changed", "Coins")
			registerEvent(coreRovy, clientScribe, ProfileChanged, data, "changed", "Profile")
			registerEvent(coreRovy, clientScribe, Inserted, data, "inserted", "List")
			registerEvent(coreRovy, clientScribe, Removed, data, "removed", "List")
			registerEvent(coreRovy, clientScribe, KeyAdded, data, "keyAdded", "Inventory")
			registerEvent(coreRovy, clientScribe, KeyRemoved, data, "keyRemoved", "Inventory")
			registerReaderSystem(coreRovy, Update, "game/ClientEventReaders", {
				CoinsChanged,
				ProfileChanged,
				Inserted,
				Removed,
				KeyAdded,
				KeyRemoved,
			})

			local module = help.nativeModule()
			local controls = clientChangeModule(module)
			local plugin = clientScribe.ScribeClientPlugin.new({ module = module })
			local app = App.new()
			app:addPlugin(plugin)
			app:start()

			controls.fireCoins(20, 0)
			controls.fireProfile({ Name = "Initial" })
			app:flush()
			controls.setReady(true)
			controls.fireCoins(25, 20)
			controls.fireInsert({ Amount = 2 }, 1)
			controls.fireRemove({ Amount = 3 }, 2)
			controls.fireKeyAdded("Potion", { Amount = 4 })
			controls.fireKeyRemoved("Old", { Amount = 5 })
			app:flush()
			local localWriter = plugin.runtime:handle("local-writer", data.id)
			localWriter.Coins:set(30)
			app:flush()

			local coins = readEvents(app, CoinsChanged)
			t.expect(#coins).toBe(3)
			t.expect(coins[1].source).toBe("initialSnapshot")
			t.expect(coins[2].source).toBe("replication")
			t.expect(coins[3].source).toBe("clientLocalWrite")

			local profiles = readEvents(app, ProfileChanged)
			t.expect(profiles[1].before).toBeUndefined()
			t.expect(table.isfrozen(profiles[1].after)).toBe(true)

			local inserts = readEvents(app, Inserted)
			local removes = readEvents(app, Removed)
			local added = readEvents(app, KeyAdded)
			local removedKeys = readEvents(app, KeyRemoved)
			t.expect(inserts[1].index).toBe(0)
			t.expect(removes[1].index).toBe(1)
			t.expect(inserts[1].value.Amount).toBe(2)
			t.expect(table.isfrozen(inserts[1].value)).toBe(true)
			t.expect(added[1].key).toBe("Potion")
			t.expect(removedKeys[1].key).toBe("Old")
			t.expect(added[1].source).toBe("replication")
		end)

		t.it("defers ready shared leaderboard ownership status and issue signals to flush", function()
			coreRovy:__reset()
			clientScribe.rovyScribe:__reset()
			local data = registerData(clientScribe, "PathlessClient", {
				Coins = clientScribe.s:int(0),
				Public = clientScribe.s:shared({ Title = clientScribe.s:string("") }),
			})
			local kinds = {
				{ "ready", class() },
				{ "sharedChanged", class() },
				{ "leaderboard", class() },
				{ "ownershipChanged", class() },
				{ "serviceStatus", class() },
				{ "issue", class() },
			}
			local seen = {}
			for _, pair in kinds do
				local kind, Event = pair[1], pair[2]
				registerEvent(coreRovy, clientScribe, Event, data, kind)
				local Observer = help.sysClass(function(_, event)
					table.insert(seen, { kind = kind, event = event })
				end)
				coreRovy:__observer(Observer, {
					event = Event,
					priority = 0,
					params = { { kind = "event" } },
				})
			end

			local module = help.nativeModule()
			module.OnIssue = signal()
			local shared = signal()
			local leaderboard = signal()
			local ownership = signal()
			local status = signal()
			local client = {
				IsReady = function() return true end,
				Coins = {},
				Public = { Title = {} },
				OnSharedChanged = shared,
				OnLeaderboard = leaderboard,
				OnOwnershipChanged = ownership,
				OnServiceStatus = status,
				GetLeaderboard = function()
					return {
						{ Rank = 1, UserId = 42, Name = "Cave", Score = 99 },
					}
				end,
			}
			module.new = function()
				return { Client = client, Server = {} }
			end

			local plugin = clientScribe.ScribeClientPlugin.new({ module = module })
			local app = App.new()
			app:addPlugin(plugin)
			app:start()
			shared:Fire(42, { Public = { Title = "Strong" } })
			leaderboard:Fire("Coins")
			ownership:Fire("VIP", true)
			status:Fire("Degraded")
			module.OnIssue:Fire({
				At = 5,
				Level = "Error",
				Category = "Persistence",
				Code = "SAVE",
				Message = "bad",
				Context = { Attempts = 2 },
			})
			t.expect(#seen).toBe(0)
			app:flush()
			t.expect(#seen).toBe(6)

			local byKind = {}
			for _, item in seen do byKind[item.kind] = item.event end
			t.expect(byKind.ready.definition).toBe(data)
			t.expect(byKind.sharedChanged.userId).toBe(42)
			t.expect(byKind.sharedChanged.value.Public.Title).toBe("Strong")
			t.expect(table.isfrozen(byKind.sharedChanged.value)).toBe(true)
			t.expect(byKind.leaderboard.entries[1].rank).toBe(1)
			t.expect(byKind.leaderboard.entries[1].score).toBe(99)
			t.expect(byKind.ownershipChanged.key).toBe("VIP")
			t.expect(byKind.ownershipChanged.owned).toBe(true)
			t.expect(byKind.serviceStatus.status).toBe("Degraded")
			t.expect(byKind.issue.entry.code).toBe("SAVE")
			t.expect(byKind.issue.entry.context.Attempts).toBe(2)
			t.expect(table.isfrozen(byKind.issue.entry)).toBe(true)
		end)

		t.it("bridges authoritative lifecycle save anomaly gift ownership and message signals", function()
			coreRovy:__reset()
			serverScribe.rovyScribe:__reset()
			local data = registerData(serverScribe, "PathlessServer", {
				Coins = serverScribe.s:int(0),
			})
			local kinds = {
				{ "save", class() },
				{ "sessionEnded", class() },
				{ "anomaly", class() },
				{ "giftReceived", class() },
				{ "giftCredit", class() },
				{ "ownershipChanged", class() },
				{ "message", class() },
				{ "serviceStatus", class() },
			}
			local seen = {}
			for _, pair in kinds do
				local kind, Event = pair[1], pair[2]
				registerEvent(coreRovy, serverScribe, Event, data, kind)
				coreRovy:__observer(help.sysClass(function(_, event)
					seen[kind] = event
				end), {
					event = Event,
					priority = 0,
					params = { { kind = "event" } },
				})
			end

			local module = help.nativeModule()
			module.OnStatusChanged = signal()
			local signals = {
				OnSave = signal(),
				SessionEnded = signal(),
				OnAnomaly = signal(),
				OnGiftReceived = signal(),
				OnGiftCredit = signal(),
				OnOwnershipChanged = signal(),
				OnMessage = signal(),
			}
			local server = {
				OnSave = signals.OnSave,
				SessionEnded = signals.SessionEnded,
				OnAnomaly = signals.OnAnomaly,
				OnGiftReceived = signals.OnGiftReceived,
				OnGiftCredit = signals.OnGiftCredit,
				OnOwnershipChanged = signals.OnOwnershipChanged,
				OnMessage = signals.OnMessage,
				GetSaveInfo = function()
					return {
						LastSaveAt = 20,
						LastResult = "Ok",
						Dirty = false,
						Size = 512,
					}
				end,
			}
			module.new = function()
				return { Client = {}, Server = server }
			end
			local plugin = serverScribe.ScribeServerPlugin.new({ module = module })
			local app = App.new()
			app:addPlugin(plugin)
			app:start()
			local player = { Name = "SignalPlayer" }
			signals.OnSave:Fire({
				Player = player,
				Ok = true,
				Duration = 0.25,
				At = 21,
			})
			signals.SessionEnded:Fire(player, "session-ended")
			signals.OnAnomaly:Fire({
				Player = player,
				Path = { "Coins" },
				Value = -1,
				Reason = "OutOfBounds",
			})
			signals.OnGiftReceived:Fire(player, {
				FromUserId = 9,
				Product = "Boost",
				GiftId = "gift-1",
			})
			signals.OnGiftCredit:Fire(player, "Boost")
			signals.OnOwnershipChanged:Fire(player, "VIP", true)
			signals.OnMessage:Fire(player, { Kind = "Mail" })
			module.OnStatusChanged:Fire("Outage", "Healthy")
			t.expect(next(seen)).toBeUndefined()
			app:flush()

			t.expect(seen.save.ok).toBe(true)
			t.expect(seen.save.duration).toBe(0.25)
			t.expect(seen.save.saveInfo.lastSaveAt).toBe(20)
			t.expect(seen.save.saveInfo.size).toBe(512)
			t.expect(seen.sessionEnded.reason).toBe("session-ended")
			t.expect(seen.anomaly.path[1]).toBe("Coins")
			t.expect(seen.anomaly.value).toBe(-1)
			t.expect(seen.giftReceived.fromUserId).toBe(9)
			t.expect(seen.giftReceived.giftId).toBe("gift-1")
			t.expect(seen.giftCredit.product).toBe("Boost")
			t.expect(seen.ownershipChanged.owned).toBe(true)
			t.expect(seen.message.value.Kind).toBe("Mail")
			t.expect(table.isfrozen(seen.message.value)).toBe(true)
			t.expect(seen.serviceStatus.status).toBe("Outage")
		end)
	end)
end
