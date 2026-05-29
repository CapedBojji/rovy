--!nocheck

return function(TS, t)
	local pkg = TS.loadPath("out/init")
	local core = TS.import(nil, TS.getModule(nil, "@rovy", "core").out)
	local net = TS.import(nil, TS.getModule(nil, "@rovy", "networking").out)
	local App = core.App
	local rovy = core.rovy

	if _G.Vector2 == nil then
		local Vector2 = {}
		Vector2.__index = Vector2
		function Vector2.new(x, y)
			return setmetatable({ X = x or 0, Y = y or 0 }, Vector2)
		end
		_G.Vector2 = Vector2
	end

	if _G.Vector3 == nil then
		local Vector3 = {}
		Vector3.__index = Vector3
		function Vector3.new(x, y, z)
			return setmetatable({ X = x or 0, Y = y or 0, Z = z or 0 }, Vector3)
		end
		_G.Vector3 = Vector3
	end

	local function class()
		local C = {}
		C.__index = C
		C.new = function(...)
			return setmetatable({}, C)
		end
		return C
	end

	local function fakeNode(children, props)
		local node = props or {}
		node.children = children or {}
		node.FindFirstChild = function(self, name)
			return self.children[name]
		end
		return node
	end

	t.describe("@rovy/world-inspector helpers", function()
		t.it("resolves duplicate component names with path context", function()
			local A = class()
			local B = class()
			local choices = pkg.buildComponentChoices({
				{ ctor = A, id = "server/Health" },
				{ ctor = B, id = "client/Health" },
			})
			t.expect(choices[1].label).toBe("server/Health")
			t.expect(choices[2].label).toBe("client/Health")
		end)

		t.it("parses include and exclude query terms", function()
			local parsed = pkg.parseWorldInspectorQuery("Health !Dead Position")
			t.expect(parsed.include[1]).toBe("health")
			t.expect(parsed.include[2]).toBe("position")
			t.expect(parsed.exclude[1]).toBe("dead")
		end)

		t.it("matches numeric query terms against entity ids", function()
			local components = {
				{ componentName = "Health", componentId = "server/Health" },
			}
			t.expect(pkg.matchesWorldInspectorQuery(components, "42", 42)).toBe(true)
			t.expect(pkg.matchesWorldInspectorQuery(components, "42", 41)).toBe(false)
			t.expect(pkg.matchesWorldInspectorQuery(components, "!42", 41)).toBe(true)
			t.expect(pkg.matchesWorldInspectorQuery(components, "!42", 42)).toBe(false)
		end)

		local function childByKey(node, key)
			for _, child in node.children do
				if child.key == key then
					return child
				end
			end
			return nil
		end

		t.it("builds bounded value trees with table previews", function()
			local tree = pkg.buildValueTree({ a = 1, b = "two" })
			t.expect(tree.preview).toBe("{2 keys}")
			t.expect(#tree.children).toBe(2)
			local a = childByKey(tree, "a")
			t.expect(a.typeLabel).toBe("number")
			t.expect(a.preview).toBe("1")
			t.expect(a.path[1]).toBe("a")
		end)

		t.it("caps value tree depth", function()
			local tree = pkg.buildValueTree({ nested = { deeper = { leaf = 1 } } }, { maxDepth = 1 })
			local nested = childByKey(tree, "nested")
			t.expect(nested.truncated).toBe(true)
			t.expect(nested.children).toBeUndefined()
		end)

		t.it("caps value tree child count", function()
			local tree = pkg.buildValueTree({ a = 1, b = 2, c = 3, d = 4 }, { maxChildren = 2 })
			t.expect(#tree.children).toBe(2)
			t.expect(tree.truncated).toBe(true)
		end)

		t.it("marks cyclic references without recursing forever", function()
			local node = {}
			node.self = node
			local tree = pkg.buildValueTree(node)
			local selfChild = childByKey(tree, "self")
			t.expect(selfChild.cycle).toBe(true)
		end)

		t.it("resolves service, child path, and final property expressions", function()
			local rootPart = fakeNode()
			local zombie = fakeNode({ HumanoidRootPart = rootPart }, { PrimaryPart = rootPart })
			local workspace = fakeNode({ Zombie = zombie })
			local root = {
				getService = function(_, name)
					if name == "Workspace" then
						return workspace
					end
				end,
			}

			t.expect(pkg.resolveInstanceExpression("workspace/Zombie", root).value).toBe(zombie)
			t.expect(pkg.resolveInstanceExpression("Workspace/Zombie/HumanoidRootPart", root).value).toBe(rootPart)
			t.expect(pkg.resolveInstanceExpression("Workspace/Zombie.PrimaryPart", root).value).toBe(rootPart)
			t.expect(pkg.resolveInstanceExpression("Missing/Zombie", root).ok).toBe(false)
			t.expect(pkg.resolveInstanceExpression("Workspace/Ghost", root).ok).toBe(false)
		end)
	end)

	t.describe("@rovy/world-inspector plugin", function()
		t.it("can be added to App and mutates state from show/hide/toggle events", function()
			rovy:__reset()
			local plugin = pkg.WorldInspectorPlugin.new()
			local app = App.new()
			app:addPlugin(plugin)
			app:start()

			local state = app.world:resource(pkg.WorldInspectorState)
			t.expect(state.visible).toBe(false)
			app.commands:trigger(pkg.ShowWorldInspector.new())
			app:flush()
			t.expect(state.visible).toBe(true)
			t.expect(state.windowOpen).toBe(true)

			state.query = "Health"
			state.drafts.x = 1
			app.commands:trigger(pkg.HideWorldInspector.new())
			app:flush()
			t.expect(state.visible).toBe(false)
			t.expect(state.query).toBe("Health")
			t.expect(state.drafts.x).toBe(1)

			app.world:trigger(pkg.ToggleWorldInspector.new())
			t.expect(state.visible).toBe(true)
		end)

		t.it("close clears window-local state", function()
			local state = pkg.WorldInspectorState.new()
			state:show()
			state.query = "Health"
			state.drafts.field = "draft"
			state:closeWindow()
			t.expect(state.visible).toBe(false)
			t.expect(state.windowOpen).toBe(false)
			t.expect(state.query).toBe("")
			t.expect(next(state.drafts)).toBeUndefined()
		end)
	end)

	t.describe("@rovy/world-inspector targets", function()
		t.it("local adapter lists and mutates through world APIs", function()
			rovy:__reset()
			local Position = class()
			function Position.new(x)
				return setmetatable({ x = x }, Position)
			end
			rovy:__component(Position, "client/Position", {
				editor = {
					fields = {
						{ key = "x", typeLabel = "number", validator = function(value)
							return type(value) == "number"
						end },
					},
					constructorValidator = function(values)
						return type(values[1]) == "number"
					end,
				},
			})
			local app = App.new()
			app:start()
			local entity = app.world:spawn()
			local target = pkg.LocalWorldInspectorTarget.new(app.world)

			local spawnResult = target:apply({ kind = "spawn" })
			t.expect(spawnResult.ok).toBe(true)
			t.expect(type(spawnResult.entityId)).toBe("number")
			target:apply({ kind = "despawn", entityId = spawnResult.entityId })

			local result = target:apply({
				kind = "insert",
				entityId = entity,
				componentId = "client/Position",
				fields = {
					{ key = "x", typeLabel = "number", valueText = "5" },
				},
			})
			t.expect(result.ok).toBe(true)
			t.expect(app.world:get(entity, Position).x).toBe(5)
			t.expect(#target:listEntities()).toBe(1)
			t.expect(target:listComponents(entity)[1].componentId).toBe("client/Position")
		end)

		t.it("local adapter lists and mutates inspected resources", function()
			rovy:__reset()
			local Runtime = class()
			function Runtime.new()
				return setmetatable({ score = 1, nested = { wave = 2 } }, Runtime)
			end
			rovy:__resource(Runtime, "client/Runtime", {
				inspect = {
					fields = {
						{ key = "score", typeLabel = "number", validator = function(value)
							return type(value) == "number"
						end },
						{ key = "nested", typeLabel = "table", validator = function()
							return true
						end },
					},
				},
			})

			local app = App.new()
			app:start()
			local target = pkg.LocalWorldInspectorTarget.new(app.world)
			local resources = target:listResources()
			t.expect(#resources).toBe(1)
			t.expect(resources[1].resourceId).toBe("client/Runtime")
			t.expect(resources[1].fields[1].valueText).toBe("1")
			t.expect(resources[1].fields[2].key).toBe("nested")
			t.expect(resources[1].fields[3].key).toBe("wave")

			local result = target:apply({
				kind = "setResource",
				resourceId = "client/Runtime",
				path = { "score" },
				field = { key = "score", typeLabel = "number", valueText = "7" },
			})
			t.expect(result.ok).toBe(true)
			t.expect(app.world:resource(Runtime).score).toBe(7)
		end)

		t.it("parses Vector3 field text before applying edits", function()
			rovy:__reset()
			local Position = class()
			function Position.new(value)
				return setmetatable({ value = value }, Position)
			end
			rovy:__component(Position, "client/Position", {
				editor = {
					fields = {
						{ key = "value", typeLabel = "Vector3", validator = function(value)
							return type(value) == "table" and value.X ~= nil and value.Y ~= nil and value.Z ~= nil
						end },
					},
					constructorValidator = function(values)
						local value = values[1]
						return type(value) == "table" and value.X ~= nil and value.Y ~= nil and value.Z ~= nil
					end,
				},
			})
			local app = App.new()
			app:start()
			local entity = app.world:spawn()
			local target = pkg.LocalWorldInspectorTarget.new(app.world)

			local result = target:apply({
				kind = "set",
				entityId = entity,
				componentId = "client/Position",
				fields = {
					{ key = "value", typeLabel = "Vector3", valueText = "Vector3(0, 0, 0)" },
				},
			})
			t.expect(result.ok).toBe(true)
			local value = app.world:get(entity, Position).value
			t.expect(value.X).toBe(0)
			t.expect(value.Y).toBe(0)
			t.expect(value.Z).toBe(0)
		end)

		t.it("parses Vector2 field text before applying edits", function()
			rovy:__reset()
			local Offset = class()
			function Offset.new(value)
				return setmetatable({ value = value }, Offset)
			end
			rovy:__component(Offset, "client/Offset", {
				editor = {
					fields = {
						{ key = "value", typeLabel = "Vector2", validator = function(value)
							return type(value) == "table" and value.X ~= nil and value.Y ~= nil
						end },
					},
					constructorValidator = function(values)
						local value = values[1]
						return type(value) == "table" and value.X ~= nil and value.Y ~= nil
					end,
				},
			})
			local app = App.new()
			app:start()
			local entity = app.world:spawn()
			local target = pkg.LocalWorldInspectorTarget.new(app.world)

			local result = target:apply({
				kind = "set",
				entityId = entity,
				componentId = "client/Offset",
				fields = {
					{ key = "value", typeLabel = "Vector2", valueText = "12, 34" },
				},
			})
			t.expect(result.ok).toBe(true)
			local value = app.world:get(entity, Offset).value
			t.expect(value.X).toBe(12)
			t.expect(value.Y).toBe(34)
		end)

		t.it("maps instance field text through resolveInstanceExpression", function()
			rovy:__reset()
			local rootPart = fakeNode()
			local zombie = fakeNode({ HumanoidRootPart = rootPart })
			local workspace = fakeNode({ Zombie = zombie })
			_G.game = {
				GetService = function(a, b)
					local name = type(b) == "string" and b or a
					if name == "Workspace" then
						return workspace
					end
				end,
			}

			local Ref = class()
			function Ref.new(rootPartValue)
				return setmetatable({ rootPart = rootPartValue }, Ref)
			end
			rovy:__component(Ref, "client/Ref", {
				editor = {
					fields = {
						{ key = "rootPart", typeLabel = "BasePart", validator = function(value)
							return value == rootPart
						end },
					},
					constructorValidator = function(values)
						return values[1] == rootPart
					end,
				},
			})
			local app = App.new()
			app:start()
			local entity = app.world:spawn()
			local target = pkg.LocalWorldInspectorTarget.new(app.world)

			local result = target:apply({
				kind = "set",
				entityId = entity,
				componentId = "client/Ref",
				fields = {
					{ key = "rootPart", typeLabel = "BasePart", valueText = "Workspace/Zombie/HumanoidRootPart" },
				},
			})
			t.expect(result.ok).toBe(true)
			t.expect(app.world:get(entity, Ref).rootPart).toBe(rootPart)
		end)

		t.it("server-gated target list travels over Rovy networking", function()
			rovy:__reset()
			net.rovyNet:__reset()
			local Update = {}
			rovy:__schedule(Update, { runOnStart = false })

			local requester = { UserId = 10, Name = "Requester", DisplayName = "Requester" }
			local clientTransport = net.LoopbackTransport.new(requester)
			local serverTransport = net.LoopbackTransport.new()
			net.connectLoopback(clientTransport, serverTransport)

			local serverApp = App.new()
			serverApp:addPlugin(pkg.WorldInspectorServerPlugin.new({
				schedule = Update,
				transport = serverTransport,
				networkTransport = serverTransport,
				networkBoundary = "server",
				access = function(ctx)
					return ctx.action == "view" and ctx.targetKind == "server"
				end,
			}))
			serverApp:start()

			local clientApp = App.new()
			clientApp:addPlugin(pkg.WorldInspectorPlugin.new({
				networkSchedule = Update,
				networkTransport = clientTransport,
				networkBoundary = "client",
			}))
			clientApp:start()

			local state = clientApp.world:resource(pkg.WorldInspectorState)
			state:show()
			clientApp:runSchedule(Update)
			t.expect(#clientTransport.sent).toBe(1)
			serverApp:runSchedule(Update)
			t.expect(#serverTransport.sent).toBe(1)
			clientApp:runSchedule(Update)

			t.expect(#state.remoteTargets).toBe(1)
			t.expect(state.remoteTargets[1].key).toBe("server")
		end)

			t.it("server snapshot and edit requests are permission-gated", function()
				rovy:__reset()
				net.rovyNet:__reset()
				local Update = {}
			rovy:__schedule(Update, { runOnStart = false })

			local Position = class()
			function Position.new(x)
				return setmetatable({ x = x }, Position)
			end
			local Runtime = class()
			function Runtime.new()
				return setmetatable({ score = 3 }, Runtime)
			end
			rovy:__component(Position, "server/Position", {
				editor = {
					fields = {
						{ key = "x", typeLabel = "number", validator = function(value)
							return type(value) == "number"
						end },
					},
					constructorValidator = function(values)
						return type(values[1]) == "number"
					end,
				},
			})
			rovy:__resource(Runtime, "server/Runtime", {
				inspect = {
					fields = {
						{ key = "score", typeLabel = "number", validator = function(value)
							return type(value) == "number"
						end },
					},
				},
			})

			local requester = { UserId = 11, Name = "Requester", DisplayName = "Requester" }
			local clientTransport = net.LoopbackTransport.new(requester)
			local serverTransport = net.LoopbackTransport.new()
			net.connectLoopback(clientTransport, serverTransport)

			local serverApp = App.new()
			serverApp:addPlugin(pkg.WorldInspectorServerPlugin.new({
				schedule = Update,
				networkTransport = serverTransport,
				networkBoundary = "server",
				access = function(ctx)
					return ctx.targetKind == "server"
				end,
			}))
			serverApp:start()
			local entity = serverApp.world:spawn(Position.new(1))

			local clientApp = App.new()
			clientApp:addPlugin(pkg.WorldInspectorPlugin.new({
				networkSchedule = Update,
				networkTransport = clientTransport,
				networkBoundary = "client",
			}))
			clientApp:start()
			local state = clientApp.world:resource(pkg.WorldInspectorState)

			state:queueSnapshot("server")
			clientApp:runSchedule(Update)
			serverApp:runSchedule(Update)
			clientApp:runSchedule(Update)
			t.expect(state.snapshots.server.entities[1].components[1].componentId).toBe("server/Position")
			t.expect(state.snapshots.server.resources[1].resourceId).toBe("server/Runtime")

			state:queueEdit("server", {
				kind = "set",
				entityId = entity,
				componentId = "server/Position",
				fields = {
					{ key = "x", typeLabel = "number", valueText = "9" },
				},
			})
			clientApp:runSchedule(Update)
			serverApp:runSchedule(Update)
			clientApp:runSchedule(Update)
			t.expect(serverApp.world:get(entity, Position).x).toBe(9)
			t.expect(state.snapshots.server.entities[1].components[1].fields[1].valueText).toBe("9")

			state:queueEdit("server", {
				kind = "setResource",
				resourceId = "server/Runtime",
				path = { "score" },
				field = { key = "score", typeLabel = "number", valueText = "12" },
			})
			clientApp:runSchedule(Update)
			serverApp:runSchedule(Update)
			clientApp:runSchedule(Update)
				t.expect(serverApp.world:resource(Runtime).score).toBe(12)
				t.expect(state.snapshots.server.resources[1].fields[1].valueText).toBe("12")
			end)

			t.it("server recording streams selected-target frames to the requester", function()
				rovy:__reset()
				net.rovyNet:__reset()
				local Update = {}
				rovy:__schedule(Update, { runOnStart = false })

				local Position = class()
				function Position.new(x)
					return setmetatable({ x = x }, Position)
				end
				rovy:__component(Position, "server/Position")

				local requester = { UserId = 12, Name = "Requester", DisplayName = "Requester" }
				local clientTransport = net.LoopbackTransport.new(requester)
				local serverTransport = net.LoopbackTransport.new()
				net.connectLoopback(clientTransport, serverTransport)

				local serverApp = App.new()
				serverApp:addPlugin(pkg.WorldInspectorServerPlugin.new({
					schedule = Update,
					networkTransport = serverTransport,
					networkBoundary = "server",
					access = function(ctx)
						return ctx.action == "view" and ctx.targetKind == "server"
					end,
				}))
				serverApp:start()

				local clientApp = App.new()
				clientApp:addPlugin(pkg.WorldInspectorPlugin.new({
					networkSchedule = Update,
					networkTransport = clientTransport,
					networkBoundary = "client",
				}))
				clientApp:start()
				local recorder = clientApp.world:resource(pkg.WorldInspectorRecorderState)

				recorder:queueStart("server")
				clientApp:runSchedule(Update)
				serverApp:runSchedule(Update)
				clientApp:runSchedule(Update)
				t.expect(recorder.phase).toBe("recording")

				local clientEntity = clientApp.world:spawn()
				clientApp.world:insert(clientEntity, Position.new(99))
				local serverEntity = serverApp.world:spawn()
				serverApp.world:insert(serverEntity, Position.new(2))
				serverApp:runSchedule(Update)
				clientApp:runSchedule(Update)

				local latest = recorder:getFrameAt(recorder.count - 1)
				t.expect(latest.componentChanges).toBe(1)
				t.expect(latest.entries[2].target.componentId).toBe("server/Position")
				local xValue
				for _, child in latest.entries[2].newTree.children do
					if child.key == "x" then
						xValue = child.preview
					end
				end
				t.expect(xValue).toBe("2")
			end)

			t.it("player recording relays target-client frames through the server", function()
				rovy:__reset()
				net.rovyNet:__reset()
				local Update = {}
				rovy:__schedule(Update, { runOnStart = false })

				local Position = class()
				function Position.new(x)
					return setmetatable({ x = x }, Position)
				end
				rovy:__component(Position, "client/Position")

				local requester = { UserId = 21, Name = "Requester", DisplayName = "Requester" }
				local previousGame = _G.game
				_G.game = {
					GetService = function(a, b)
						local name = type(b) == "string" and b or a
						if name == "Players" then
							return {
								GetPlayers = function()
									return { requester }
								end,
							}
						end
					end,
				}

				local clientTransport = net.LoopbackTransport.new(requester)
				local serverTransport = net.LoopbackTransport.new()
				net.connectLoopback(clientTransport, serverTransport)

				local serverApp = App.new()
				serverApp:addPlugin(pkg.WorldInspectorServerPlugin.new({
					schedule = Update,
					networkTransport = serverTransport,
					networkBoundary = "server",
					access = function(ctx)
						return ctx.action == "view" and ctx.targetKind == "player"
					end,
				}))
				serverApp:start()

				local clientApp = App.new()
				clientApp:addPlugin(pkg.WorldInspectorPlugin.new({
					networkSchedule = Update,
					networkTransport = clientTransport,
					networkBoundary = "client",
				}))
				clientApp:start()
				local recorder = clientApp.world:resource(pkg.WorldInspectorRecorderState)

				recorder:queueStart("player:21")
				clientApp:runSchedule(Update)
				serverApp:runSchedule(Update)
				clientApp:runSchedule(Update)
				serverApp:runSchedule(Update)
				clientApp:runSchedule(Update)
				_G.game = previousGame
				t.expect(recorder.phase).toBe("recording")

				local entity = clientApp.world:spawn()
				clientApp.world:insert(entity, Position.new(8))
				clientApp:runSchedule(Update)
				serverApp:runSchedule(Update)
				clientApp:runSchedule(Update)

				local latest = recorder:getFrameAt(recorder.count - 1)
				t.expect(latest.componentChanges).toBe(1)
				t.expect(latest.entries[2].target.componentId).toBe("client/Position")
				local xValue
				for _, child in latest.entries[2].newTree.children do
					if child.key == "x" then
						xValue = child.preview
					end
				end
				t.expect(xValue).toBe("8")
			end)

			t.it("recording controls respect view access", function()
				rovy:__reset()
				net.rovyNet:__reset()
				local Update = {}
				rovy:__schedule(Update, { runOnStart = false })

				local requester = { UserId = 13, Name = "Requester", DisplayName = "Requester" }
				local clientTransport = net.LoopbackTransport.new(requester)
				local serverTransport = net.LoopbackTransport.new()
				net.connectLoopback(clientTransport, serverTransport)

				local serverApp = App.new()
				serverApp:addPlugin(pkg.WorldInspectorServerPlugin.new({
					schedule = Update,
					networkTransport = serverTransport,
					networkBoundary = "server",
					access = function()
						return false
					end,
				}))
				serverApp:start()

				local clientApp = App.new()
				clientApp:addPlugin(pkg.WorldInspectorPlugin.new({
					networkSchedule = Update,
					networkTransport = clientTransport,
					networkBoundary = "client",
				}))
				clientApp:start()
				local recorder = clientApp.world:resource(pkg.WorldInspectorRecorderState)

				recorder:queueStart("server")
				clientApp:runSchedule(Update)
				serverApp:runSchedule(Update)
				clientApp:runSchedule(Update)

				t.expect(recorder.phase).toBe("stopped")
				t.expect(recorder.statusMessage).toBe("access denied")
				t.expect(recorder.count).toBe(0)
			end)
		end)

	t.describe("@rovy/world-inspector recorder", function()
		local function findEntry(entries, kind, targetKind)
			for _, entry in entries do
				if entry.kind == kind and entry.target.kind == targetKind then
					return entry
				end
			end
			return nil
		end

		t.it("records component add/change/remove with old values from shadow", function()
			rovy:__reset()
			local Health = class()
			function Health.new(hp)
				return setmetatable({ hp = hp }, Health)
			end
			rovy:__component(Health, "t/Health")

			local recorder = pkg.WorldInspectorRecorderState.new()
			local app = App.new()
			pkg.registerRecorderListeners(app, recorder)
			app:start()

			recorder.phase = "recording"
			local e = app.world:spawn()
			app.world:insert(e, Health.new(10))
			app.world:insert(e, Health.new(7))
			app.world:remove(e, Health)

			local system = pkg.WorldInspectorFrameRecorderSystem.new()
			system:run(app.world, recorder, { frame = 1 })

			t.expect(recorder.count).toBe(1)
			local record = recorder:getFrameAt(0)
			t.expect(record.entityChanges).toBe(1)
			t.expect(record.componentChanges).toBe(3)

			local added = findEntry(record.entries, "add", "component")
			t.expect(added.newTree.preview).toBe("{1 key}")
			t.expect(added.oldTree).toBeUndefined()

			local changed = findEntry(record.entries, "change", "component")
			-- old value sourced from incremental shadow (the add's value)
			local oldHp
			for _, child in changed.oldTree.children do
				if child.key == "hp" then
					oldHp = child.preview
				end
			end
			t.expect(oldHp).toBe("10")

			local removed = findEntry(record.entries, "remove", "component")
			t.expect(removed.oldTree).never.toBeUndefined()
		end)

		t.it("drains pending entries once per render tick", function()
			rovy:__reset()
			local Tag = class()
			rovy:__component(Tag, "t/Tag")

			local recorder = pkg.WorldInspectorRecorderState.new()
			local app = App.new()
			pkg.registerRecorderListeners(app, recorder)
			app:start()
			recorder.phase = "recording"

			local system = pkg.WorldInspectorFrameRecorderSystem.new()

			app.world:spawn(Tag.new())
			system:run(app.world, recorder, { frame = 1 })
			-- second tick with no activity yields an empty frame and no leftover pending
			system:run(app.world, recorder, { frame = 2 })

			t.expect(recorder.count).toBe(2)
			t.expect(#recorder.pending).toBe(0)
			t.expect(recorder:getFrameAt(0).entityChanges).toBe(1)
			t.expect(recorder:getFrameAt(1).entityChanges).toBe(0)
		end)

		t.it("records relation add/change/remove with old values from shadow", function()
			rovy:__reset()
			local Marker = class()
			rovy:__component(Marker, "t/Marker")
			local Link = class()
			function Link.new(value)
				return setmetatable({ value = value }, Link)
			end
			rovy:__relation(Link, { exclusive = false, onTargetDelete = "none", onDelete = "none" })

			local recorder = pkg.WorldInspectorRecorderState.new()
			local app = App.new()
			pkg.registerRecorderListeners(app, recorder)
			app:start()
			recorder.phase = "recording"

			local source = app.world:spawn()
			local target = app.world:spawn()
			app.world:relate(source, Link, target, Link.new("a"))
			app.world:relate(source, Link, target, Link.new("b"))
			app.world:unrelate(source, Link, target)

			local system = pkg.WorldInspectorFrameRecorderSystem.new()
			system:run(app.world, recorder, { frame = 1 })

			local record = recorder:getFrameAt(0)
			t.expect(record.relationChanges).toBe(3)

			local changed = findEntry(record.entries, "change", "relation")
			local oldValue
			for _, child in changed.oldTree.children do
				if child.key == "value" then
					oldValue = child.preview
				end
			end
			t.expect(oldValue).toBe("a")

			local removed = findEntry(record.entries, "remove", "relation")
			t.expect(removed.oldTree).never.toBeUndefined()
		end)

		t.it("ignores lifecycle events while not recording", function()
			rovy:__reset()
			local Tag = class()
			rovy:__component(Tag, "t/Tag")

			local recorder = pkg.WorldInspectorRecorderState.new()
			local app = App.new()
			pkg.registerRecorderListeners(app, recorder)
			app:start()

			app.world:spawn(Tag.new())
			t.expect(#recorder.pending).toBe(0)
		end)
	end)

	t.describe("@rovy/world-inspector table explorer", function()
		local function byKey(rows, key)
			for _, node in rows do
				if node.key == key then
					return node
				end
			end
			return nil
		end

		t.it("navigates value tree rows by path", function()
			local rows = pkg.buildValueTreeRows({ outer = { inner = { leaf = 5 } } })
			local atOuter = pkg.valueTreeRowsAtPath(rows, { "outer" })
			t.expect(#atOuter).toBe(1)
			t.expect(atOuter[1].key).toBe("inner")

			local atInner = pkg.valueTreeRowsAtPath(rows, { "outer", "inner" })
			t.expect(byKey(atInner, "leaf").preview).toBe("5")

			t.expect(#pkg.valueTreeRowsAtPath(rows, { "missing" })).toBe(0)
		end)

		t.it("flags expandable table nodes only", function()
			local rows = pkg.buildValueTreeRows({ tbl = { a = 1 }, num = 3 })
			t.expect(pkg.isExpandable(byKey(rows, "tbl"))).toBe(true)
			t.expect(pkg.isExpandable(byKey(rows, "num"))).toBe(false)
		end)

		t.it("opens, repaths, and closes explorers in state", function()
			local state = pkg.WorldInspectorState.new()
			state:openTableExplorer("res:x", "X", { kind = "resource", resourceId = "x" }, {})
			t.expect(state.tableExplorers["res:x"].title).toBe("X")

			-- reopening an existing key repaths instead of replacing
			state:openTableExplorer("res:x", "X", { kind = "resource", resourceId = "x" }, { "a" })
			t.expect(state.tableExplorers["res:x"].path[1]).toBe("a")

			state:closeTableExplorer("res:x")
			t.expect(state.tableExplorers["res:x"]).toBeUndefined()
		end)
	end)
end
