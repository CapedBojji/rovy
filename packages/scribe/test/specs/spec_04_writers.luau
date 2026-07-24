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

local function replaceTable(target, source)
	table.clear(target)
	for key, value in source do
		target[key] = deepClone(value)
	end
end

local function unwrap(schema)
	while type(schema) == "table"
		and (schema.kind == "visibility" or schema.kind == "optional") do
		schema = schema.inner
	end
	return schema
end

local function defaultValue(schema)
	if type(schema) ~= "table" then
		return deepClone(schema)
	end
	if schema.kind == "visibility" then
		return defaultValue(schema.inner)
	elseif schema.kind == "optional" then
		return nil
	elseif schema.kind == "number"
		or schema.kind == "string"
		or schema.kind == "enum"
		or schema.kind == "datatype" then
		return deepClone(schema.defaultValue)
	elseif schema.kind == "timed" then
		return deepClone(schema.inner)
	elseif schema.kind == "dynamic" then
		return schema.factory()
	elseif schema.kind == "array" or schema.kind == "dictionary" then
		return {}
	end
	local output = {}
	for key, child in schema do
		output[key] = defaultValue(child)
	end
	return output
end

local function childLocation(parent, key, parentSchema)
	return {
		get = function()
			local value = parent.get()
			if type(value) == "table" then
				return value[key]
			end
			return nil
		end,
		set = function(value)
			local container = parent.get()
			if type(container) ~= "table" then
				container = defaultValue(parentSchema)
				if type(container) ~= "table" then container = {} end
				parent.set(container)
			end
			container[key] = value
		end,
	}
end

