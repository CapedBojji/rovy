--!nocheck

local help = require("../harness/scribe")

local function signal()
	local listeners = {}
	return {
		Connect = function(_self, callback)
			table.insert(listeners, callback)
			return {
				Disconnect = function() end,
			}
		end,
		Fire = function(_self, ...)
			for _, callback in table.clone(listeners) do
				callback(...)
			end
		end,
	}
end

local function registerData(scribe, id)
	return scribe.rovyScribe:__data({
		id = id,
		name = id,
		profileStoreIndex = id,
		profileKeyPrefix = "PLAYER_",
		template = {
			Coins = scribe.s:int(0, { min = 0 }),
		},
		options = {},
	})
end

local function serverFeatureModule(help)
	local module = help.nativeModule()
	local calls = {}
	local perks = {}
	local cooldowns = {}
	local receipts = {}
	local records = {}
	local coins = 500
	local sessionEnded = signal()
	local root = {
		Coins = {
			Get = function()
				return coins
			end,
			Clone = function()
				return coins
			end,
			Default = function()
				return 0
			end,
			Min = function()
				return 0
			end,
			Max = function()
				return nil
			end,
			Set = function(value)
				coins = value
			end,
			Update = function(transform)
				coins = transform(coins)
			end,
			Increment = function(amount)
				table.insert(calls, "GrantIncrement:" .. tostring(amount))
				coins += amount
			end,
			Decrement = function(amount)
				coins -= amount
			end,
		},
	}
	local server = {
		SessionEnded = sessionEnded,
		Get = function()
			return root
		end,
		Batch = function(player, callback)
			table.insert(calls, "BatchStart")
			if player.FailBatch then
				error("batch unavailable")
			end
			callback()
			table.insert(calls, "BatchEnd")
		end,
		GetLeaderboard = function(name, limit)
			table.insert(
				calls,
				"GetLeaderboard:" .. name .. ":" .. tostring(limit)
			)
			return {
				{ Rank = 1, UserId = 10, Name = "A", Score = 900 },
				{ Rank = 2, UserId = 20, Name = "B", Score = 800 },
			}
		end,
		GetMyRank = function(player, name)
			table.insert(calls, "GetMyRank:" .. player.Name .. ":" .. name)
			return 7
		end,
		Owns = function(player, key)
			table.insert(calls, "Owns:" .. player.Name .. ":" .. key)
			return perks[key] == true or key == "GamePass"
		end,
		OwnsAsync = function(player, key)
			table.insert(calls, "OwnsAsync:" .. player.Name .. ":" .. key)
			return key == "Authoritative"
		end,
		GrantPerk = function(_player, key)
			table.insert(calls, "GrantPerk:" .. key)
			perks[key] = true
		end,
		RevokePerk = function(_player, key)
			table.insert(calls, "RevokePerk:" .. key)
			perks[key] = nil
		end,
		PromptGift = function(_buyer, productName, recipientUserId)
			table.insert(
				calls,
				"PromptGift:" .. productName .. ":" .. tostring(recipientUserId)
			)
			if productName == "Blocked" then
				return false, "gift blocked"
			end
			return true
		end,
		GetGiftCredits = function()
			return {
				Coins100 = 2,
			}
		end,
		Purchase = function(_player, spec)
			table.insert(
				calls,
				"Purchase:" .. spec.Cost.Path .. ":" ..
					tostring(spec.Cost.Amount) .. ":" .. spec.ItemId
			)
			if spec.ItemId == "TooExpensive" then
				return false, "insufficient funds"
			end
			if spec.ItemId == "Explode" then
				error("purchase exploded")
			end
			if spec.Grant then
				spec.Grant(root)
			end
			return true
		end,
		RecordPurchase = function(_player, record)
			table.insert(calls, "RecordPurchase:" .. record.ItemId)
			table.insert(records, record)
		end,
		GetPurchases = function(_player, filter)
			table.insert(
				calls,
				"GetPurchases:" ..
					tostring(filter and filter.Kind) .. ":" ..
					tostring(filter and filter.Limit)
			)
			return {
				{
					Kind = "InGame",
					Category = "Potion",
					ItemId = "Health",
					Currency = "Coins",
					Amount = 25,
					Ts = 200,
					Meta = { Region = "US" },
				},
				{
					Kind = "Robux",
					Category = "Currency",
					Product = "Coins100",
					PurchaseId = "receipt-1",
					PriceInRobux = 99,
					From = { Type = "Direct" },
					Ts = 100,
				},
			}
		end,
		OnCooldown = function(_player, key, seconds)
			local remaining = cooldowns[key]
			if remaining then
				return true, remaining
			end
			cooldowns[key] = seconds
			table.insert(calls, "OnCooldown:" .. key)
			return false, seconds
		end,
		PeekCooldown = function(_player, key)
			local remaining = cooldowns[key]
			return remaining ~= nil, remaining or 0
		end,
		ClearCooldown = function(_player, key)
			table.insert(calls, "ClearCooldown:" .. key)
			cooldowns[key] = nil
		end,
		HandleReceipt = function(receipt)
			table.insert(receipts, receipt)
			return "PurchaseGranted"
		end,
		TryHandleReceipt = function(receipt)
			table.insert(receipts, receipt)
			if receipt.ProductId == 404 then return nil end
			return "PurchaseGranted"
		end,
	}
	module.new = function()
		return {
			Client = {},
			Server = server,
		}
	end
	return module, {
		calls = calls,
		perks = perks,
		cooldowns = cooldowns,
		records = records,
		receipts = receipts,
		coins = function()
			return coins
		end,
		sessionEnded = sessionEnded,
	}
