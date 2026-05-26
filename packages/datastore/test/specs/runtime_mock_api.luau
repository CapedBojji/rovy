--!nocheck
-- Mock backend coverage for Roblox-facing datastore calls: request ordering,
-- throttled/rate-limited failures, validation, session locks, and signal cleanup.

return function(TS, t)
	local datastore = TS.loadPath("out/init")
	local datastoreRoot = TS.getModule(nil, "@rovy", "datastore")
	local DataStoreRuntime = TS.import(nil, datastoreRoot, "out", "runtime", "data-store-runtime").DataStoreRuntime

	local function eventRegistry()
		return {
			events = {},
			send = function(self, event)
				table.insert(self.events, event)
			end,
		}
	end

	local function mockAdapter(config)
		local cfg = config or {}
		local adapter = {
			calls = {},
			stores = {},
			docs = {},
			data = {},
			openResults = cfg.openResults or {},
			saveBudget = cfg.saveBudget,
			openBudget = cfg.openBudget,
			closeBudget = cfg.closeBudget,
			disconnects = 0,
		}

		local function call(name, payload)
			table.insert(adapter.calls, { name = name, payload = payload })
		end

		local function consumeBudget(field)
			if adapter[field] == nil then
				return true
			end
			if adapter[field] <= 0 then
				return false
			end
			adapter[field] -= 1
			return true
		end

		local function rateLimited()
			return {
				success = false,
				reason = "RobloxAPIError",
				message = "429 Too Many Requests",
			}
		end

		function adapter:createStore(def)
			call("createStore", { id = def.id, store = def.store })
			local store = { def = def }
			self.stores[def.id] = store
			return store
		end

		function adapter:getDocument(store, key)
			call("getDocument", { store = store.def.store, key = key })
			local document = { store = store, key = key }
			self.docs[key] = document
			return document
		end

		function adapter:open(document, options)
			call("open", { key = document.key, stealOnSessionLocked = options.stealOnSessionLocked, reason = options.reason })
			if not consumeBudget("openBudget") then
				return rateLimited()
			end
			if #self.openResults > 0 then
				local result = table.remove(self.openResults, 1)
				if result.success then
					self.data[document.key] = result.data
				end
				return result
			end
			local current = self.data[document.key]
			if current == nil then
				current = document.store.def.default()
				self.data[document.key] = current
			end
			return { success = true, data = current }
		end

		function adapter:steal(document)
			call("steal", { key = document.key })
		end

		function adapter:close(document, options)
			call("close", { key = document.key, save = options.save, reason = options.reason })
			if not consumeBudget("closeBudget") then
				return rateLimited()
			end
			return { success = true, data = self.data[document.key] }
		end

		function adapter:getCache(document)
			call("getCache", { key = document.key })
			return self.data[document.key]
		end

		function adapter:setCache(document, data)
			call("setCache", { key = document.key, data = data })
			self.data[document.key] = data
		end

		function adapter:save(document)
			call("save", { key = document.key })
			if not consumeBudget("saveBudget") then
				return rateLimited()
			end
			return { success = true, data = self.data[document.key] }
		end

		function adapter:connectSignals(document, sink)
			call("connectSignals", { key = document.key, sink = sink })
			return function()
				adapter.disconnects += 1
				call("disconnectSignals", { key = document.key })
			end
		end

		return adapter
	end

	local function profileRuntime(config)
		datastore.rovyData:__reset()
		local token = datastore.rovyData:__document({
			id = "test/Profile",
			kind = "player",
			name = "Profile",
			store = "PlayerData",
			key = function(player)
				return tostring(player.UserId)
			end,
			default = function()
				return { coins = 0 }
			end,
			check = function(value)
				return type(value) == "table" and type(value.coins) == "number"
			end,
			migrations = {},
			session = {
				lock = true,
				stealOnSessionLocked = true,
			},
			lifecycle = {
				autoOpen = false,
				autoClose = false,
				kickOnOpenFailure = true,
			},
			debug = {
				printLifecycle = false,
				printWrites = false,
			},
		})
		local events = eventRegistry()
		local adapter = mockAdapter(config)
		local runtime = DataStoreRuntime.new(datastore.rovyData:documents(), events, adapter)
		return runtime, adapter, events, token
	end

	local function names(adapter)
		local out = {}
		for _, call in adapter.calls do
			table.insert(out, call.name)
		end
		return table.concat(out, ",")
	end

	t.describe("datastore mock api calls", function()
		t.it("opens through store lookup, document lookup, backend open, and signal connection", function()
			local runtime, adapter, events = profileRuntime()
			local player = { UserId = 101 }

			runtime:enqueueOpen("test/Profile", player, { reason = "join" })
			runtime:processQueues()

			t.expect(runtime:isOpen("test/Profile", player)).toBe(true)
			t.expect(runtime:keyOf("test/Profile", player)).toBe("101")
			t.expect(events.events[1].data.coins).toBe(0)
			t.expect(names(adapter)).toBe("createStore,getDocument,open,connectSignals")
			t.expect(adapter.calls[3].payload.stealOnSessionLocked).toBe(true)
			t.expect(adapter.calls[3].payload.reason).toBe("join")
		end)

		t.it("update with immediate save calls getCache, setCache, save, and emits changed then saved", function()
			local runtime, adapter, events = profileRuntime()
			local player = { UserId = 102 }

			runtime:enqueueOpen("test/Profile", player)
			runtime:processQueues()
			local result = runtime:update("test/Profile", player, function(data)
				return { coins = data.coins + 7 }
			end, { save = "immediate", reason = "award" })
			runtime:processQueues()

			t.expect(result.success).toBe(true)
			t.expect(runtime:get("test/Profile", player).coins).toBe(7)
			t.expect(events.events[2].before.coins).toBe(0)
			t.expect(events.events[2].after.coins).toBe(7)
			t.expect(events.events[3].data.coins).toBe(7)
			t.expect(events.events[3].reason).toBe("award")
			t.expect(names(adapter)).toBe("createStore,getDocument,open,connectSignals,getCache,setCache,save,getCache")
		end)

		t.it("invalid update does not write cache or spend save budget", function()
			local runtime, adapter, events = profileRuntime({ saveBudget = 0 })
			local player = { UserId = 103 }

			runtime:enqueueOpen("test/Profile", player)
			runtime:processQueues()
			local result = runtime:update("test/Profile", player, function()
				return { coins = "bad" }
			end, { save = "immediate", reason = "bad-award" })
			runtime:processQueues()

			t.expect(result.success).toBe(false)
			t.expect(result.reason).toBe("ValidationError")
			t.expect(#events.events).toBe(1)
			t.expect(names(adapter)).toBe("createStore,getDocument,open,connectSignals,getCache")
		end)

		t.it("session lock failure steals once and retries when document allows stealing", function()
			local runtime, adapter, events = profileRuntime({
				openResults = {
					{ success = false, reason = "SessionLockedError", message = "locked elsewhere" },
					{ success = true, data = { coins = 12 } },
				},
			})
			local player = { UserId = 104 }

			runtime:enqueueOpen("test/Profile", player)
			runtime:processQueues()

			t.expect(runtime:isOpen("test/Profile", player)).toBe(true)
			t.expect(runtime:get("test/Profile", player).coins).toBe(12)
			t.expect(events.events[1].data.coins).toBe(12)
			t.expect(names(adapter)).toBe("createStore,getDocument,open,steal,open,connectSignals,getCache")
		end)

		t.it("open rate-limit failure emits openFailed and kicks player when configured", function()
			local runtime, adapter, events = profileRuntime({ openBudget = 0 })
			local kicked = {}
			local player = {
				UserId = 105,
				Kick = function(_, message)
					table.insert(kicked, message)
				end,
			}

			runtime:enqueueOpen("test/Profile", player, { reason = "join" })
			runtime:processQueues()

			t.expect(runtime:status("test/Profile", player)).toBe("failed")
			t.expect(events.events[1].reason).toBe("RobloxAPIError")
			t.expect(events.events[1].message).toBe("429 Too Many Requests")
			t.expect(kicked[1]).toBe("429 Too Many Requests")
			t.expect(names(adapter)).toBe("createStore,getDocument,open")
		end)

		t.it("loaded data failing validator emits openFailed and never connects signals", function()
			local runtime, adapter, events = profileRuntime({
				openResults = {
					{ success = true, data = { coins = "bad" } },
				},
			})
			local player = { UserId = 106 }

			runtime:enqueueOpen("test/Profile", player)
			runtime:processQueues()

			t.expect(runtime:status("test/Profile", player)).toBe("failed")
			t.expect(events.events[1].reason).toBe("ValidationError")
			t.expect(events.events[1].message).toBe("Profile loaded invalid data.")
			t.expect(names(adapter)).toBe("createStore,getDocument,open")
		end)

		t.it("save rate-limit failure emits saveFailed and leaves session failed", function()
			local runtime, adapter, events = profileRuntime({ saveBudget = 0 })
			local player = { UserId = 107 }

			runtime:enqueueOpen("test/Profile", player)
			runtime:processQueues()
			runtime:update("test/Profile", player, function(data)
				return { coins = data.coins + 1 }
			end, { save = "immediate", reason = "autosave" })
			runtime:processQueues()

			t.expect(runtime:status("test/Profile", player)).toBe("failed")
			t.expect(events.events[3].reason).toBe("RobloxAPIError")
			t.expect(events.events[3].message).toBe("429 Too Many Requests")
			t.expect(names(adapter)).toBe("createStore,getDocument,open,connectSignals,getCache,setCache,save")
		end)

		t.it("close passes save option and disconnects only after backend close succeeds", function()
			local runtime, adapter, events = profileRuntime()
			local player = { UserId = 108 }

			runtime:enqueueOpen("test/Profile", player)
			runtime:processQueues()
			runtime:enqueueClose("test/Profile", player, { save = true, reason = "leave" })
			runtime:processQueues()

			t.expect(runtime:status("test/Profile", player)).toBe("closed")
			t.expect(adapter.disconnects).toBe(1)
			t.expect(events.events[2].reason).toBe("leave")
			t.expect(adapter.calls[5].name).toBe("close")
			t.expect(adapter.calls[5].payload.save).toBe(true)
			t.expect(adapter.calls[5].payload.reason).toBe("leave")
			t.expect(adapter.calls[6].name).toBe("disconnectSignals")
		end)

		t.it("close rate-limit failure emits saveFailed and keeps signal connection alive", function()
			local runtime, adapter, events = profileRuntime({ closeBudget = 0 })
			local player = { UserId = 109 }

			runtime:enqueueOpen("test/Profile", player)
			runtime:processQueues()
			runtime:enqueueClose("test/Profile", player, { save = true, reason = "shutdown" })
			runtime:processQueues()

			t.expect(runtime:status("test/Profile", player)).toBe("failed")
			t.expect(adapter.disconnects).toBe(0)
			t.expect(events.events[2].reason).toBe("RobloxAPIError")
			t.expect(events.events[2].message).toBe("429 Too Many Requests")
			t.expect(names(adapter)).toBe("createStore,getDocument,open,connectSignals,close")
		end)

		t.it("queue processing drains multiple throttled saves without leaving retry ghosts", function()
			local runtime, adapter, events = profileRuntime({ saveBudget = 1 })
			local p1 = { UserId = 110 }
			local p2 = { UserId = 111 }

			runtime:enqueueOpen("test/Profile", p1)
			runtime:enqueueOpen("test/Profile", p2)
			runtime:processQueues()
			runtime:update("test/Profile", p1, function(data)
				return { coins = data.coins + 10 }
			end, { save = "immediate", reason = "first" })
			runtime:update("test/Profile", p2, function(data)
				return { coins = data.coins + 20 }
			end, { save = "immediate", reason = "second" })
			runtime:processQueues()

			t.expect(#runtime.pendingImmediateSaves).toBe(0)
			t.expect(events.events[6].reason).toBe("RobloxAPIError")
			t.expect(events.events[6].message).toBe("429 Too Many Requests")
			t.expect(runtime:status("test/Profile", p1)).toBe("open")
			t.expect(runtime:status("test/Profile", p2)).toBe("failed")
		end)
	end)
end
