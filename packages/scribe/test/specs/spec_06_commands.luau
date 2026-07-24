--!nocheck

local function loadPinnedNativeCommands()
	local internal = {
		Wire = {},
		Log = {},
		Metrics = {},
	}
	local Wire = {
		MAX_COMMAND_ARGS = 8,
		Frames = {
			CommandReply = 41,
		},
		NewWriter = function()
			return {}
		end,
		U8 = function(writer, value)
			table.insert(writer, value)
		end,
		U32 = function(writer, value)
			table.insert(writer, value)
		end,
		Str = function(writer, value)
			table.insert(writer, value)
		end,
		EncodeGeneric = function(writer, value)
			table.insert(writer, value)
		end,
		Finish = function(writer)
			return writer
		end,
		RU32 = function(reader)
			return reader.correlation
		end,
		RStr = function(reader)
			return reader.name
		end,
		RU8 = function(reader)
			return reader.argc
		end,
		DecodeGeneric = function(reader)
			reader.index += 1
			return reader.args[reader.index]
		end,
	}
	local Log = {
		Warn = function() end,
		Error = function() end,
	}
	local Metrics = {
		Add = function() end,
	}
	local scriptObject = {
		Parent = {
			Parent = {
				Internal = internal,
			},
		},
	}
	local environment = setmetatable({
		script = scriptObject,
		require = function(target)
			if target == internal.Wire then return Wire end
			if target == internal.Log then return Log end
			if target == internal.Metrics then return Metrics end
			error("unexpected pinned Scribe fixture dependency")
		end,
	}, {
		__index = _G,
	})
	local path = zune.process.cwd()
		.. "/test/native/scribe-1.0.11/Server/Commands.luau"
	local source = zune.fs.readFile(path)
	local bytecode = zune.luau.compile(source)
	local chunk = zune.luau.load(bytecode, {
		chunk_name = path,
		env = environment,
	})
	return chunk()
end

local function contractClass(fields)
	local C = {}
	C.__index = C
	C.new = function(...)
		local value = setmetatable({}, C)
		for index, field in fields do
			value[field] = select(index, ...)
		end
		return value
	end
	return C
end

local function registerData(scribe, id, requestTimeout)
	return scribe.rovyScribe:__data({
		id = id,
		name = id,
		profileStoreIndex = id,
		profileKeyPrefix = "PLAYER_",
		template = {
			Coins = scribe.s:int(0, { min = 0 }),
		},
		options = {
			RequestTimeout = requestTimeout or 5,
		},
	})
end

local function registerCommand(scribe, data, Command, Result, id)
	scribe.rovyScribe:__command(Command, {
		id = id,
		name = "EquipItem",
		dataId = data.id,
		fields = { "itemId" },
		optionalFields = {},
		fieldTypes = {
			{ kind = "string" },
		},
		result = Result,
		resultFields = { "equipped", "reason" },
		resultOptionalFields = { "reason" },
		resultFieldTypes = {
			{ kind = "boolean" },
			{ kind = "string" },
		},
	})
end

local function serverCommandModule(help)
	local module = help.nativeModule()
	local handlers = {}
	local calls = {}
	local sessionEndedListeners = {}
	local state = {
		Coins = 100,
	}
	local coins = {
		Get = function()
			return state.Coins
		end,
		Clone = function()
			return state.Coins
		end,
		Default = function()
			return 0
		end,
		Increment = function(amount)
			table.insert(calls, "Increment")
			state.Coins += amount
		end,
		Set = function(value)
			table.insert(calls, "Set")
			if value == "FAIL" then
				error("forced command write failure")
			end
			state.Coins = value
		end,
	}
	local root = {
		Coins = coins,
	}
	local server = {
		SessionEnded = {
			Connect = function(_self, callback)
				table.insert(sessionEndedListeners, callback)
				return {
					Disconnect = function() end,
				}
			end,
		},
		Command = function(name, spec, handler)
			handlers[name] = {
				spec = spec,
				handler = handler,
			}
		end,
		GetState = function()
			return "Ready"
		end,
		Get = function()
			return root
		end,
		Batch = function(_player, callback)
			table.insert(calls, "BatchStart")
			local ok, failure = pcall(callback)
			table.insert(calls, "BatchEnd")
			if not ok then error(failure) end
		end,
	}
	module.new = function()
		return {
			Client = {},
			Server = server,
		}
	end
	return module, {
		handlers = handlers,
		calls = calls,
		state = state,
		endSession = function(player, reason)
			for _, callback in table.clone(sessionEndedListeners) do
				callback(player, reason)
			end
		end,
	}
