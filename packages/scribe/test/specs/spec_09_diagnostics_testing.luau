--!nocheck

local help = require("../harness/scribe")

local function class(field)
	local C = {}
	C.__index = C
	C.new = function(value)
		return setmetatable({
			[field] = value,
		}, C)
	end
	return C
end

local function clientTestingModule(help)
	local module = help.nativeModule()
	local coins = 10
	local calls = {
		logFilters = {},
		sinks = {},
	}
	local mockCommands = {}
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
			Update = function(transform)
				coins = transform(coins)
			end,
			Increment = function(amount)
				coins += amount
			end,
			Decrement = function(amount)
				coins -= amount
			end,
		},
		IsReady = function()
			return true
		end,
		GetServiceStatus = function()
			return "Healthy"
		end,
		GetSaveInfo = function()
			return { Dirty = false }
		end,
		GetShared = function()
			return nil
		end,
		Mock = function(values, state)
			calls.mockValues = values
			calls.mockState = state
			if values and values.Coins ~= nil then
				coins = values.Coins
			end
		end,
		MockCommand = function(name, handler)
			calls.mockCommandName = name
			mockCommands[name] = handler
		end,
		Request = function(name, payload)
			local handler = mockCommands[name]
			if not handler then return false, "edit-mode" end
			local ok, value = pcall(handler, payload)
			if not ok then return false, "mock-error" end
			return value
		end,
	}
	module.GetStatus = function()
		return "Degraded"
	end
	module.GetRecentLogs = function(filter)
		table.insert(calls.logFilters, filter)
		return {
			{
				At = 100,
				Level = "Warn",
				Category = "Persistence",
				Code = "SAVE_LATE",
				Message = "save delayed",
				Context = {
					Attempt = 2,
				},
			},
		}
	end
	module.GetMetrics = function()
		return {
			Saves = 8,
			Latency = {
				Count = 4,
				Average = 0.25,
				Max = 0.75,
			},
		}
	end
	module.AddLogSink = function(sink)
		table.insert(calls.sinks, sink)
	end
	module.new = function()
		return {
			Client = client,
			Server = {},
		}
	end
	return module, {
		calls = calls,
		coins = function()
			return coins
		end,
		fireLog = function(entry)
			for _, sink in calls.sinks do
				sink(entry)
			end
		end,
	}
end

