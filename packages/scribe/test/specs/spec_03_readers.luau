--!nocheck

local help = require("../harness/scribe")

local function deepClone(value)
	if type(value) ~= "table" then return value end
	local output = {}
	for key, child in value do
		output[key] = deepClone(child)
	end
	return output
end

local function tableCount(value)
	local count = 0
	for _ in value or {} do
		count += 1
	end
	return count
end

local function leaf(read, defaultValue, minimum, maximum, active)
	local node = {
		Clone = function()
			return deepClone(read())
		end,
		Default = function()
			return deepClone(defaultValue)
		end,
		Min = function()
			return minimum
		end,
		Max = function()
			return maximum
		end,
	}
	if active ~= nil then
		node.Active = active
	end
	return node
end

local function recordNode(read, defaults, fields)
	local node = {
		Clone = function()
			return deepClone(read())
		end,
		Default = function()
			return deepClone(defaults)
		end,
	}
	for key, make in fields do
		node[key] = make()
	end
	return node
end

local function inventoryNode(values)
	local items = {}
	local node = {
		Clone = function()
			return deepClone(values)
		end,
		Default = function()
			return {}
		end,
		Count = function()
			return tableCount(values)
		end,
	}
	setmetatable(node, {
		__index = function(_, key)
			if items[key] ~= nil then return items[key] end
			local function item()
				return values[key]
			end
			local child = recordNode(item, { Amount = 1, Level = 1 }, {
				Amount = function()
					return leaf(function()
						return item() and item().Amount
					end, 1, 1, nil)
				end,
				Level = function()
					return leaf(function()
						return item() and item().Level
					end, 1, 1, 100)
				end,
			})
			items[key] = child
			return child
		end,
	})
	return node
end

local function arrayNode(values)
	local children = {}
	local node = {
		Clone = function()
			return deepClone(values)
		end,
		Default = function()
			return {}
		end,
		Count = function()
			return #values
		end,
	}
	setmetatable(node, {
		__index = function(_, index)
			if children[index] == nil then
				children[index] = leaf(function()
					return values[index]
				end, 0)
			end
			return children[index]
		end,
	})
	return node
end

local function rootAccessor(values)
	return {
		Coins = leaf(function()
			return values.Coins
		end, 0, 0, 100),
		Profile = recordNode(function()
			return values.Profile
		end, { Enabled = false }, {
			Enabled = function()
				return leaf(function()
					return values.Profile.Enabled
				end, false)
			end,
		}),
		Inventory = inventoryNode(values.Inventory),
		List = arrayNode(values.List),
		Active = leaf(function()
			return values.Active
		end, 1, nil, nil, function()
			return values.ActiveRunning, values.ActiveRemaining
		end),
		Public = recordNode(function()
			return values.Public
		end, { DisplayName = "", Title = "" }, {
			DisplayName = function()
				return leaf(function()
					return values.Public.DisplayName
				end, "")
			end,
			Title = function()
				return leaf(function()
					return values.Public.Title
				end, "")
			end,
		}),
		Secret = recordNode(function()
			return values.Secret
		end, { Flagged = false }, {
			Flagged = function()
				return leaf(function()
					return values.Secret.Flagged
				end, false)
			end,
		}),
	}
end

local function readerModule()
	local module = help.nativeModule()
	local controls = {
		ready = false,
		client = {
			Coins = 10,
			Profile = { Enabled = true },
			Inventory = {
				get = { Amount = 2, Level = 4 },
				Sword = { Amount = 1, Level = 7 },
			},
			List = { 3, 5, 8 },
			Active = 2,
			ActiveRunning = true,
			ActiveRemaining = 5,
			Public = { DisplayName = "Local", Title = "Hero" },
			Secret = { Flagged = true },
		},
		server = {
			Coins = 40,
			Profile = { Enabled = false },
			Inventory = { Sword = { Amount = 1, Level = 9 } },
			List = { 13, 21 },
			Active = 1,
			ActiveRunning = false,
			ActiveRemaining = nil,
			Public = { DisplayName = "Server", Title = "Knight" },
			Secret = { Flagged = true },
		},
		shared = {
			Public = { DisplayName = "Other", Title = "Wizard" },
			Secret = { Flagged = true },
			Injected = "must not escape",
		},
		states = {},
	}
	local clientRoot = rootAccessor(controls.client)
	clientRoot.IsReady = function()
		return controls.ready
	end
	clientRoot.GetServiceStatus = function()
		return "Degraded"
	end
	clientRoot.GetShared = function()
		return deepClone(controls.shared)
	end
	local serverRoot = rootAccessor(controls.server)
	local server = {
		GetState = function(player)
			return controls.states[player] or "SessionEnded"
		end,
		Get = function()
			return serverRoot
		end,
	}
	module.new = function()
		return {
			Client = clientRoot,
			Server = server,
		}
	end
	return module, controls
end

