--!nocheck

local help = require("../harness/scribe")

return function(TS, t)
	local clientScribe = help.load(TS, "client")
	local serverScribe = help.load(TS, "server")
	local core = TS.import(nil, TS.getModule(nil, "@rovy", "rovy-core"))
	local rovy = core.rovy
	local App = core.App

	local function reset()
		rovy:__reset()
		serverScribe.rovyScribe:__reset()
	end

	local function scheduleOnly()
		local Update = {}
		rovy:__schedule(Update, { runOnStart = false })
		return Update
	end

	t.describe("@rovy/scribe boundary plugins", function()
		t.it("builds explicit client and server runtimes with fixed boundaries", function()
			reset()
			local module = help.nativeModule()
			local clientPlugin = clientScribe.ScribeClientPlugin.new({ module = module })
			local serverPlugin = serverScribe.ScribeServerPlugin.new({ module = module })
			local clientApp, serverApp = App.new(), App.new()
			clientPlugin:build(clientApp)
			serverPlugin:build(serverApp)

			t.expect(clientPlugin.runtime.boundary).toBe("client")
			t.expect(serverPlugin.runtime.boundary).toBe("server")
			t.expect(clientPlugin.runtime).never.toBe(serverPlugin.runtime)
			t.expect(serverScribe.scribeVersion()).toBe("2.3.0")
		end)

		t.it("active facade delegates to the loaded server provider", function()
			reset()
			local module = help.nativeModule()
			local plugin = serverScribe.ScribePlugin.new({ module = module })
			local app = App.new()
			plugin:build(app)
			t.expect(plugin.runtime.boundary).toBe("server")
		end)

		t.it("does not resolve Scribe for an app with no declarations or params", function()
			reset()
			scheduleOnly()
			local app = App.new()
			t.expect(function()
				app:start()
			end).never.toThrow()
		end)

		t.it("fails startup precisely when an auto-installed runtime cannot find Scribe", function()
			reset()
			scheduleOnly()
			help.registerData(serverScribe, "game/Missing", "Missing")
			local app = App.new()
			local ok, err = pcall(function()
				app:start()
			end)
			t.expect(ok).toBe(false)
			t.expect(
				tostring(err):find("Scribe module not found", 1, true) ~= nil
			).toBe(true)
		end)

		t.it("auto-installs from configured resolver and injects definition handles", function()
			reset()
			local Update = scheduleOnly()
			local data = help.registerData(serverScribe, "game/Profile", "Profile")
			local module, created = help.nativeModule()
			serverScribe.rovyScribe:__setModuleResolver(function()
				return module
			end)

			local seen
			local Read = help.sysClass(function(_, reader)
				seen = reader
			end)
			rovy:__system(Read, {
				id = "test/ScribeRead",
				schedule = Update,
				params = {
					{
						kind = "external",
						id = serverScribe.serverReaderParamId(data.id),
					},
				},
			})

			local app = App.new()
			app:start()
			app:runSchedule(Update)

			t.expect(#created).toBe(1)
			t.expect(type(seen.get)).toBe("function")
			t.expect(type(seen.require)).toBe("function")
			t.expect(type(seen.state)).toBe("function")
			t.expect(created[1].options.TransportChannel)
				.toBe("@rovy/scribe:game/Profile")
		end)

		t.it("passes a custom native transport through without wrapping it", function()
			reset()
			scheduleOnly()
			help.registerData(serverScribe, "game/Transport", "Transport")
			local module, created = help.nativeModule()
			local sentToClient
			local sentToAll
			local sentToServer
			local serverListener
			local clientListener
			local transport = {
				Name = "TestTransport",
				SendToClient = function(_player, bytes)
					sentToClient = bytes
				end,
				SendToAllClients = function(bytes)
					sentToAll = bytes
				end,
				ListenServer = function(callback)
					serverListener = callback
				end,
				SendToServer = function(bytes)
					sentToServer = bytes
				end,
				ListenClient = function(callback)
					clientListener = callback
				end,
			}
			local player = {}
			local outbound = buffer.create(4)
			buffer.writeu32(outbound, 0, 0xA1B2C3D4)
			local serverReceived
			local clientReceived
			local nativeNew = module.new
			module.new = function(options)
				options.Transport.ListenServer(function(sender, bytes)
					serverReceived = { sender, bytes }
				end)
				options.Transport.ListenClient(function(bytes)
					clientReceived = bytes
				end)
				options.Transport.SendToClient(player, outbound)
				options.Transport.SendToAllClients(outbound)
				options.Transport.SendToServer(outbound)
				return nativeNew(options)
			end
			local plugin = serverScribe.ScribeServerPlugin.new({
				module = module,
				transport = transport,
			})
			local app = App.new()
			app:addPlugin(plugin)
			app:start()

			t.expect(created[1].options.Transport).toBe(transport)
			t.expect(sentToClient).toBe(outbound)
			t.expect(sentToAll).toBe(outbound)
			t.expect(sentToServer).toBe(outbound)
			serverListener(player, outbound)
			clientListener(outbound)
			t.expect(serverReceived[1]).toBe(player)
			t.expect(serverReceived[2]).toBe(outbound)
			t.expect(clientReceived).toBe(outbound)
			t.expect(buffer.readu32(clientReceived, 0)).toBe(0xA1B2C3D4)
		end)

		t.it("configures native Scribe once before bundles and rejects conflicts", function()
			reset()
			scheduleOnly()
			help.registerData(serverScribe, "game/Configured", "Configured")
			local module, _, _, configured = help.nativeModule()

			local first = App.new()
			first:addPlugin(serverScribe.ScribeServerPlugin.new({
				module = module,
				configure = { autoSaveInterval = 60 },
			}))
			first:start()
			t.expect(#configured).toBe(1)
			t.expect(configured[1].AutoSaveInterval).toBe(60)

			local same = App.new()
			same:addPlugin(serverScribe.ScribeServerPlugin.new({
				module = module,
				configure = { autoSaveInterval = 60 },
			}))
			same:start()
			t.expect(#configured).toBe(1)

			local conflicting = App.new()
			conflicting:addPlugin(serverScribe.ScribeServerPlugin.new({
				module = module,
				configure = { autoSaveInterval = 30 },
			}))
			local ok, err = pcall(function()
				conflicting:start()
			end)
			t.expect(ok).toBe(false)
			t.expect(
				tostring(err):find("conflicting process-wide", 1, true) ~= nil
			).toBe(true)
		end)

		t.it("rejects unverified native versions unless strict compatibility is disabled", function()
			reset()
			scheduleOnly()
			help.registerData(serverScribe, "game/StrictVersion", "StrictVersion")
			local unverified = help.nativeModule("1.0.12")
			local strictApp = App.new()
			strictApp:addPlugin(serverScribe.ScribeServerPlugin.new({
				module = unverified,
			}))
			t.expect(function()
				strictApp:start()
			end).toThrow()

			reset()
			scheduleOnly()
			help.registerData(serverScribe, "game/LooseVersion", "LooseVersion")
			local optedOut = help.nativeModule("1.0.12")
			local looseApp = App.new()
			looseApp:addPlugin(serverScribe.ScribeServerPlugin.new({
				module = optedOut,
				strict = false,
			}))
			looseApp:start()
			t.expect(serverScribe.scribeVersion()).toBe("1.0.12")
		end)

		t.it("rejects first process configuration after a bundle exists", function()
			reset()
			scheduleOnly()
			help.registerData(serverScribe, "game/LateConfig", "LateConfig")
			local module = help.nativeModule()
			local first = App.new()
			first:addPlugin(serverScribe.ScribeServerPlugin.new({ module = module }))
			first:start()

			local late = App.new()
			late:addPlugin(serverScribe.ScribeServerPlugin.new({
				module = module,
				configure = { autoSaveInterval = 60 },
			}))
			local ok, err = pcall(function()
				late:start()
			end)
			t.expect(ok).toBe(false)
			t.expect(
				tostring(err):find("before any Scribe bundle", 1, true) ~= nil
			).toBe(true)
		end)

		t.it("binds server-only construction callbacks before bundle creation", function()
			reset()
			scheduleOnly()
			local data = serverScribe.rovyScribe:__data({
				id = "game/Setup",
				name = "Setup",
				profileStoreIndex = "Setup",
				profileKeyPrefix = "PLAYER_",
				template = { Coins = serverScribe.s:int(0) },
				options = {
					Products = {
						Coins = { Id = 123, Category = "Currency" },
					},
					Economy = {
						Currencies = {
							Coins = { Label = "Coins" },
						},
					},
				},
			})
			local migration = function(value)
				return { Coins = value.Coins + 1, Migrated = true }
			end
			local initializedValue
			local initializedNew
			local onPlayerInit = function(_, setupData, isNew)
				initializedValue = setupData.Coins:get()
				initializedNew = isNew
				setupData.Coins:set(initializedValue + 5)
			end
			local profileStore = {}
			local grantData
			local module, created = help.nativeModule()
			local plugin = serverScribe.ScribeServerPlugin.new({
				module = module,
				bundles = {
					serverScribe.configureScribeServer(data, {
						migrations = {
							{ version = 2, migrate = migration },
						},
						onPlayerInit = onPlayerInit,
						profileStore = profileStore,
						productGrants = {
							Coins = function(context)
								context.data.Coins:increment(3)
								grantData = context.data.Coins:get()
							end,
						},
						economy = {
							resolve = function()
								return { Region = "US" }
							end,
							currencyResolve = {
								Coins = function()
									return { Source = "Test" }
								end,
							},
							logEconomyEvent = function() end,
						},
					}),
				},
			})
			local app = App.new()
			app:addPlugin(plugin)
			app:start()

			local options = created[1].options
			local migrated = { Coins = 4, Old = true }
			options.Migrations[2](migrated)
			t.expect(migrated.Coins).toBe(5)
			t.expect(migrated.Migrated).toBe(true)
			t.expect(migrated.Old).toBe(nil)
			t.expect(options.OnPlayerInit).never.toBe(onPlayerInit)
			local initializing = { Coins = 4 }
			options.OnPlayerInit(nil, initializing, true)
			t.expect(initializedValue).toBe(4)
			t.expect(initializedNew).toBe(true)
			t.expect(initializing.Coins).toBe(9)
			t.expect(options.ProfileStore).toBe(profileStore)
			t.expect(type(options.Products.Coins.Grant)).toBe("function")
			local accessorValue = 5
			local accessor = {
				Coins = {
					Clone = function()
						return accessorValue
					end,
					Default = function()
						return 0
					end,
					Set = function(value)
						accessorValue = value
					end,
					Update = function(transform)
						accessorValue = transform(accessorValue)
					end,
					Min = function()
						return 0
					end,
					Max = function()
						return nil
					end,
					Increment = function(amount)
						accessorValue += amount
					end,
					Decrement = function(amount)
						accessorValue -= amount
					end,
				},
			}
			options.Products.Coins.Grant(accessor)
			t.expect(grantData).toBe(8)
			t.expect(accessorValue).toBe(8)
			t.expect(type(options.Economy.Resolve)).toBe("function")
			t.expect(type(options.Economy.Currencies.Coins.Resolve)).toBe("function")
			t.expect(type(options.Economy.LogEconomyEvent)).toBe("function")
			t.expect(options.Template.Coins.NativeKind).toBe("Int")
		end)

		t.it("installs when only a Scribe external param is requested", function()
			reset()
			local Update = scheduleOnly()
			local module = help.nativeModule()
			serverScribe.rovyScribe:__setModuleResolver(function()
				return module
			end)
			local status
			local Diagnostics = help.sysClass(function(_, diagnostics)
				status = diagnostics:status()
			end)
			rovy:__system(Diagnostics, {
				id = "test/ScribeDiagnostics",
				schedule = Update,
				params = {
					{ kind = "external", id = serverScribe.SCRIBE_DIAGNOSTICS_PARAM },
				},
			})

			local app = App.new()
			app:start()
			app:runSchedule(Update)
			t.expect(status).toBe("Healthy")
		end)

		t.it("keeps two apps and two bundles isolated", function()
			reset()
			scheduleOnly()
			help.registerData(serverScribe, "game/Profile", "Profile")
			help.registerData(serverScribe, "game/Season", "Season")
			local module, created = help.nativeModule()
			local firstPlugin = serverScribe.ScribeServerPlugin.new({ module = module })
			local secondPlugin = serverScribe.ScribeServerPlugin.new({ module = module })
			local firstApp = App.new()
			local secondApp = App.new()
			firstApp:addPlugin(firstPlugin)
			secondApp:addPlugin(secondPlugin)
			firstApp:start()
			secondApp:start()

			t.expect(firstPlugin.runtime).never.toBe(secondPlugin.runtime)
			t.expect(#firstPlugin.runtime:bundles()).toBe(2)
			t.expect(#secondPlugin.runtime:bundles()).toBe(2)
			t.expect(#created).toBe(4)
			t.expect(firstPlugin.runtime:bundle("game/Profile").native)
				.never.toBe(secondPlugin.runtime:bundle("game/Profile").native)
		end)
	end)
end