return function(TS, t)
	local scribe = help.load(TS, "client")
	local core = TS.import(nil, TS.getModule(nil, "@rovy", "rovy-core"))
	local App = core.App
	local rovy = core.rovy
	local ScribeTestingRuntime =
		TS.loadPath("out/shared/testing").ScribeTestingRuntime

	t.describe("@rovy/scribe diagnostics and edit-mode testing", function()
		t.it("normalizes native diagnostics and buffers typed mock state", function()
			rovy:__reset()
			scribe.rovyScribe:__reset()
			local Update = {}
			rovy:__schedule(Update, { runOnStart = false })
			local data = scribe.rovyScribe:__data({
				id = "game/Testing",
				name = "Testing",
				profileStoreIndex = "Testing",
				profileKeyPrefix = "PLAYER_",
				template = {
					Coins = scribe.s:int(0, { min = 0 }),
					Secret = scribe.s:serverOnly({
						Flagged = false,
					}),
				},
				options = {},
			})
			local Request = class("amount")
			local Result = class("total")
			scribe.rovyScribe:__command(Request, {
				id = "game/Testing@Double",
				name = "Double",
				dataId = data.id,
				fields = { "amount" },
				optionalFields = {},
				fieldTypes = {
					{ kind = "number" },
				},
				result = Result,
				resultFields = { "total" },
				resultOptionalFields = {},
				resultFieldTypes = {
					{ kind = "number" },
				},
			})

			local diagnostics
			local testing
			local reader
			local command
			local Capture = help.sysClass(function(_, d, test, r, c)
				diagnostics = d
				testing = test
				reader = r
				command = c
			end)
			rovy:__system(Capture, {
				id = "game/CaptureDiagnosticsTesting",
				schedule = Update,
				params = {
					{
						kind = "external",
						id = scribe.SCRIBE_DIAGNOSTICS_PARAM,
					},
					{
						kind = "external",
						id = scribe.testingParamId(data.id),
					},
					{
						kind = "external",
						id = scribe.clientReaderParamId(data.id),
					},
					{
						kind = "external",
						id = scribe.commandClientParamId(
							"game/Testing@Double"
						),
					},
				},
			})
			local module, controls = clientTestingModule(help)
			local app = App.new()
			app:addPlugin(scribe.ScribeClientPlugin.new({
				module = module,
			}))
			app:start()
			app:runSchedule(Update)

			t.expect(diagnostics:status()).toBe("Degraded")
			local logs = diagnostics:recentLogs({
				level = "Warn",
				category = "Persistence",
				code = "SAVE_LATE",
				limit = 1,
			})
			t.expect(#logs).toBe(1)
			t.expect(logs[1].at).toBe(100)
			t.expect(logs[1].level).toBe("Warn")
			t.expect(logs[1].context.Attempt).toBe(2)
			t.expect(table.isfrozen(logs)).toBe(true)
			t.expect(table.isfrozen(logs[1])).toBe(true)
			t.expect(table.isfrozen(logs[1].context)).toBe(true)
			local nativeFilter = controls.calls.logFilters[1]
			t.expect(nativeFilter.Level).toBe("Warn")
			t.expect(nativeFilter.Category).toBe("Persistence")
			t.expect(nativeFilter.Code).toBe("SAVE_LATE")
			t.expect(nativeFilter.Limit).toBe(1)

			local metrics = diagnostics:metrics()
			t.expect(metrics.Saves).toBe(8)
			t.expect(metrics.Latency.count).toBe(4)
			t.expect(metrics.Latency.average).toBe(0.25)
			t.expect(metrics.Latency.max).toBe(0.75)
			t.expect(table.isfrozen(metrics)).toBe(true)
			t.expect(table.isfrozen(metrics.Latency)).toBe(true)
			local sinkEntry
			diagnostics:addSink(function(entry)
				sinkEntry = entry
			end)
			local rawLog = {
				At = 200,
				Level = "Error",
				Category = "Integrity",
				Code = "BROKEN",
				Message = "broken",
				Context = { Key = "before" },
			}
			controls.fireLog(rawLog)
			rawLog.Context.Key = "after"
			t.expect(sinkEntry.code).toBe("BROKEN")
			t.expect(sinkEntry.context.Key).toBe("before")
			t.expect(table.isfrozen(sinkEntry)).toBe(true)
			t.expect(function()
				diagnostics:recentLogs({ limit = 0 })
			end).toThrow()
			t.expect(function()
				diagnostics:recentLogs({ level = "Verbose" })
			end).toThrow()
			t.expect(function()
				diagnostics:recentLogs({ category = "Unknown" })
			end).toThrow()
			t.expect(function()
				controls.fireLog({
					At = 300,
					Level = "Error",
					Category = "Unknown",
					Code = "BROKEN",
					Message = "broken",
				})
			end).toThrow()

			local seed = {
				Coins = 40,
			}
			local seedState = {
				perks = { "VIP" },
				giftCredits = {
					Coins100 = 2,
				},
				leaderboards = {
					Coins = {
						{
							rank = 1,
							userId = 10,
							name = "Mock",
							score = 40,
						},
					},
				},
				purchases = {
					{
						kind = "InGame",
						category = "Potion",
						itemId = "Health",
						timestamp = 123,
						metadata = {
							Region = "US",
						},
					},
				},
			}
			testing:seed(seed, seedState)
			seed.Coins = 999
			seedState.giftCredits.Coins100 = 999
			t.expect(reader.Coins:get()).toBe(10)
			t.expect(controls.calls.mockValues).toBeUndefined()
			app:flush()
			t.expect(reader.Coins:get()).toBe(40)
			t.expect(controls.coins()).toBe(40)
			t.expect(controls.calls.mockValues.Coins).toBe(40)
			t.expect(controls.calls.mockState.Perks[1]).toBe("VIP")
			t.expect(controls.calls.mockState.GiftCredits.Coins100).toBe(2)
			t.expect(
				controls.calls.mockState.Leaderboards.Coins[1].Rank
			).toBe(1)
			t.expect(
				controls.calls.mockState.PurchaseLogs.InGame[1].ItemId
			).toBe("Health")
			t.expect(
				controls.calls.mockState.PurchaseLogs.InGame[1].Meta.Region
			).toBe("US")

			t.expect(function()
				testing:seed({
					Unknown = true,
				})
			end).toThrow()
			t.expect(function()
				testing:seed({
					Secret = {
						Flagged = true,
					},
				})
			end).toThrow()

			local observedRequest
			testing:mockCommand(Request, function(request)
				observedRequest = request
				return Result.new(request.amount * 2)
			end)
			t.expect(controls.calls.mockCommandName).toBe("Double")
			local handle = command:call(Request.new(5), "mock-call")
			app:flush()
			local response = command:takeResult(handle)
			t.expect(response.ok).toBe(true)
			t.expect(response.value.total).toBe(10)
			t.expect(getmetatable(response.value)).toBe(Result)
			t.expect(observedRequest.amount).toBe(5)
			t.expect(getmetatable(observedRequest)).toBe(Request)
			t.expect(table.isfrozen(observedRequest)).toBe(true)

			local Unknown = class("value")
			t.expect(function()
				testing:mockCommand(Unknown, function()
					return Result.new(0)
				end)
			end).toThrow()

			local guarded = ScribeTestingRuntime.new(
				{ publicToken = data },
				"client",
				{},
				{},
				{},
				false
			)
			t.expect(function()
				guarded:seed({ Coins = 1 })
			end).toThrow()
			t.expect(function()
				guarded:mockCommand(Request, function(request)
					return Result.new(request.amount)
				end)
			end).toThrow()
		end)
	end)
end