local function registerData(scribe)
	return scribe.rovyScribe:__data({
		id = "game/Readers",
		name = "Readers",
		profileStoreIndex = "Readers",
		profileKeyPrefix = "PLAYER_",
		template = {
			Coins = scribe.s:int(0, { min = 0, max = 100 }),
			Profile = { Enabled = false },
			Inventory = scribe.s:dictOf({
				Amount = scribe.s:int(1, { min = 1 }),
				Level = scribe.s:int(1, { min = 1, max = 100 }),
			}),
			List = scribe.s:arrayOf(scribe.s:int(0)),
			Active = scribe.s:timed(1),
			Public = scribe.s:shared({
				DisplayName = scribe.s:string(""),
				Title = scribe.s:string(""),
			}),
			Secret = scribe.s:serverOnly({ Flagged = false }),
		},
		options = {},
	})
end

return function(TS, t)
	local clientScribe = help.load(TS, "client")
	local serverScribe = help.load(TS, "server")
	local core = TS.import(nil, TS.getModule(nil, "@rovy", "rovy-core"))
	local App = core.App

	t.describe("@rovy/scribe committed reader trees", function()
		t.it("projects stable client snapshots and accessor-specific reads", function()
			serverScribe.rovyScribe:__reset()
			local data = registerData(serverScribe)
			local module, controls = readerModule()
			local plugin = clientScribe.ScribeClientPlugin.new({ module = module })
			local app = App.new()
			plugin:build(app)
			local reader = plugin.runtime:handle("client-reader", data.id)
			local state = plugin.runtime:handle("client-state", data.id)

			t.expect(reader.Coins:get()).toBe(10)
			t.expect(reader.Coins:default()).toBe(0)
			t.expect(reader.Coins:min()).toBe(0)
			t.expect(reader.Coins:max()).toBe(100)
			t.expect(reader.Secret).toBeUndefined()
			t.expect(reader.Inventory:count()).toBe(2)
			t.expect(reader.Inventory:at("get").Amount:get()).toBe(2)
			t.expect(reader.Inventory:at("missing").Amount:get()).toBeUndefined()
			t.expect(reader.Inventory:at("missing").Amount:default()).toBe(1)
			t.expect(reader.List:count()).toBe(3)
			t.expect(reader.List:at(0):get()).toBe(3)
			t.expect(reader.List:find(5)).toBe(1)
			t.expect(reader.List:has(8)).toBe(true)
			t.expect(reader.List:at(3)).toBeUndefined()
			t.expect(reader.Active:active().active).toBe(true)
			t.expect(reader.Active:active().remaining).toBe(5)

			local profile = reader.Profile:get()
			t.expect(table.isfrozen(profile)).toBe(true)
			t.expect(function()
				profile.Enabled = false
			end).toThrow()
			local clone = reader.Profile:clone()
			clone.Enabled = false
			t.expect(reader.Profile.Enabled:get()).toBe(true)

			controls.client.Coins = 20
			t.expect(reader.Coins:get()).toBe(10)
			t.expect(state.ready).toBe(false)
			controls.ready = true
			t.expect(state.ready).toBe(false)
			app:flush()
			t.expect(reader.Coins:get()).toBe(20)
			t.expect(state.ready).toBe(true)
			t.expect(state.serviceStatus).toBe("Degraded")
		end)

		t.it("selects server profiles without yielding and caches per flush", function()
			serverScribe.rovyScribe:__reset()
			local data = registerData(serverScribe)
			local module, controls = readerModule()
			local plugin = serverScribe.ScribeServerPlugin.new({ module = module })
			local app = App.new()
			plugin:build(app)
			local reader = plugin.runtime:handle("server-reader", data.id)
			local player = { Name = "ReaderPlayer" }

			controls.states[player] = "Loading"
			t.expect(reader:state(player)).toBe("Loading")
			t.expect(reader:get(player)).toBeUndefined()
			t.expect(function()
				reader:require(player)
			end).toThrow()

			controls.states[player] = "Ready"
			local profile = reader:require(player)
			t.expect(profile.Coins:get()).toBe(40)
			t.expect(profile.Secret.Flagged:get()).toBe(true)
			controls.server.Coins = 55
			t.expect(profile.Coins:get()).toBe(40)
			app:flush()
			t.expect(profile.Coins:get()).toBe(55)

			controls.states[player] = "SessionEnded"
			t.expect(reader:get(player)).toBeUndefined()
		end)

		t.it("returns only deeply frozen shared roots", function()
			serverScribe.rovyScribe:__reset()
			local data = registerData(serverScribe)
			local module, controls = readerModule()
			local plugin = clientScribe.ScribeClientPlugin.new({ module = module })
			local app = App.new()
			plugin:build(app)
			local shared = plugin.runtime:handle("shared-reader", data.id)

			local first = shared:get(42)
			t.expect(first.Public.DisplayName).toBe("Other")
			t.expect(first.Secret).toBeUndefined()
			t.expect(first.Injected).toBeUndefined()
			t.expect(table.isfrozen(first)).toBe(true)
			t.expect(table.isfrozen(first.Public)).toBe(true)
			controls.shared.Public.Title = "Mage"
			t.expect(shared:get(42).Public.Title).toBe("Wizard")
			app:flush()
			t.expect(shared:get(42).Public.Title).toBe("Mage")
		end)
	end)
end
