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

		t.it("exports frozen lifecycle reason constants", function()
			t.expect(scribe.ScribeReason.LoadFailed).toBe("load-failed")
			t.expect(scribe.ScribeReason.MigrationFailed)
				.toBe("migration-failed")
			t.expect(scribe.ScribeReason.SessionEnded).toBe("session-ended")
			t.expect(scribe.ScribeReason.PlayerLeft).toBe("player-left")
			t.expect(scribe.ScribeReason.Shutdown).toBe("shutdown")
			t.expect(scribe.ScribeReason.Timeout).toBe("timeout")
			t.expect(table.isfrozen(scribe.ScribeReason)).toBe(true)
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
			local fake = binding.FakeScribeBinding.new("2.3.0-test")
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

		t.it("compiles every descriptor through the matching native declarator", function()
			local module, _, _, configured = help.nativeModule("2.3.0")
			local native = binding.NativeScribeBinding.new(module)
			native:configure({ AutoSaveInterval = 60 })
			t.expect(#configured).toBe(1)
			t.expect(configured[1].AutoSaveInterval).toBe(60)

			local factory = function()
				return 42
			end
			local template = native:compileTemplate({
				Coins = scribe.s:int(0, { min = 0, max = 100 }),
				Ratio = scribe.s:number(0.5, { min = 0, max = 1 }),
				Name = scribe.s:string("", { maxLength = 32 }),
				Mode = scribe.s:enum("A", { "A", "B" }),
				Boost = scribe.s:timed(1),
				Created = scribe.s:dynamic(factory),
				Nickname = scribe.s:optional(scribe.s:string("")),
				Items = scribe.s:arrayOf(scribe.s:int(1), { maxItems = 5 }),
				ById = scribe.s:dictOf(scribe.s:string(""), {
					maxKeys = 6,
					maxKeyLength = 8,
				}),
				Public = scribe.s:shared({ Title = "" }),
				Secret = scribe.s:serverOnly({ Flagged = false }),
				Runtime = scribe.s:session({ Active = false }),
				Position = scribe.s:vector3({ X = 0, Y = 0, Z = 0 }),
			})

			t.expect(template.Coins.NativeKind).toBe("Int")
			t.expect(template.Coins.Meta.Min).toBe(0)
			t.expect(template.Coins.Meta.Max).toBe(100)
			t.expect(template.Ratio.NativeKind).toBe("Number")
			t.expect(template.Name.Meta.MaxLength).toBe(32)
			t.expect(template.Mode.NativeKind).toBe("Enum")
			t.expect(template.Boost.NativeKind).toBe("Timed")
			t.expect(template.Created.NativeKind).toBe("Dynamic")
			t.expect(template.Created.Default).toBe(factory)
			t.expect(template.Nickname.NativeKind).toBe("Optional")
			t.expect(template.Nickname.Default.NativeKind).toBe("String")
			t.expect(template.Items.NativeKind).toBe("ArrayOf")
			t.expect(template.Items.Meta.MaxItems).toBe(5)
			t.expect(template.ById.Meta.MaxKeys).toBe(6)
			t.expect(template.ById.Meta.MaxKeyLength).toBe(8)
			t.expect(template.Public.NativeKind).toBe("Shared")
			t.expect(template.Secret.NativeKind).toBe("ServerOnly")
			t.expect(template.Runtime.NativeKind).toBe("Session")
			t.expect(template.Position.NativeKind).toBe("Vector3")
		end)
	end)
end