local function makeAccessor(schema, location, path, controls)
	local rawSchema = schema
	local unwrapped = unwrap(schema)
	local node = {
		Clone = function()
			return deepClone(location.get())
		end,
		Default = function()
			return defaultValue(rawSchema)
		end,
		Set = function(value)
			if value == "FAIL" then error("forced write failure") end
			table.insert(controls.calls, { kind = "Set", path = path, value = value })
			location.set(deepClone(value))
			return value
		end,
		Update = function(transform)
			table.insert(controls.calls, { kind = "Update", path = path })
			local value = transform(deepClone(location.get()))
			if value == "FAIL" then error("forced write failure") end
			location.set(deepClone(value))
			return value
		end,
	}

	if type(unwrapped) == "table" and unwrapped.kind == "timed" then
		node.SetTimed = function(value, seconds)
			table.insert(controls.calls, {
				kind = "SetTimed",
				path = path,
				value = value,
				seconds = seconds,
			})
			location.set(value)
			controls.timers[path] = seconds
		end
		node.ExtendTimed = function(seconds)
			table.insert(controls.calls, {
				kind = "ExtendTimed",
				path = path,
				seconds = seconds,
			})
			controls.timers[path] = (controls.timers[path] or 0) + seconds
		end
		node.Active = function()
			local remaining = controls.timers[path]
			return remaining ~= nil, remaining
		end
		return node
	end

	if type(unwrapped) == "number"
		or (type(unwrapped) == "table" and unwrapped.kind == "number") then
		local options = type(unwrapped) == "table" and unwrapped.options or {}
		node.Min = function()
			return options and options.min
		end
		node.Max = function()
			return options and options.max
		end
		node.Increment = function(amount, economy)
			table.insert(controls.calls, {
				kind = "Increment",
				path = path,
				amount = amount,
				economy = economy,
			})
			local current = location.get()
			if current == nil then current = defaultValue(rawSchema) end
			location.set(current + amount)
			return location.get()
		end
		node.Decrement = function(amount, economy)
			table.insert(controls.calls, {
				kind = "Decrement",
				path = path,
				amount = amount,
				economy = economy,
			})
			local current = location.get()
			if current == nil then current = defaultValue(rawSchema) end
			location.set(current - amount)
			return location.get()
		end
	elseif type(unwrapped) == "boolean" then
		node.Toggle = function()
			table.insert(controls.calls, { kind = "Toggle", path = path })
			location.set(not location.get())
			return location.get()
		end
	end

	if type(unwrapped) == "table" and unwrapped.kind == "array" then
		node.Count = function()
			return #(location.get() or {})
		end
		node.Insert = function(value, index)
			table.insert(controls.calls, {
				kind = "Insert",
				path = path,
				index = index,
			})
			local values = location.get()
			table.insert(values, index or (#values + 1), deepClone(value))
		end
		node.Remove = function(index)
			table.insert(controls.calls, {
				kind = "Remove",
				path = path,
				index = index,
			})
			local values = location.get()
			return table.remove(values, index or #values)
		end
		node.RemoveValue = function(value)
			table.insert(controls.calls, { kind = "RemoveValue", path = path })
			local values = location.get()
			for index, current in values do
				if current == value then
					return table.remove(values, index), index
				end
			end
		end
		node.Clear = function()
			table.insert(controls.calls, { kind = "Clear", path = path })
			table.clear(location.get())
		end
		setmetatable(node, {
			__index = function(_, index)
				return makeAccessor(
					unwrapped.element,
					childLocation(location, index, unwrapped),
					path .. "." .. tostring(index),
					controls
				)
			end,
		})
		return node
	elseif type(unwrapped) == "table" and unwrapped.kind == "dictionary" then
		node.Count = function()
			local count = 0
			for _ in location.get() or {} do count += 1 end
			return count
		end
		node.Remove = function(key)
			table.insert(controls.calls, {
				kind = "Remove",
				path = path,
				key = key,
			})
			local previous = location.get()[key]
			location.get()[key] = nil
			return previous
		end
		node.Clear = function()
			table.insert(controls.calls, { kind = "Clear", path = path })
			table.clear(location.get())
		end
		setmetatable(node, {
			__index = function(_, key)
				return makeAccessor(
					unwrapped.element,
					childLocation(location, key, unwrapped),
					path .. "." .. tostring(key),
					controls
				)
			end,
		})
		return node
	end

	if type(unwrapped) == "table" and unwrapped.kind == nil then
		for key, child in unwrapped do
			node[key] = makeAccessor(
				child,
				childLocation(location, key, unwrapped),
				path .. "." .. tostring(key),
				controls
			)
		end
	end
	return node
end

local function rootAccessor(template, values, controls)
	local root = {}
	local location = {
		get = function()
			return values
		end,
		set = function(value)
			replaceTable(values, value)
		end,
	}
	for key, schema in template do
		root[key] = makeAccessor(
			schema,
			childLocation(location, key, template),
			key,
			controls
		)
	end
	return root
end

local function writerModule(template)
	local module = help.nativeModule()
	local controls = {
		calls = {},
		timers = {},
		batches = 0,
		transactions = 0,
		client = {
			Coins = 10,
			Flag = false,
			Profile = { Name = "Client" },
			Inventory = { Potion = { Amount = 1, Level = 2 } },
			List = { 1, 2 },
			Active = 1,
			Optional = "client",
			Secret = { Flagged = false },
		},
		server = {
			Coins = 100,
			Flag = false,
			Profile = { Name = "Server" },
			Inventory = { Potion = { Amount = 1, Level = 2 } },
			List = { 10, 20 },
			Active = 1,
			Optional = "server",
			Secret = { Flagged = false },
		},
	}
	local client = rootAccessor(template, controls.client, controls)
	client.IsReady = function() return true end
	client.GetServiceStatus = function() return "Healthy" end
	client.GetShared = function() return nil end
	local serverRoot = rootAccessor(template, controls.server, controls)
	local server = {
		GetState = function()
			return "Ready"
		end,
		Get = function()
			return serverRoot
		end,
		Batch = function(_, callback)
			controls.batches += 1
			table.insert(controls.calls, { kind = "BatchStart" })
			callback()
			table.insert(controls.calls, { kind = "BatchEnd" })
		end,
		Transaction = function(_, callback)
			controls.transactions += 1
			table.insert(controls.calls, { kind = "TransactionStart" })
			local before = deepClone(controls.server)
			local ok, err = pcall(callback)
			if not ok then
				replaceTable(controls.server, before)
				table.insert(controls.calls, { kind = "TransactionRollback" })
				return false, tostring(err)
			end
			table.insert(controls.calls, { kind = "TransactionCommit" })
			return true, nil
		end,
	}
	module.new = function()
		return { Client = client, Server = server }
	end
	return module, controls
end

local function registerData(scribe)
	local template = {
		Coins = scribe.s:int(0, { min = 0 }),
		Flag = false,
		Profile = { Name = scribe.s:string("") },
		Inventory = scribe.s:dictOf({
			Amount = scribe.s:int(1, { min = 1 }),
			Level = scribe.s:int(1, { min = 1, max = 100 }),
		}),
		List = scribe.s:arrayOf(scribe.s:int(0)),
		Active = scribe.s:timed(1),
		Optional = scribe.s:optional(scribe.s:string("")),
		Secret = scribe.s:serverOnly({ Flagged = false }),
	}
	local data = scribe.rovyScribe:__data({
		id = "game/Writers",
		name = "Writers",
		profileStoreIndex = "Writers",
		profileKeyPrefix = "PLAYER_",
		template = template,
		options = {
			Economy = {
				Currencies = {
					Coins = {
						Fields = { "Region" },
					},
				},
			},
		},
	})
	return data, template
end

return function(TS, t)
	local clientScribe = help.load(TS, "client")
	local serverScribe = help.load(TS, "server")
	local core = TS.import(nil, TS.getModule(nil, "@rovy", "rovy-core"))
	local App = core.App

	t.describe("@rovy/scribe buffered writers", function()
		t.it("batches authoritative writes and keeps same-flush reads stable", function()
			serverScribe.rovyScribe:__reset()
			local data, template = registerData(serverScribe)
			local module, controls = writerModule(template)
			local plugin = serverScribe.ScribeServerPlugin.new({ module = module })
			local app = App.new()
			plugin:build(app)
			local player = { Name = "WriterPlayer" }
			local reader = plugin.runtime:handle("server-reader", data.id)
			local writer = plugin.runtime:handle("server-writer", data.id)
			local profile = reader:require(player)
			local writes = writer["for"](writer, player)

			writes.Coins:increment(25, {
				flow = "source",
				transactionType = "Reward",
				itemSku = "enemy",
				fields = { Region = "US" },
			})
			writes.Flag:toggle()
			writes.Inventory:at("Potion").Amount:increment(2)
			writes.List:insert(5, 1)
			writes.List:at(0):set(11)
			writes.List:remove(2)
			writes.Optional:set(nil)
			writes.Active:setTimed(2, 30)

			t.expect(profile.Coins:get()).toBe(100)
			t.expect(profile.Flag:get()).toBe(false)
			app:flush()

			t.expect(controls.batches).toBe(1)
			t.expect(profile.Coins:get()).toBe(125)
			t.expect(profile.Flag:get()).toBe(true)
			t.expect(profile.Inventory:at("Potion").Amount:get()).toBe(3)
			t.expect(profile.List:get()[1]).toBe(11)
			t.expect(profile.List:get()[2]).toBe(5)
			t.expect(#profile.List:get()).toBe(2)
			t.expect(profile.Optional:get()).toBeUndefined()
			t.expect(profile.Active:get()).toBe(2)
			t.expect(controls.timers.Active).toBe(30)

			local economy
			for _, call in controls.calls do
				if call.kind == "Increment" and call.path == "Coins" then
					economy = call.economy
					break
				end
			end
			t.expect(economy.Flow).toBe("Source")
			t.expect(economy.TransactionType).toBe("Reward")
			t.expect(economy.ItemSku).toBe("enemy")
			t.expect(economy.Fields.Region).toBe("US")
			t.expect(function()
				writes.Coins:increment(1, {
					fields = {
						Typo = "US",
					},
				})
			end).toThrow()
			t.expect(function()
				writes.Coins:increment(1, {
					fields = {
						Region = function() end,
					},
				})
			end).toThrow()
		end)

		t.it("evaluates updates in call order and snapshots queued arguments", function()
			serverScribe.rovyScribe:__reset()
			local data, template = registerData(serverScribe)
			local module, controls = writerModule(template)
			local plugin = serverScribe.ScribeServerPlugin.new({ module = module })
			local app = App.new()
			plugin:build(app)
			local player = { Name = "UpdatePlayer" }
			local reader = plugin.runtime:handle("server-reader", data.id)
			local writer = plugin.runtime:handle("server-writer", data.id)
			local writes = writer["for"](writer, player)

			writes.Coins:increment(5)
			writes.Coins:update(function(current)
				return current * 2
			end)
			local sawFrozenUpdate = false
			writes.Profile:update(function(current)
				sawFrozenUpdate = table.isfrozen(current)
				return { Name = current.Name .. "!" }
			end)
			local replacement = { Potion = { Amount = 9, Level = 3 } }
			writes.Inventory:set(replacement)
			replacement.Potion.Amount = 999
			app:flush()

			local profile = reader:require(player)
			t.expect(profile.Coins:get()).toBe(210)
			t.expect(sawFrozenUpdate).toBe(true)
			t.expect(profile.Profile.Name:get()).toBe("Server!")
			t.expect(profile.Inventory:at("Potion").Amount:get()).toBe(9)
		end)

		t.it("preserves transaction position and records rollback failures", function()
			serverScribe.rovyScribe:__reset()
			local data, template = registerData(serverScribe)
			local module, controls = writerModule(template)
			local plugin = serverScribe.ScribeServerPlugin.new({ module = module })
			local app = App.new()
			plugin:build(app)
			local player = { Name = "TransactionPlayer" }
			local writer = plugin.runtime:handle("server-writer", data.id)
			local writes = writer["for"](writer, player)

			writes.Coins:increment(10)
			local handle = writer:transaction(player, function(transaction)
				transaction.Coins:decrement(20)
				transaction.Inventory:at("Potion").Amount:increment(4)
			end)
			writes.Coins:increment(1)
			app:flush()

			t.expect(handle.id).toBe(1)
			t.expect(controls.batches).toBe(2)
			t.expect(controls.transactions).toBe(1)
			t.expect(controls.server.Coins).toBe(91)
			t.expect(controls.server.Inventory.Potion.Amount).toBe(5)
			local boundaries = {}
			for _, call in controls.calls do
				if call.kind == "BatchStart" or call.kind == "TransactionStart" then
					table.insert(boundaries, call.kind)
				end
			end
			t.expect(table.concat(boundaries, ","))
				.toBe("BatchStart,TransactionStart,BatchStart")

			writer:transaction(player, function(transaction)
				transaction.Coins:decrement(50)
				transaction.Optional:set("FAIL")
			end)
			app:flush()
			t.expect(controls.server.Coins).toBe(91)
			t.expect(controls.server.Optional).toBe("server")
			local failures = plugin.runtime:drainWriteFailures()
			t.expect(#failures).toBe(1)
			t.expect(failures[1].transactionId).toBe(2)
			t.expect(
				failures[1].error:find("forced write failure", 1, true) ~= nil
			).toBe(true)
		end)

		t.it("reports ordinary batch failures without claiming rollback", function()
			serverScribe.rovyScribe:__reset()
			local data, template = registerData(serverScribe)
			local module, controls = writerModule(template)
			local plugin = serverScribe.ScribeServerPlugin.new({ module = module })
			local app = App.new()
			plugin:build(app)
			local player = { Name = "FailurePlayer" }
			local writer = plugin.runtime:handle("server-writer", data.id)
			local writes = writer["for"](writer, player)

			writes.Coins:increment(1)
			writes.Optional:set("FAIL")
			writes.Coins:increment(2)
			app:flush()

			-- Native Batch coalesces replication but is deliberately not atomic.
			t.expect(controls.server.Coins).toBe(101)
			local failures = plugin.runtime:drainWriteFailures()
			t.expect(#failures).toBe(1)
			t.expect(failures[1].transactionId).toBeUndefined()
			t.expect(#failures[1].operations).toBe(3)
		end)

		t.it("applies client-local writes only to the local mirror", function()
			serverScribe.rovyScribe:__reset()
			local data, template = registerData(serverScribe)
			local module, controls = writerModule(template)
			local plugin = clientScribe.ScribeClientPlugin.new({ module = module })
			local app = App.new()
			plugin:build(app)
			local reader = plugin.runtime:handle("client-reader", data.id)
			local writer = plugin.runtime:handle("local-writer", data.id)

			t.expect(writer.Secret).toBeUndefined()
			writer.Coins:increment(7)
			writer.Profile.Name:set("Preview")
			t.expect(reader.Coins:get()).toBe(10)
			app:flush()
			t.expect(reader.Coins:get()).toBe(17)
			t.expect(reader.Profile.Name:get()).toBe("Preview")
			t.expect(controls.server.Coins).toBe(100)
			t.expect(controls.batches).toBe(0)

			controls.client.Coins = 999
			app:flush()
			t.expect(reader.Coins:get()).toBe(999)
		end)
	end)
end