end

local function clientFeatureModule(help)
	local module = help.nativeModule()
	local ready = false
	local calls = {}
	local client = {
		Coins = {
			Get = function()
				return 0
			end,
			Clone = function()
				return 0
			end,
			Default = function()
				return 0
			end,
			Min = function()
				return 0
			end,
			Max = function()
				return nil
			end,
			Set = function() end,
			Update = function() end,
			Increment = function() end,
			Decrement = function() end,
		},
		IsReady = function()
			return ready
		end,
		GetLeaderboard = function(name, limit)
			table.insert(
				calls,
				"GetLeaderboard:" .. name .. ":" .. tostring(limit)
			)
			return {
				{ Rank = 3, UserId = 30, Name = "Client", Score = 700 },
			}
		end,
		GetMyRank = function(name)
			table.insert(calls, "GetMyRank:" .. name)
			return 12
		end,
		Owns = function(key)
			table.insert(calls, "Owns:" .. key)
			return key == "VIP"
		end,
		OwnsAsync = function(key, timeout)
			table.insert(
				calls,
				"OwnsAsync:" .. key .. ":" .. tostring(timeout)
			)
			return key == "VIP"
		end,
		GetGiftCredits = function()
			table.insert(calls, "GetGiftCredits")
			return { Coins100 = 3 }
		end,
		GetPurchases = function(filter)
			table.insert(
				calls,
				"GetPurchases:" .. tostring(filter and filter.Kind)
			)
			return {
				{
					Kind = "Robux",
					Product = "Coins100",
					PurchaseId = "client-receipt",
					PriceInRobux = 99,
					Ts = 300,
				},
			}
		end,
	}
	module.new = function()
		return {
			Client = client,
			Server = {},
		}
	end
	return module, {
		calls = calls,
		setReady = function(value)
			ready = value
		end,
	}
end

