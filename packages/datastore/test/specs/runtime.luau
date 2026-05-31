--!nocheck

return function(TS, t)
	local datastore = TS.loadPath("out/init")
	local coreRoot = TS.getModule(nil, "@rovy", "core")
	local rovy = TS.import(nil, coreRoot, "out", "rovy").rovy
	local App = TS.import(nil, coreRoot, "out", "runtime", "app").App

	local function sysClass(runFn)
		local C = {}
		C.__index = C
		C.new = function() return setmetatable({}, C) end
		C.run = function(self, ...) return runFn(self, ...) end
		return C
	end

	t.describe("@rovy/datastore exports", function()
		t.it("exports registry and param helpers", function()
			t.expect(type(datastore.rovyData)).toBe("table")
			t.expect(datastore.DataStorePlugin).never.toBe(nil)
			t.expect(datastore.MockDocumentServiceAdapter).never.toBe(nil)
			t.expect(datastore.readerParamId("doc")).toBe("@rovy/datastore/reader:doc")
			t.expect(datastore.writerParamId("doc")).toBe("@rovy/datastore/writer:doc")
			t.expect(datastore.openerParamId("doc")).toBe("@rovy/datastore/opener:doc")
		end)

		t.it("registry stores generated document definitions", function()
			datastore.rovyData:__reset()
			local doc = datastore.rovyData:__document({
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
					autoOpen = true,
					autoClose = true,
					kickOnOpenFailure = true,
				},
				debug = {
					printLifecycle = false,
					printWrites = false,
				},
			})
			t.expect(doc.id).toBe("test/Profile")
			t.expect(#datastore.rovyData:documents()).toBe(1)
			t.expect(datastore.rovyData:eventCtor("opened", "test/Profile")).never.toBe(nil)
			datastore.rovyData:__reset()
		end)

		t.it("auto-installs handles; opener opens and writer emits changed", function()
			rovy:__reset()
			datastore.rovyData:__reset()
			local Update = {}
			local player = { UserId = 123 }
			local docId = "test/Profile"
			datastore.rovyData:__document({
				id = docId,
				kind = "player",
				name = "Profile",
				store = "PlayerData",
				key = function(owner)
					return tostring(owner.UserId)
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
					kickOnOpenFailure = false,
				},
				debug = {
					printLifecycle = false,
					printWrites = false,
				},
			})
			rovy:__schedule(Update, { runOnStart = false })
			local Open = sysClass(function(_, opener)
				opener:open(player)
			end)
			local Award = sysClass(function(_, writer)
				writer:update(player, function(data)
					return { coins = data.coins + 5 }
				end, { reason = "test-award" })
			end)
			local seen = {}
			local ReadChanged = sysClass(function(_, reader)
				reader:forEach(function(event)
					table.insert(seen, event.after.coins)
				end)
			end)
			rovy:__system(Open, {
				id = "test/Open",
				schedule = Update,
				params = { { kind = "external", id = datastore.openerParamId(docId) } },
			})
			rovy:__system(Award, {
				id = "test/Award",
				schedule = Update,
				after = { Open },
				params = { { kind = "external", id = datastore.writerParamId(docId) } },
			})
			rovy:__system(ReadChanged, {
				id = "test/ReadChanged",
				schedule = Update,
				after = { Award },
				params = { { kind = "eventReader", ctor = datastore.rovyData:eventCtor("changed", docId) } },
			})
			local app = App.new()
			app:start()
			app:runSchedule(Update)
			t.expect(#seen).toBe(0)
			app:runSchedule(Update)
			t.expect(seen[1]).toBe(5)
			datastore.rovyData:__reset()
		end)

		t.it("DataStorePlugin installs a runtime-only seeded mock backend", function()
			rovy:__reset()
			datastore.rovyData:__reset()
			local Update = {}
			local player = { UserId = 201 }
			local docId = "test/Profile"
			datastore.rovyData:__document({
				id = docId,
				kind = "player",
				name = "Profile",
				store = "PlayerData",
				key = function(owner)
					return tostring(owner.UserId)
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
					kickOnOpenFailure = false,
				},
				debug = {
					printLifecycle = false,
					printWrites = false,
				},
			})
			rovy:__schedule(Update, { runOnStart = false })
			local Open = sysClass(function(_, opener)
				opener:open(player, { reason = "mock-open" })
			end)
			local seen = {}
			local ReadOpened = sysClass(function(_, reader)
				reader:forEach(function(event)
					table.insert(seen, event.data.coins)
				end)
			end)
			rovy:__system(Open, {
				id = "test/MockOpen",
				schedule = Update,
				params = { { kind = "external", id = datastore.openerParamId(docId) } },
			})
			rovy:__system(ReadOpened, {
				id = "test/ReadOpened",
				schedule = Update,
				after = { Open },
				params = { { kind = "eventReader", ctor = datastore.rovyData:eventCtor("opened", docId) } },
			})
			local plugin = datastore.DataStorePlugin.new({
				mock = {
					data = {
						[docId] = {
							["201"] = { coins = 42 },
						},
					},
				},
			})
			local app = App.new()
			app:addPlugin(plugin)
			app:start()
			app:runSchedule(Update)
			app:runSchedule(Update)

			t.expect(plugin.runtime).never.toBe(nil)
			t.expect(seen[1]).toBe(42)
			datastore.rovyData:__reset()
		end)

		t.it("mock backend saves writes and returns them on reopen", function()
			local docId = "test/Profile"
			local def = {
				id = docId,
				kind = "player",
				name = "Profile",
				store = "PlayerData",
				key = function(owner)
					return tostring(owner.UserId)
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
					kickOnOpenFailure = false,
				},
				debug = {
					printLifecycle = false,
					printWrites = false,
				},
				publicToken = {
					id = docId,
					name = "Profile",
				},
			}
			local adapter = datastore.MockDocumentServiceAdapter.new({
				data = {
					[docId] = {
						["202"] = { coins = 13 },
					},
				},
			})
			local store = adapter:createStore(def)
			local document = adapter:getDocument(store, "202")

			local opened = adapter:open(document, { stealOnSessionLocked = true })
			t.expect(opened.success).toBe(true)
			t.expect(opened.data.coins).toBe(13)
			adapter:setCache(document, { coins = 99 })
			local saved = adapter:save(document)
			t.expect(saved.success).toBe(true)
			t.expect(saved.data.coins).toBe(99)
			t.expect(adapter:close(document, { save = true }).success).toBe(true)

			local reopened = adapter:open(document, { stealOnSessionLocked = true })
			t.expect(reopened.success).toBe(true)
			t.expect(reopened.data.coins).toBe(99)
			t.expect(adapter:getCache(document).coins).toBe(99)
		end)
	end)
end
