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

local function readEvents(app, ctor)
	local output = {}
	app.eventRegistry:readerForEach(ctor, function(event)
		table.insert(output, event)
	end)
	return output
end

local function registerData(scribe, id)
	return scribe.rovyScribe:__data({
		id = id,
		name = id,
		profileStoreIndex = id,
		profileKeyPrefix = "PLAYER_",
		template = {
			Coins = scribe.s:int(0, { min = 0 }),
			Name = scribe.s:string("", { maxLength = 32 }),
			Runtime = scribe.s:session({
				InCombat = false,
			}),
		},
		options = {},
	})
end

local function serverPersistenceModule(help)
	local module = help.nativeModule()
	local sessionEnded = signal()
	local calls = {}
	local messages = {}
	local profileStore = {
		Name = "FakeProfileStore",
	}
	local coins = 100
	local offline = {
		Coins = 40,
		Name = "Offline",
		Runtime = {
			InCombat = true,
		},
		_Scribe = {
			PrivateToken = "preserve-me",
		},
	}
	local version = {
		Coins = 25,
		Name = "Historical",
		_Scribe = {
			PrivateToken = "history",
		},
	}
	local slowThread
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
			Increment = function(amount)
				table.insert(calls, "Increment")
				coins += amount
			end,
		},
		Name = {
			Get = function()
				return "Online"
			end,
			Clone = function()
				return "Online"
			end,
			Default = function()
				return ""
			end,
		},
		Runtime = {
			InCombat = {
				Get = function()
					return false
				end,
				Clone = function()
					return false
				end,
				Default = function()
					return false
				end,
			},
		},
	}
	local server = {
		SessionEnded = sessionEnded,
		ProfileStore = profileStore,
		GetState = function()
			return "Ready"
		end,
		Get = function()
			return root
		end,
		Batch = function(_player, callback)
			table.insert(calls, "BatchStart")
			callback()
			table.insert(calls, "BatchEnd")
		end,
		GetSaveInfo = function()
			return {
				LastSaveAt = 123,
				LastResult = "Ok",
				Dirty = true,
				Size = 456,
			}
		end,
		Flush = function(player, options)
			table.insert(
				calls,
				"Flush:" .. tostring(coins) .. ":" ..
					tostring(options and options.Force == true)
			)
			if player.Slow then
				slowThread = coroutine.running()
				return coroutine.yield()
			end
			return player.FailSave ~= true
		end,
		GetOffline = function(userId)
			table.insert(calls, "GetOffline:" .. tostring(userId))
			if userId == 404 then return nil end
			return table.clone(offline)
		end,
		UpdateOffline = function(userId, callback)
			table.insert(calls, "UpdateOffline:" .. tostring(userId))
			if userId == 99 then
				return false, "user has an active session on this server"
			end
			local ok, failure = pcall(callback, offline)
			if not ok then return false, tostring(failure) end
			return true
		end,
		ListVersions = function(_userId, limit)
			table.insert(calls, "ListVersions:" .. tostring(limit))
			return {
				{
					VersionId = "v2",
					CreatedAt = 200,
					Size = 20,
				},
				{
					VersionId = "v1",
					CreatedAt = 100,
				},
			}
		end,
		GetVersion = function(_userId, versionId)
			if versionId == "missing" then return nil end
			return table.clone(version)
		end,
		RestoreVersion = function(_userId, versionId)
			if versionId == "bad" then
				return false, "version not found"
			end
			return true
		end,
		Erase = function(userId)
			if userId == 99 then
				return false, "user has an active session on this server"
			end
			return true
		end,
		Export = function(userId)
			if userId == 404 then return nil end
			return "{\"Coins\":40}"
		end,
		SendMessage = function(userId, message)
			table.insert(messages, {
				userId = userId,
				message = message,
			})
			return userId ~= 13
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
		messages = messages,
		offline = offline,
		profileStore = profileStore,
		sessionEnded = sessionEnded,
		coins = function()
			return coins
		end,
		slowThread = function()
			return slowThread
		end,
	}
end