return function(TS, t)
	local clientScribe = help.load(TS, "client")
	local serverScribe = help.load(TS, "server")
	local core = TS.import(nil, TS.getModule(nil, "@rovy", "rovy-core"))
	local App = core.App
	local coreRovy = core.rovy

	t.describe("@rovy/scribe feature services", function()
		t.it("maps server reads, buffered feature writes, and yielding jobs", function()
			coreRovy:__reset()
			serverScribe.rovyScribe:__reset()
			local Update = {}
			coreRovy:__schedule(Update, { runOnStart = false })
			local data = registerData(serverScribe, "game/ServerFeatures")
			local leaderboards
			local monetization
			local ownership
			local receipts
			local cooldowns
			local Capture = help.sysClass(function(_, b, m, o, r, c)
				leaderboards = b
				monetization = m
				ownership = o
				receipts = r
				cooldowns = c
			end)
			coreRovy:__system(Capture, {
				id = "game/CaptureServerFeatures",
				schedule = Update,
				params = {
					{
						kind = "external",
						id = serverScribe.leaderboardsParamId(data.id),
					},
					{
						kind = "external",
						id = serverScribe.monetizationParamId(data.id),
					},
					{
						kind = "external",
						id = serverScribe.ownershipParamId(data.id),
					},
					{
						kind = "external",
						id = serverScribe.receiptsParamId(data.id),
					},
					{
						kind = "external",
						id = serverScribe.cooldownsParamId(data.id),
					},
				},
			})
			local module, controls = serverFeatureModule(help)
			local app = App.new()
			local plugin = serverScribe.ScribeServerPlugin.new({
				module = module,
			})
			app:addPlugin(plugin)
			app:start()
			app:runSchedule(Update)
			local player = {
				Name = "FeaturePlayer",
			}

			local board = leaderboards:get("Coins", 2)
			t.expect(#board).toBe(2)
			t.expect(board[1].rank).toBe(1)
			t.expect(board[1].userId).toBe(10)
			t.expect(table.isfrozen(board)).toBe(true)
			t.expect(table.isfrozen(board[1])).toBe(true)
			t.expect(leaderboards:getMyRank("Coins", player)).toBe(7)
			t.expect(ownership:owns("GamePass", player)).toBe(true)
			local credits = monetization:getGiftCredits(player)
			t.expect(credits.Coins100).toBe(2)
			t.expect(table.isfrozen(credits)).toBe(true)

			local purchases = monetization:getPurchases(player, {
				kind = "Robux",
				limit = 5,
			})
			t.expect(#purchases).toBe(2)
			t.expect(purchases[1].itemId).toBe("Health")
			t.expect(purchases[1].currency).toBe("Coins")
			t.expect(purchases[1].metadata.Region).toBe("US")
			t.expect(purchases[2].itemId).toBe("Coins100")
			t.expect(purchases[2].purchaseId).toBe("receipt-1")
			t.expect(purchases[2].from.Type).toBe("Direct")
			t.expect(table.isfrozen(purchases[1].metadata)).toBe(true)

			local purchaseRecord = {
				category = "Support",
				itemId = "Manual",
				metadata = { Source = "Admin" },
			}
			ownership:grantPerk(player, "RewardPerk")
			monetization:recordPurchase(player, purchaseRecord)
			cooldowns:clear(player, "Daily")
			purchaseRecord.metadata.Source = "Mutated"
			t.expect(controls.perks.RewardPerk).toBeUndefined()
			t.expect(#controls.records).toBe(0)
			app:flush()
			t.expect(controls.perks.RewardPerk).toBe(true)
			t.expect(#controls.records).toBe(1)
			t.expect(controls.records[1].Meta.Source).toBe("Admin")
			t.expect(table.isfrozen(controls.records[1].Meta)).toBe(true)

			local authoritative = ownership:ownsAuthoritative(
				player,
				"Authoritative"
			)
			local gift = monetization:promptGift(player, "Coins100", 22)
			local blockedGift = monetization:promptGift(
				player,
				"Blocked",
				22
			)
			local metadata = { Region = "US" }
			local purchase = monetization:purchase(player, {
				cost = {
					path = "Coins",
					amount = 25,
				},
				category = "Potion",
				itemId = "HealthPotion",
				metadata = metadata,
				grant = function(writes)
					writes.Coins:increment(10)
				end,
			})
			metadata.Region = "Mutated"
			local failedPurchase = monetization:purchase(player, {
				cost = {
					path = "Coins",
					amount = 999,
				},
				itemId = "TooExpensive",
			})
			local cooldown = cooldowns:onCooldown(player, "Daily", 60)
			local receipt = {
				PlayerId = 44,
				PlaceIdWherePurchased = 55,
				PurchaseId = "receipt-44",
				ProductId = 66,
				CurrencySpent = 99,
			}
			local handled = receipts:handleReceipt(receipt)
			receipt.PurchaseId = "mutated"
			local unknown = receipts:tryHandleReceipt({
				PlayerId = 44,
				PlaceIdWherePurchased = 55,
				PurchaseId = "receipt-404",
				ProductId = 404,
				CurrencySpent = 99,
			})
			app:flush()

			t.expect(ownership:takeResult(authoritative).value).toBe(true)
			t.expect(monetization:takeResult(gift).value).toBe(true)
			t.expect(monetization:takeResult(blockedGift).error)
				.toBe("gift blocked")
			t.expect(monetization:takeResult(purchase).value).toBe(true)
			t.expect(monetization:takeResult(failedPurchase).error)
				.toBe("insufficient funds")
			local sawPurchaseFailure = false
			for _, failure in plugin.runtime:drainWriteFailures() do
				if failure.error == "insufficient funds" then
					sawPurchaseFailure = true
				end
			end
			t.expect(sawPurchaseFailure).toBe(true)
			t.expect(controls.coins()).toBe(510)
			t.expect(
				table.concat(controls.calls, ","):find(
					"Purchase:Coins:25:HealthPotion",
					1,
					true
				) ~= nil
			).toBe(true)
			t.expect(cooldowns:takeResult(cooldown).value.onCooldown)
				.toBe(false)
			t.expect(cooldowns:peek(player, "Daily").remaining).toBe(60)
			t.expect(receipts:takeResult(handled).value)
				.toBe("PurchaseGranted")
			t.expect(receipts:takeResult(unknown).value).toBeUndefined()
			t.expect(controls.receipts[1].PurchaseId).toBe("receipt-44")
			t.expect(table.isfrozen(controls.receipts[1])).toBe(true)
			t.expect(monetization:hasResult(authoritative)).toBe(false)

			ownership:revokePerk(player, "RewardPerk")
			app:flush()
			t.expect(controls.perks.RewardPerk).toBeUndefined()
			t.expect(function()
				leaderboards:get("Coins", 0)
			end).toThrow()
			t.expect(function()
				monetization:purchase(player, {
					cost = { path = "Coins", amount = 0 },
					itemId = "Invalid",
				})
			end).toThrow()

			local nativeFailure = monetization:purchase(player, {
				cost = { path = "Coins", amount = 1 },
				itemId = "Explode",
			})
			app:flush()
			t.expect(
				monetization:takeResult(nativeFailure).error:find(
					"purchase-error:",
					1,
					true
				) ~= nil
			).toBe(true)

			local batchFailure = monetization:purchase(
				{ Name = "NoBatch", FailBatch = true },
				{
					cost = { path = "Coins", amount = 1 },
					itemId = "NeverRuns",
				}
			)
			app:flush()
			t.expect(
				monetization:takeResult(batchFailure).error:find(
					"purchase-write-failed:",
					1,
					true
				) ~= nil
			).toBe(true)

			local leavingPlayer = { Name = "Leaving" }
			local canceled = monetization:purchase(leavingPlayer, {
				cost = { path = "Coins", amount = 1 },
				itemId = "Canceled",
			})
			controls.sessionEnded:Fire(leavingPlayer, "session-ended")
			app:flush()
			t.expect(monetization:takeResult(canceled).error)
				.toBe("session-ended")
			t.expect(
				table.concat(controls.calls, ","):find(
					"Purchase:Coins:1:Canceled",
					1,
					true
				)
			).toBeUndefined()
		end)

		t.it("keeps client feature reads non-yielding behind readiness", function()
			coreRovy:__reset()
			clientScribe.rovyScribe:__reset()
			local Update = {}
			coreRovy:__schedule(Update, { runOnStart = false })
			local data = registerData(clientScribe, "game/ClientFeatures")
			local leaderboards
			local monetization
			local ownership
			local Capture = help.sysClass(function(_, b, m, o)
				leaderboards = b
				monetization = m
				ownership = o
			end)
			coreRovy:__system(Capture, {
				id = "game/CaptureClientFeatures",
				schedule = Update,
				params = {
					{
						kind = "external",
						id = clientScribe.leaderboardsParamId(data.id),
					},
					{
						kind = "external",
						id = clientScribe.monetizationParamId(data.id),
					},
					{
						kind = "external",
						id = clientScribe.ownershipParamId(data.id),
					},
				},
			})
			local module, controls = clientFeatureModule(help)
			local app = App.new()
			app:addPlugin(clientScribe.ScribeClientPlugin.new({
				module = module,
			}))
			app:start()
			app:runSchedule(Update)

			t.expect(ownership:owns("VIP")).toBe(false)
			t.expect(next(monetization:getGiftCredits())).toBeUndefined()
			t.expect(#monetization:getPurchases()).toBe(0)
			t.expect(#controls.calls).toBe(0)

			controls.setReady(true)
			t.expect(ownership:owns("VIP")).toBe(true)
			t.expect(monetization:getGiftCredits().Coins100).toBe(3)
			local purchases = monetization:getPurchases(nil, {
				kind = "Robux",
			})
			t.expect(purchases[1].itemId).toBe("Coins100")
			t.expect(purchases[1].priceInRobux).toBe(99)
			t.expect(leaderboards:get("Coins", 1)[1].score).toBe(700)
			t.expect(leaderboards:getMyRank("Coins")).toBe(12)

			local synced = ownership:ownsSynced("VIP", 4)
			app:flush()
			t.expect(ownership:takeResult(synced).value).toBe(true)
			t.expect(
				table.concat(controls.calls, ","):find(
					"OwnsAsync:VIP:4",
					1,
					true
				) ~= nil
			).toBe(true)
			t.expect(function()
				ownership:ownsAuthoritative({}, "VIP")
			end).toThrow()
			t.expect(function()
				monetization:promptGift({}, "Coins100", 10)
			end).toThrow()
			t.expect(function()
				leaderboards:getMyRank("Coins", {})
			end).toThrow()
		end)
	end)
end