end

local function pinnedDispatcherModule(help)
	local NativeCommands = loadPinnedNativeCommands()
	local module = help.nativeModule()
	local sent
	local coins = 100
	local calls = {}
	local commands = NativeCommands.new({
		Options = {
			CommandRateLimit = 20,
		},
		Replication = {
			SendTo = function(_entry, bytes)
				table.insert(calls, "NativeReply")
				sent = bytes
			end,
		},
	})
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
			Increment = function(amount)
				table.insert(calls, "Increment")
				coins += amount
			end,
		},
	}
	local server = {
		Command = commands.Register,
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
	}
	module.new = function()
		return {
			Client = {},
			Server = server,
		}
	end
	return module, {
		dispatch = function(entry, reader)
			commands.HandleFrame(entry, reader)
		end,
		sent = function()
			return sent
		end,
		coins = function()
			return coins
		end,
		calls = calls,
	}
end

local function clientCommandModule(help)
	local module = help.nativeModule()
	local requests = {}
	local coins = 0
	local client = {
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
			Increment = function(amount)
				coins += amount
			end,
		},
		IsReady = function()
			return true
		end,
		Request = function(name, payload)
			table.insert(requests, {
				name = name,
				payload = payload,
			})
			if payload.itemId == "rate" then
				return false, "rate-limited"
			end
			if payload.itemId == "malformed" then
				return {
					__rovyScribeCommand = 1,
					Ok = true,
					Value = {
						equipped = function() end,
					},
				}
			end
			return {
				__rovyScribeCommand = 1,
				Ok = true,
				Value = {
					equipped = payload.itemId == "IronSword",
					reason = if payload.itemId == "IronSword"
						then nil
						else "not-owned",
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
	return module, requests
end

local function readEvents(app, ctor)
	local output = {}
	app.eventRegistry:readerForEach(ctor, function(event)
		table.insert(output, event)
	end)
	return output
end

return function(TS, t)
	local help = require("../harness/scribe")
	local clientScribe = help.load(TS, "client")
	local serverScribe = help.load(TS, "server")
	local core = TS.import(nil, TS.getModule(nil, "@rovy", "rovy-core"))
	local App = core.App
	local coreRovy = core.rovy

	t.describe("@rovy/scribe native command compatibility", function()
		t.it("yields through pinned Scribe v1.0.11 xpcall dispatch", function()
			local NativeCommands = loadPinnedNativeCommands()
			local sent
			local commands = NativeCommands.new({
				Options = {
					CommandRateLimit = 20,
				},
				Replication = {
					SendTo = function(_entry, bytes)
						sent = bytes
					end,
				},
			})
			local player = {
				UserId = 7,
			}
			local payload = {
				itemId = "IronSword",
			}
			commands.Register(
				"EquipItem",
				{
					Args = { "table" },
				},
				function(sender, request)
					t.expect(sender).toBe(player)
					t.expect(request).toBe(payload)
					local response = coroutine.yield(
						"native-handler-suspended"
					)
					return response
				end
			)
			local reader = {
				correlation = 73,
				name = "EquipItem",
				argc = 1,
				args = { payload },
				index = 0,
			}
			local entry = {
				Player = player,
				State = "Ready",
				RateLast = os.clock(),
				RateTokens = 20,
			}
			local dispatch = coroutine.create(function()
				commands.HandleFrame(entry, reader)
			end)

			local started, marker = coroutine.resume(dispatch)
			t.expect(started).toBe(true)
			t.expect(marker).toBe("native-handler-suspended")
			t.expect(coroutine.status(dispatch)).toBe("suspended")
			t.expect(sent).toBeUndefined()

			local envelope = {
				__rovyScribeCommand = 1,
				Ok = true,
			}
			local completed, failure = coroutine.resume(dispatch, envelope)
			t.expect(completed).toBe(true)
			t.expect(failure).toBeUndefined()
			t.expect(coroutine.status(dispatch)).toBe("dead")
			t.expect(sent[1]).toBe(41)
			t.expect(sent[2]).toBe(73)
			t.expect(sent[3]).toBe(1)
			t.expect(sent[4]).toBe(1)
			t.expect(sent[5]).toBe(envelope)
		end)
	end)

	t.describe("@rovy/scribe command bridge", function()
		t.it("runs flush-gated bridge through pinned native dispatcher", function()
			coreRovy:__reset()
			serverScribe.rovyScribe:__reset()
			local Update = {}
			coreRovy:__schedule(Update, { runOnStart = false })
			local data = registerData(
				serverScribe,
				"game/PinnedBridgeCommands"
			)
			local Command = contractClass({ "itemId" })
			local Result = contractClass({ "equipped", "reason" })
			local commandId = "game/PinnedBridgeEquip"
			registerCommand(serverScribe, data, Command, Result, commandId)
			local Handle = help.sysClass(function(_, requests, writes, respond)
				requests:forEach(function(request)
					local profile = writes["for"](
						writes,
						request.player
					)
					profile.Coins:increment(50)
					respond:resolve(request, Result.new(true))
				end)
			end)
			coreRovy:__system(Handle, {
				id = "game/HandlePinnedBridge",
				schedule = Update,
				params = {
					{
						kind = "external",
						id = serverScribe.commandReaderParamId(commandId),
					},
					{
						kind = "external",
						id = serverScribe.serverWriterParamId(data.id),
					},
					{
						kind = "external",
						id = serverScribe.SCRIBE_COMMAND_RESPONDER_PARAM,
					},
				},
			})
			local module, controls = pinnedDispatcherModule(help)
			local plugin = serverScribe.ScribeServerPlugin.new({
				module = module,
			})
			local app = App.new()
			app:addPlugin(plugin)
			app:start()
			local player = {
				Name = "PinnedBridgePlayer",
			}
			local dispatch = coroutine.create(function()
				controls.dispatch(
					{
						Player = player,
						State = "Ready",
						RateLast = os.clock(),
						RateTokens = 20,
					},
					{
						correlation = 91,
						name = "EquipItem",
						argc = 1,
						args = {
							{ itemId = "IronSword" },
						},
						index = 0,
					}
				)
			end)
			local started = coroutine.resume(dispatch)
			t.expect(started).toBe(true)
			t.expect(coroutine.status(dispatch)).toBe("suspended")
			t.expect(controls.sent()).toBeUndefined()

			app:runSchedule(Update)
			local reply = controls.sent()
			t.expect(coroutine.status(dispatch)).toBe("dead")
			t.expect(controls.coins()).toBe(150)
			t.expect(reply[2]).toBe(91)
			t.expect(reply[3]).toBe(1)
			t.expect(reply[4]).toBe(1)
			t.expect(reply[5].Ok).toBe(true)
			t.expect(reply[5].Value.equipped).toBe(true)
			t.expect(table.concat(controls.calls, ","))
				.toBe("BatchStart,Increment,BatchEnd,NativeReply")

			controls.dispatch(
				{
					Player = player,
					State = "Ready",
					RateLast = os.clock(),
					RateTokens = 0,
				},
				{
					correlation = 92,
					name = "EquipItem",
					argc = 1,
					args = {
						{ itemId = "IronSword" },
					},
					index = 0,
				}
			)
			reply = controls.sent()
			t.expect(reply[2]).toBe(92)
			t.expect(reply[3]).toBe(0)
			t.expect(reply[5]).toBe("rate-limited")
			t.expect(controls.coins()).toBe(150)
		end)

		t.it("calls natively after flush and exposes one pollable completion event", function()
			coreRovy:__reset()
			clientScribe.rovyScribe:__reset()
			local Update = {}
			coreRovy:__schedule(Update, { runOnStart = false })
			local data = registerData(clientScribe, "game/ClientCommands")
			local Command = contractClass({ "itemId" })
			local Result = contractClass({ "equipped", "reason" })
			local Completed = contractClass({})
			local commandId = "game/EquipClient"
			registerCommand(clientScribe, data, Command, Result, commandId)
			coreRovy:__event(Completed, {})
			clientScribe.rovyScribe:__event(Completed, {
				id = "game/EquipClientCompleted",
				commandId = commandId,
				kind = "commandCompleted",
			})
			local observed = {}
			local Observe = help.sysClass(function(_, event)
				table.insert(observed, event)
			end)
			coreRovy:__observer(Observe, {
				event = Completed,
				priority = 0,
				params = {
					{ kind = "event" },
				},
			})

			local injected
			local Capture = help.sysClass(function(_, command, events)
				injected = command
				events:forEach(function() end)
			end)
			coreRovy:__system(Capture, {
				id = "game/CaptureClientCommand",
				schedule = Update,
				params = {
					{
						kind = "external",
						id = clientScribe.commandClientParamId(commandId),
					},
					{
						kind = "eventReader",
						ctor = Completed,
					},
				},
			})

			local module, requests = clientCommandModule(help)
			local plugin = clientScribe.ScribeClientPlugin.new({
				module = module,
			})
			local app = App.new()
			app:addPlugin(plugin)
			app:start()
			app:runSchedule(Update)
			t.expect(type(injected.call)).toBe("function")
			t.expect(function()
				injected:call({ itemId = "IronSword" })
			end).toThrow()

			local request = Command.new("IronSword")
			local handle = injected:call(request)
			local same = injected:call(Command.new("Different"))
			t.expect(same).toBe(handle)
			t.expect(#requests).toBe(0)
			t.expect(injected:hasResult(handle)).toBe(false)

			app:flush()
			t.expect(#requests).toBe(1)
			t.expect(requests[1].name).toBe("EquipItem")
			t.expect(requests[1].payload.itemId).toBe("IronSword")
			t.expect(table.isfrozen(requests[1].payload)).toBe(true)
			t.expect(injected:hasResult(handle)).toBe(true)

			local events = readEvents(app, Completed)
			t.expect(#events).toBe(1)
			t.expect(events[1].handle).toBe(handle)
			t.expect(events[1].request.itemId).toBe("IronSword")
			t.expect(events[1].result.ok).toBe(true)
			t.expect(getmetatable(events[1].result.value)).toBe(Result)
			t.expect(events[1].result.value.equipped).toBe(true)
			t.expect(table.isfrozen(events[1])).toBe(true)
			t.expect(#observed).toBe(1)
			t.expect(observed[1]).toBe(events[1])

			local result = injected:takeResult(handle)
			t.expect(result.ok).toBe(true)
			t.expect(result.value.equipped).toBe(true)
			t.expect(injected:hasResult(handle)).toBe(false)
			app:flush()
			t.expect(#readEvents(app, Completed)).toBe(1)

			local nextHandle = injected:call(Command.new("rate"))
			t.expect(nextHandle.id > handle.id).toBe(true)
			app:flush()
			local rejected = injected:takeResult(nextHandle)
			t.expect(rejected.ok).toBe(false)
			t.expect(rejected.error).toBe("rate-limited")

			local malformedHandle = injected:call(Command.new("malformed"))
			app:flush()
			local malformed = injected:takeResult(malformedHandle)
			t.expect(malformed.ok).toBe(false)
			t.expect(
				malformed.error:find("malformed-command-result", 1, true)
					~= nil
			).toBe(true)
			t.expect(#readEvents(app, Completed)).toBe(3)
			t.expect(#observed).toBe(3)
		end)

		t.it("preserves sender and releases success only after queued writes commit", function()
			coreRovy:__reset()
			serverScribe.rovyScribe:__reset()
			local Update = {}
			coreRovy:__schedule(Update, { runOnStart = false })
			local data = registerData(serverScribe, "game/ServerCommands")
			local Command = contractClass({ "itemId" })
			local Result = contractClass({ "equipped", "reason" })
			local commandId = "game/EquipServer"
			registerCommand(serverScribe, data, Command, Result, commandId)

			local senderSeen
			local duplicateFailure
			local Handle = help.sysClass(function(_, requests, writes, respond)
				requests:forEach(function(request)
					senderSeen = request.player
					if request.value.itemId == "noop" then
						respond:resolve(request, Result.new(true))
						return
					end
					if request.value.itemId == "reject" then
						respond:reject(request, "not-owned")
						return
					end
					if request.value.itemId == "invalid-result" then
						respond:resolve(request, Result.new("yes"))
						return
					end
					if request.value.itemId == "duplicate" then
						respond:resolve(request, Result.new(true))
						local ok, failure = pcall(function()
							respond:reject(request, "second-response")
						end)
						if not ok then duplicateFailure = tostring(failure) end
						return
					end
					local profileWrites = writes["for"](
						writes,
						request.player
					)
					if request.value.itemId == "fail" then
						profileWrites.Coins:set("FAIL")
					else
						profileWrites.Coins:increment(25)
					end
					respond:resolve(request, Result.new(true))
				end)
			end)
			coreRovy:__system(Handle, {
				id = "game/HandleEquip",
				schedule = Update,
				params = {
					{
						kind = "external",
						id = serverScribe.commandReaderParamId(commandId),
					},
					{
						kind = "external",
						id = serverScribe.serverWriterParamId(data.id),
					},
					{
						kind = "external",
						id = serverScribe.SCRIBE_COMMAND_RESPONDER_PARAM,
					},
				},
			})

			local module, controls = serverCommandModule(help)
			local plugin = serverScribe.ScribeServerPlugin.new({
				module = module,
			})
			local app = App.new()
			app:addPlugin(plugin)
			app:start()
			local native = controls.handlers.EquipItem
			t.expect(native.spec.Args[1]).toBe("table")
			local player = {
				Name = "CommandPlayer",
			}
			local reply
			local dispatch = coroutine.create(function()
				reply = native.handler(player, {
					itemId = "IronSword",
				})
				table.insert(controls.calls, "ReplyReleased")
			end)
			local started = coroutine.resume(dispatch)
			t.expect(started).toBe(true)
			t.expect(coroutine.status(dispatch)).toBe("suspended")
			t.expect(reply).toBeUndefined()

			app:runSchedule(Update)
			t.expect(coroutine.status(dispatch)).toBe("dead")
			t.expect(senderSeen).toBe(player)
			t.expect(controls.state.Coins).toBe(125)
			t.expect(reply.Ok).toBe(true)
			t.expect(reply.Value.equipped).toBe(true)
			t.expect(table.concat(controls.calls, ","))
				.toBe("BatchStart,Increment,BatchEnd,ReplyReleased")

			local function invoke(itemId)
				local value
				local thread = coroutine.create(function()
					value = native.handler(player, {
						itemId = itemId,
					})
				end)
				coroutine.resume(thread)
				app:runSchedule(Update)
				t.expect(coroutine.status(thread)).toBe("dead")
				return value
			end

			local noWrite = invoke("noop")
			t.expect(noWrite.Ok).toBe(true)
			t.expect(controls.state.Coins).toBe(125)
			local rejected = invoke("reject")
			t.expect(rejected.Ok).toBe(false)
			t.expect(rejected.Error).toBe("not-owned")
			local invalid = invoke("invalid-result")
			t.expect(invalid.Ok).toBe(false)
			t.expect(
				invalid.Error:find("invalid-result", 1, true) ~= nil
			).toBe(true)
			local duplicate = invoke("duplicate")
			t.expect(duplicate.Ok).toBe(true)
			t.expect(
				duplicateFailure:find("already has a response", 1, true)
					~= nil
			).toBe(true)
		end)

		t.it("downgrades resolved commands when their buffered write fails", function()
			coreRovy:__reset()
			serverScribe.rovyScribe:__reset()
			local Update = {}
			coreRovy:__schedule(Update, { runOnStart = false })
			local data = registerData(serverScribe, "game/FailedCommands")
			local Command = contractClass({ "itemId" })
			local Result = contractClass({ "equipped", "reason" })
			local commandId = "game/EquipFailure"
			registerCommand(serverScribe, data, Command, Result, commandId)

			local Handle = help.sysClass(function(_, requests, writes, respond)
				requests:forEach(function(request)
					writes["for"](writes, request.player).Coins:set("FAIL")
					respond:resolve(request, Result.new(true))
				end)
			end)
			coreRovy:__system(Handle, {
				id = "game/HandleFailedEquip",
				schedule = Update,
				params = {
					{
						kind = "external",
						id = serverScribe.commandReaderParamId(commandId),
					},
					{
						kind = "external",
						id = serverScribe.serverWriterParamId(data.id),
					},
					{
						kind = "external",
						id = serverScribe.SCRIBE_COMMAND_RESPONDER_PARAM,
					},
				},
			})

			local module, controls = serverCommandModule(help)
			local plugin = serverScribe.ScribeServerPlugin.new({
				module = module,
			})
			local app = App.new()
			app:addPlugin(plugin)
			app:start()
			local reply
			local dispatch = coroutine.create(function()
				reply = controls.handlers.EquipItem.handler(
					{ Name = "FailurePlayer" },
					{ itemId = "fail" }
				)
			end)
			coroutine.resume(dispatch)
			app:runSchedule(Update)

			t.expect(coroutine.status(dispatch)).toBe("dead")
			t.expect(reply.Ok).toBe(false)
			t.expect(
				reply.Error:find("write-failed", 1, true) ~= nil
			).toBe(true)
			t.expect(controls.state.Coins).toBe(100)
			t.expect(#plugin.runtime:drainWriteFailures()).toBe(1)
		end)

		t.it("cancels sessions and expires unhandled requests", function()
			coreRovy:__reset()
			serverScribe.rovyScribe:__reset()
			local Update = {}
			coreRovy:__schedule(Update, { runOnStart = false })
			local data = registerData(
				serverScribe,
				"game/CancelledCommands"
			)
			local Command = contractClass({ "itemId" })
			local Result = contractClass({ "equipped", "reason" })
			local commandId = "game/CancelledEquip"
			registerCommand(serverScribe, data, Command, Result, commandId)
			coreRovy:__system(help.sysClass(function() end), {
				id = "game/CancelledConsumer",
				schedule = Update,
				params = {
					{
						kind = "external",
						id = serverScribe.commandReaderParamId(commandId),
					},
				},
			})
			local module, controls = serverCommandModule(help)
			local plugin = serverScribe.ScribeServerPlugin.new({
				module = module,
			})
			local app = App.new()
			app:addPlugin(plugin)
			app:start()
			local player = {
				Name = "DepartingPlayer",
			}
			local cancelled
			local dispatch = coroutine.create(function()
				cancelled = controls.handlers.EquipItem.handler(
					player,
					{ itemId = "IronSword" }
				)
			end)
			coroutine.resume(dispatch)
			t.expect(coroutine.status(dispatch)).toBe("suspended")
			controls.endSession(player, "player-left")
			app:flush()
			t.expect(coroutine.status(dispatch)).toBe("dead")
			t.expect(cancelled.Ok).toBe(false)
			t.expect(cancelled.Error).toBe("player-left")

			coreRovy:__reset()
			serverScribe.rovyScribe:__reset()
			Update = {}
			coreRovy:__schedule(Update, { runOnStart = false })
			data = registerData(
				serverScribe,
				"game/ExpiredCommands",
				0.000001
			)
			Command = contractClass({ "itemId" })
			Result = contractClass({ "equipped", "reason" })
			commandId = "game/ExpiredEquip"
			registerCommand(serverScribe, data, Command, Result, commandId)
			coreRovy:__system(help.sysClass(function() end), {
				id = "game/ExpiredConsumer",
				schedule = Update,
				params = {
					{
						kind = "external",
						id = serverScribe.commandReaderParamId(commandId),
					},
				},
			})
			module, controls = serverCommandModule(help)
			plugin = serverScribe.ScribeServerPlugin.new({
				module = module,
			})
			app = App.new()
			app:addPlugin(plugin)
			app:start()
			local expired
			dispatch = coroutine.create(function()
				expired = controls.handlers.EquipItem.handler(
					{ Name = "WaitingPlayer" },
					{ itemId = "IronSword" }
				)
			end)
			coroutine.resume(dispatch)
			local deadline = os.clock() + 0.001
			while os.clock() < deadline do end
			app:flush()
			t.expect(coroutine.status(dispatch)).toBe("dead")
			t.expect(expired.Ok).toBe(false)
			t.expect(expired.Error).toBe("unhandled")
		end)

		t.it("rejects malformed payloads and duplicate authoritative consumers", function()
			coreRovy:__reset()
			serverScribe.rovyScribe:__reset()
			local Update = {}
			coreRovy:__schedule(Update, { runOnStart = false })
			local data = registerData(serverScribe, "game/GuardedCommands")
			local Command = contractClass({ "itemId" })
			local Result = contractClass({ "equipped", "reason" })
			local commandId = "game/GuardedEquip"
			registerCommand(serverScribe, data, Command, Result, commandId)
			local Consumer = help.sysClass(function() end)
			local descriptor = {
				kind = "external",
				id = serverScribe.commandReaderParamId(commandId),
			}
			coreRovy:__system(Consumer, {
				id = "game/FirstConsumer",
				schedule = Update,
				params = { descriptor },
			})
			local module, controls = serverCommandModule(help)
			local plugin = serverScribe.ScribeServerPlugin.new({
				module = module,
			})
			local app = App.new()
			plugin:build(app)
			local malformed = controls.handlers.EquipItem.handler(
				{ Name = "MalformedPlayer" },
				{
					itemId = "IronSword",
					injected = true,
				}
			)
			t.expect(malformed.Ok).toBe(false)
			t.expect(
				malformed.Error:find("unknown field", 1, true) ~= nil
			).toBe(true)
			local missing = controls.handlers.EquipItem.handler(
				{ Name = "MissingFieldPlayer" },
				{}
			)
			t.expect(missing.Ok).toBe(false)
			t.expect(
				missing.Error:find("omits required field", 1, true)
					~= nil
			).toBe(true)
			local wrongType = controls.handlers.EquipItem.handler(
				{ Name = "WrongTypePlayer" },
				{ itemId = 123 }
			)
			t.expect(wrongType.Ok).toBe(false)
			t.expect(
				wrongType.Error:find("must be string", 1, true)
					~= nil
			).toBe(true)

			coreRovy:__system(help.sysClass(function() end), {
				id = "game/SecondConsumer",
				schedule = Update,
				params = { descriptor },
			})
			local duplicatePlugin = serverScribe.ScribeServerPlugin.new({
				module = module,
			})
			t.expect(function()
				duplicatePlugin:build(App.new())
			end).toThrow()
		end)
	end)
end