local function packedDatatypeModule(help)
	local module = help.nativeModule()
	module.table = function(default)
		return {
			NativeKind = "Datatype",
			Default = default,
		}
	end
	module.Datatypes.IsSupported = function(name)
		return name == "table"
	end
	module.Datatypes.Pack = function(name, value)
		assert(name == "table")
		local bytes = buffer.create(1)
		buffer.writeu8(bytes, 0, value.X)
		return bytes
	end
	module.Datatypes.Unpack = function(name, bytes)
		assert(name == "table")
		return {
			X = buffer.readu8(bytes, 0),
		}
	end
	local raw = {
		Codec = module.Datatypes.Pack("table", { X = 7 }),
		_Scribe = {
			PrivateToken = "codec-private",
		},
	}
	local server = {
		SessionEnded = signal(),
		ProfileStore = {},
		GetOffline = function()
			return raw
		end,
		UpdateOffline = function(_userId, callback)
			local ok, failure = pcall(callback, raw)
			if not ok then return false, tostring(failure) end
			return true
		end,
	}
	module.new = function()
		return {
			Client = {},
			Server = server,
		}
	end
	return module, raw
end

return function(TS, t)
	local clientScribe = help.load(TS, "client")
	local serverScribe = help.load(TS, "server")
	local core = TS.import(nil, TS.getModule(nil, "@rovy", "rovy-core"))
	local App = core.App
	local coreRovy = core.rovy

	t.describe("@rovy/scribe persistence and job bridge", function()
		t.it("commits writes before save jobs and publishes one immutable completion", function()
			coreRovy:__reset()
			serverScribe.rovyScribe:__reset()
			local Update = {}
			coreRovy:__schedule(Update, { runOnStart = false })
			local data = registerData(serverScribe, "game/PersistenceJobs")
			local JobCompleted = class()
			coreRovy:__event(JobCompleted, {})
			serverScribe.rovyScribe:__event(JobCompleted, {
				id = "game/PersistenceJobCompleted",
				dataId = data.id,
				kind = "jobCompleted",
			})

			local persistence
			local messaging
			local unsafe
			local saveHandle
			local queueSave = false
			local jobPlayer
			local observed = {}
			local Observer = help.sysClass(function(_, event)
				table.insert(observed, event)
			end)
			coreRovy:__observer(Observer, {
				event = JobCompleted,
				priority = 0,
				params = {
					{ kind = "event" },
				},
			})
			local Capture = help.sysClass(function(
				_,
				injectedPersistence,
				writes,
				injectedMessaging,
				injectedUnsafe,
				events
			)
				persistence = injectedPersistence
				messaging = injectedMessaging
				unsafe = injectedUnsafe
				events:forEach(function() end)
				if queueSave then
					queueSave = false
					writes["for"](writes, jobPlayer).Coins:increment(50)
					saveHandle = persistence:saveNow(jobPlayer, {
						force = true,
					})
				end
			end)
			coreRovy:__system(Capture, {
				id = "game/CapturePersistence",
				schedule = Update,
				params = {
					{
						kind = "external",
						id = serverScribe.persistenceParamId(data.id),
					},
					{
						kind = "external",
						id = serverScribe.serverWriterParamId(data.id),
					},
					{
						kind = "external",
						id = serverScribe.messagingParamId(data.id),
					},
					{
						kind = "external",
						id = serverScribe.unsafeParamId(data.id),
					},
					{
						kind = "eventReader",
						ctor = JobCompleted,
					},
				},
			})

			local module, controls = serverPersistenceModule(help)
			local plugin = serverScribe.ScribeServerPlugin.new({
				module = module,
			})
			local app = App.new()
			app:addPlugin(plugin)
			app:start()
			jobPlayer = {
				Name = "Saver",
			}
			queueSave = true
			app:runSchedule(Update)

			t.expect(controls.coins()).toBe(150)
			t.expect(table.concat(controls.calls, ","))
				.toBe("BatchStart,Increment,BatchEnd,Flush:150:true")
			t.expect(persistence:hasResult(saveHandle)).toBe(true)
			local saved = persistence:takeResult(saveHandle)
			t.expect(saved.ok).toBe(true)
			t.expect(saved.value).toBe(true)
			t.expect(persistence:hasResult(saveHandle)).toBe(false)

			t.expect(#observed).toBe(1)
			t.expect(observed[1].handle).toBe(saveHandle)
			t.expect(observed[1].player).toBe(jobPlayer)
			t.expect(observed[1].definition).toBe(data)
			t.expect(table.isfrozen(observed[1])).toBe(true)
			-- EventReader buffers intentionally drain at the outer schedule
			-- boundary. A standalone flush keeps the event available.
			t.expect(#readEvents(app, JobCompleted)).toBe(0)
			local eventHandle = persistence:saveNow(jobPlayer)
			app:flush()
			local events = readEvents(app, JobCompleted)
			t.expect(#events).toBe(1)
			t.expect(#observed).toBe(2)
			t.expect(events[1]).toBe(observed[2])
			t.expect(events[1].handle).toBe(eventHandle)
			t.expect(persistence:hasResult(eventHandle)).toBe(true)
			app:flush()
			t.expect(#readEvents(app, JobCompleted)).toBe(1)

			local info = persistence:getSaveInfo(jobPlayer)
			t.expect(info.lastSaveAt).toBe(123)
			t.expect(info.lastResult).toBe("Ok")
			t.expect(info.dirty).toBe(true)
			t.expect(info.size).toBe(456)
			t.expect(table.isfrozen(info)).toBe(true)
			t.expect(unsafe.module).toBe(module)
			t.expect(unsafe.server).never.toBeUndefined()
			t.expect(unsafe.profileStore).toBe(controls.profileStore)
			t.expect(unsafe.client).never.toBeUndefined()
			t.expect(messaging:hasResult(saveHandle)).toBe(false)
		end)

		t.it("projects typed offline data and preserves Scribe private metadata", function()
			coreRovy:__reset()
			serverScribe.rovyScribe:__reset()
			local Update = {}
			coreRovy:__schedule(Update, { runOnStart = false })
			local data = registerData(serverScribe, "game/OfflineJobs")
			local persistence
			local Capture = help.sysClass(function(_, injected)
				persistence = injected
			end)
			coreRovy:__system(Capture, {
				id = "game/CaptureOfflinePersistence",
				schedule = Update,
				params = {
					{
						kind = "external",
						id = serverScribe.persistenceParamId(data.id),
					},
				},
			})
			local module, controls = serverPersistenceModule(help)
			local app = App.new()
			app:addPlugin(serverScribe.ScribeServerPlugin.new({
				module = module,
			}))
			app:start()
			app:runSchedule(Update)

			local readHandle = persistence:getOffline(7)
			t.expect(#controls.calls).toBe(0)
			app:flush()
			local read = persistence:takeResult(readHandle)
			t.expect(read.ok).toBe(true)
			t.expect(read.value.Coins).toBe(40)
			t.expect(read.value.Name).toBe("Offline")
			t.expect(read.value.Runtime).toBeUndefined()
			t.expect(read.value._Scribe).toBeUndefined()
			t.expect(table.isfrozen(read.value)).toBe(true)

			local updateHandle = persistence:updateOffline(7, function(current)
				t.expect(table.isfrozen(current)).toBe(true)
				t.expect(current.Runtime).toBeUndefined()
				return {
					Coins = current.Coins + 2,
					Name = current.Name,
				}
			end)
			app:flush()
			local updated = persistence:takeResult(updateHandle)
			t.expect(updated.ok).toBe(true)
			t.expect(controls.offline.Coins).toBe(42)
			t.expect(controls.offline.Runtime.InCombat).toBe(true)
			t.expect(controls.offline._Scribe.PrivateToken)
				.toBe("preserve-me")

			local activeHandle = persistence:updateOffline(99, function(current)
				return current
			end)
			local yieldingHandle = persistence:updateOffline(7, function(current)
				coroutine.yield()
				return current
			end)
			local invalidHandle = persistence:updateOffline(7, function(current)
				return {
					Coins = current.Coins,
					Name = current.Name,
					Undeclared = true,
				}
			end)
			app:flush()
			local active = persistence:takeResult(activeHandle)
			local yielding = persistence:takeResult(yieldingHandle)
			local invalid = persistence:takeResult(invalidHandle)
			t.expect(active.ok).toBe(false)
			t.expect(active.error).toBe(
				"user has an active session on this server"
			)
			t.expect(yielding.ok).toBe(false)
			t.expect(
				yielding.error:find("must not yield", 1, true) ~= nil
			).toBe(true)
			t.expect(invalid.ok).toBe(false)
			t.expect(
				invalid.error:find("undeclared root field", 1, true)
					~= nil
			).toBe(true)

			local versionsHandle = persistence:listVersions(7, 2)
			local versionHandle = persistence:getVersion(7, "v2")
			local missingHandle = persistence:getVersion(7, "missing")
			local restoreHandle = persistence:restoreVersion(7, "bad")
			local eraseHandle = persistence:erase(99)
			local exportHandle = persistence:export(7)
			app:flush()
			local versions = persistence:takeResult(versionsHandle)
			t.expect(versions.ok).toBe(true)
			t.expect(versions.value[1].versionId).toBe("v2")
			t.expect(versions.value[2].size).toBeUndefined()
			local historical = persistence:takeResult(versionHandle)
			t.expect(historical.ok).toBe(true)
			t.expect(historical.value.Name).toBe("Historical")
			t.expect(historical.value._Scribe).toBeUndefined()
			t.expect(persistence:takeResult(missingHandle).value)
				.toBeUndefined()
			t.expect(persistence:takeResult(restoreHandle).error)
				.toBe("version not found")
			t.expect(persistence:takeResult(eraseHandle).error)
				.toBe("user has an active session on this server")
			t.expect(persistence:takeResult(exportHandle).value)
				.toBe("{\"Coins\":40}")
		end)

		t.it("buffers durable messages and cancels profile jobs on session end", function()
			coreRovy:__reset()
			serverScribe.rovyScribe:__reset()
			local Update = {}
			coreRovy:__schedule(Update, { runOnStart = false })
			local data = registerData(serverScribe, "game/MessagingJobs")
			local persistence
			local messaging
			local Capture = help.sysClass(function(_, p, m)
				persistence = p
				messaging = m
			end)
			coreRovy:__system(Capture, {
				id = "game/CaptureMessaging",
				schedule = Update,
				params = {
					{
						kind = "external",
						id = serverScribe.persistenceParamId(data.id),
					},
					{
						kind = "external",
						id = serverScribe.messagingParamId(data.id),
					},
				},
			})
			local module, controls = serverPersistenceModule(help)
			local app = App.new()
			app:addPlugin(serverScribe.ScribeServerPlugin.new({
				module = module,
			}))
			app:start()
			app:runSchedule(Update)

			local payload = {
				kind = "award",
				amount = 5,
			}
			local messageHandle = messaging:send(8, payload)
			payload.amount = 999
			t.expect(#controls.messages).toBe(0)
			app:flush()
			t.expect(#controls.messages).toBe(1)
			t.expect(controls.messages[1].message.amount).toBe(5)
			t.expect(table.isfrozen(controls.messages[1].message))
				.toBe(true)
			t.expect(messaging:takeResult(messageHandle).ok).toBe(true)

			local failedMessage = messaging:send(13, {
				kind = "award",
			})
			app:flush()
			t.expect(messaging:takeResult(failedMessage).error)
				.toBe("message-not-committed")

			local cyclic = {}
			cyclic.self = cyclic
			t.expect(function()
				messaging:send(8, cyclic)
			end).toThrow()

			local slowPlayer = {
				Name = "SlowSaver",
				Slow = true,
			}
			local slow = persistence:saveNow(slowPlayer)
			app:flush()
			t.expect(controls.slowThread()).never.toBeUndefined()
			t.expect(persistence:hasResult(slow)).toBe(false)
			controls.sessionEnded:Fire(slowPlayer, "session-stolen")
			app:flush()
			local canceled = persistence:takeResult(slow)
			t.expect(canceled.ok).toBe(false)
			t.expect(canceled.error).toBe("session-stolen")
			coroutine.close(controls.slowThread())
			app:flush()
			t.expect(persistence:hasResult(slow)).toBe(false)

			local resumedPlayer = {
				Name = "ResumedSaver",
				Slow = true,
			}
			local resumedHandle = persistence:saveNow(resumedPlayer)
			app:flush()
			local resumedThread = controls.slowThread()
			local resumed, resumeFailure = coroutine.resume(
				resumedThread,
				true
			)
			t.expect(resumed).toBe(true)
			t.expect(resumeFailure).toBeUndefined()
			app:flush()
			local resumedResult = persistence:takeResult(resumedHandle)
			t.expect(resumedResult.ok).toBe(true)
			t.expect(resumedResult.value).toBe(true)

			local failedSave = persistence:saveNow({
				Name = "FailedSaver",
				FailSave = true,
			})
			app:flush()
			t.expect(persistence:takeResult(failedSave).error)
				.toBe("save-not-confirmed")
		end)

		t.it("unpacks and repacks native persisted datatype buffers", function()
			coreRovy:__reset()
			serverScribe.rovyScribe:__reset()
			local Update = {}
			coreRovy:__schedule(Update, { runOnStart = false })
			local data = serverScribe.rovyScribe:__data({
				id = "game/PackedOfflineDatatype",
				name = "PackedOfflineDatatype",
				profileStoreIndex = "PackedOfflineDatatype",
				profileKeyPrefix = "PLAYER_",
				template = {
					-- Zune has no Roblox datatypes, so this fake codec uses the
					-- runtime type name "table" to exercise the same seam.
					Codec = {
						kind = "datatype",
						datatype = "table",
						defaultValue = { X = 0 },
					},
				},
				options = {},
			})
			local persistence
			local unsafe
			local Capture = help.sysClass(function(_, injected)
				persistence = injected
			end)
			local CaptureUnsafe = help.sysClass(function(_, injected)
				unsafe = injected
			end)
			coreRovy:__system(Capture, {
				id = "game/CapturePackedOfflineDatatype",
				schedule = Update,
				params = {
					{
						kind = "external",
						id = serverScribe.persistenceParamId(data.id),
					},
				},
			})
			coreRovy:__system(CaptureUnsafe, {
				id = "game/CapturePackedUnsafe",
				schedule = Update,
				params = {
					{
						kind = "external",
						id = serverScribe.unsafeParamId(data.id),
					},
				},
			})
			local module, raw = packedDatatypeModule(help)
			local app = App.new()
			app:addPlugin(serverScribe.ScribeServerPlugin.new({
				module = module,
			}))
			app:start()
			app:runSchedule(Update)

			t.expect(unsafe.datatypes:isSupported("table")).toBe(true)
			t.expect(unsafe.datatypes:isSupported("Vector3")).toBe(false)
			local unsafePacked = unsafe.datatypes:pack("table", { X = 9 })
			t.expect(unsafe.datatypes:unpack("table", unsafePacked).X).toBe(9)
			t.expect(function()
				unsafe.datatypes:pack("Vector3", {})
			end).toThrow()

			local readHandle = persistence:getOffline(7)
			app:flush()
			local read = persistence:takeResult(readHandle)
			t.expect(read.ok).toBe(true)
			t.expect(read.value.Codec.X).toBe(7)
			t.expect(type(read.value.Codec)).toBe("table")
			t.expect(table.isfrozen(read.value.Codec)).toBe(true)

			local writeHandle = persistence:updateOffline(7, function(current)
				return {
					Codec = {
						X = current.Codec.X + 2,
					},
				}
			end)
			app:flush()
			t.expect(persistence:takeResult(writeHandle).ok).toBe(true)
			t.expect(type(raw.Codec)).toBe("buffer")
			t.expect(buffer.readu8(raw.Codec, 0)).toBe(9)
			t.expect(raw._Scribe.PrivateToken).toBe("codec-private")
		end)
	end)

	t.describe("@rovy/scribe client save state", function()
		t.it("does not call yielding GetSaveInfo before readiness", function()
			coreRovy:__reset()
			clientScribe.rovyScribe:__reset()
			local Update = {}
			coreRovy:__schedule(Update, { runOnStart = false })
			local data = registerData(clientScribe, "game/ClientSaveState")
			local ready = false
			local saveReads = 0
			local module = help.nativeModule()
			module.new = function()
				local function leaf(value)
					return {
						Get = function()
							return value
						end,
						Clone = function()
							return value
						end,
						Default = function()
							return value
						end,
					}
				end
				return {
					Server = {},
					Client = {
						Coins = leaf(0),
						Name = leaf(""),
						Runtime = {
							InCombat = leaf(false),
						},
						IsReady = function()
							return ready
						end,
						GetServiceStatus = function()
							return "Healthy"
						end,
						GetSaveInfo = function()
							saveReads += 1
							return {
								LastSaveAt = 55,
								LastResult = "Ok",
								Dirty = false,
								Size = 77,
							}
						end,
					},
				}
			end
			local state
			local Capture = help.sysClass(function(_, injected)
				state = injected
			end)
			coreRovy:__system(Capture, {
				id = "game/CaptureClientSaveState",
				schedule = Update,
				params = {
					{
						kind = "external",
						id = clientScribe.clientStateParamId(data.id),
					},
				},
			})
			local app = App.new()
			app:addPlugin(clientScribe.ScribeClientPlugin.new({
				module = module,
			}))
			app:start()
			app:runSchedule(Update)
			t.expect(state.ready).toBe(false)
			t.expect(state.saveInfo.dirty).toBe(false)
			t.expect(saveReads).toBe(0)

			ready = true
			app:flush()
			t.expect(state.ready).toBe(true)
			t.expect(saveReads > 0).toBe(true)
			t.expect(state.saveInfo.lastSaveAt).toBe(55)
			t.expect(state.saveInfo.lastResult).toBe("Ok")
			t.expect(state.saveInfo.size).toBe(77)
			t.expect(table.isfrozen(state.saveInfo)).toBe(true)
		end)
	end)
end
