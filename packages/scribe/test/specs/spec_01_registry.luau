--!nocheck

local help = require("../harness/scribe")

return function(TS, t)
	local scribe = help.load(TS)
	local binding = TS.loadPath("out/shared/binding")

	t.describe("@rovy/scribe shared registry and binding", function()
		t.it("exports stable external parameter ids", function()
			t.expect(scribe.clientReaderParamId("game/Profile"))
				.toBe("@rovy/scribe/client-reader:game/Profile")
			t.expect(scribe.serverWriterParamId("game/Profile"))
				.toBe("@rovy/scribe/server-writer:game/Profile")
			t.expect(scribe.commandClientParamId("game/Equip"))
				.toBe("@rovy/scribe/command-client:game/Equip")
			t.expect(scribe.SCRIBE_COMMAND_RESPONDER_PARAM)
				.toBe("@rovy/scribe/command-responder")
			t.expect(scribe.SCRIBE_DIAGNOSTICS_PARAM)
				.toBe("@rovy/scribe/diagnostics")
		end)

		t.it("stores data, command, and event declarations with duplicate guards", function()
			scribe.rovyScribe:__reset()
			local data = help.registerData(scribe, "game/Profile", "Profile")
			t.expect(data.id).toBe("game/Profile")
			t.expect(#scribe.rovyScribe:dataDefinitions()).toBe(1)
			t.expect(scribe.rovyScribe:data("game/Profile").publicToken).toBe(data)

			local Command, Event = {}, {}
			scribe.rovyScribe:__command(Command, {
				id = "game/Equip",
				name = "Equip",
				dataId = data.id,
				fields = { "itemId" },
				result = {},
				resultFields = { "equipped" },
			})
			scribe.rovyScribe:__event(Event, {
				id = "game/CoinsChanged",
				dataId = data.id,
				kind = "changed",
				path = "Coins",
			})
			t.expect(#scribe.rovyScribe:commands()).toBe(1)
			t.expect(#scribe.rovyScribe:events()).toBe(1)
			t.expect(function()
				help.registerData(scribe, "game/Profile", "Duplicate")
			end).toThrow()
			t.expect(function()
				scribe.rovyScribe:__command(Command, {
					id = "game/Equip",
					name = "EquipAgain",
					dataId = data.id,
					fields = {},
					result = {},
					resultFields = {},
				})
			end).toThrow()
			scribe.rovyScribe:__reset()
		end)

		t.it("schema helpers produce explicit runtime descriptors", function()
			local coins = scribe.s:int(0, { min = 0 })
			local inventory = scribe.s:dictOf({
				Amount = scribe.s:int(1, { min = 1 }),
			}, { maxKeys = 200 })
			local secret = scribe.s:serverOnly({ Flagged = false })

			t.expect(coins.kind).toBe("number")
			t.expect(coins.integer).toBe(true)
			t.expect(coins.options.min).toBe(0)
			t.expect(inventory.kind).toBe("dictionary")
			t.expect(inventory.options.maxKeys).toBe(200)
			t.expect(secret.kind).toBe("visibility")
			t.expect(secret.visibility).toBe("serverOnly")
			t.expect(secret.__scribeVisibility).toBe("serverOnly")
		end)

		t.it("untransformed scribeData fails clearly", function()
			t.expect(function()
				scribe.scribeData({
					name = "Bad",
					profileStoreIndex = "Bad",
					profileKeyPrefix = "PLAYER_",
					template = {},
				})
			end).toThrow()
		end)

		t.it("fake binding creates isolated deterministic bundles and diagnostics", function()
			local fake = binding.FakeScribeBinding.new("1.0.10-test")
			local first = fake:createBundle({ ProfileStoreIndex = "One" })
			local second = fake:createBundle({ ProfileStoreIndex = "Two" })
			t.expect(first.sequence).toBe(1)
			t.expect(second.sequence).toBe(2)
			t.expect(first.Client).never.toBe(second.Client)
			t.expect(fake:metrics()["fake.bundles"]).toBe(2)

			local seen
			fake:addLogSink(function(entry)
				seen = entry
			end)
			local entry = {
				at = 1,
				level = "Info",
				category = "Lifecycle",
				code = "TEST",
				message = "ok",
			}
			fake:pushLog(entry)
			t.expect(seen).toBe(entry)
			t.expect(#fake:recentLogs({ code = "TEST" })).toBe(1)
		end)
	end)
end
