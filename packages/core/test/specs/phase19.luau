--!nocheck
-- Phase 19 — world inspection APIs.

return function(TS, t)
	local rovy = (TS.loadPath("out/rovy") :: any).rovy
	local App = (TS.loadPath("out/runtime/app") :: any).App

	local function class(init)
		local C = {}
		C.__index = C
		C.new = function(...)
			local self = setmetatable({}, C)
			if init then
				init(self, ...)
			end
			return self
		end
		return C
	end

	t.describe("Phase 19 — World inspection", function()
		t.it("lists tracked spawned entities and drops despawned ids", function()
			rovy:__reset()
			local Position = class(function(self, x)
				self.x = x
			end)
			rovy:__component(Position, "client/Position")

			local app = App.new()
			app:start()
			local a = app.world:spawn(Position.new(1))
			local b = app.world:spawn()

			local entities = app.world:inspectEntities()
			t.expect(#entities).toBe(2)
			t.expect(table.find(entities, a) ~= nil).toBeTruthy()
			t.expect(table.find(entities, b) ~= nil).toBeTruthy()

			app.world:despawn(a)
			entities = app.world:inspectEntities()
			t.expect(#entities).toBe(1)
			t.expect(entities[1]).toBe(b)
		end)

		t.it("returns registered component metadata", function()
			rovy:__reset()
			local Health = class(function(self, value)
				self.value = value
			end)
			local editor = {
				fields = {
					{ key = "value", typeLabel = "number", validator = function(v)
						return type(v) == "number"
					end },
				},
				constructorValidator = function(values)
					return type(values[1]) == "number"
				end,
			}
			rovy:__component(Health, "server/Health", { editor = editor })

			local app = App.new()
			app:start()
			local regs = app.world:inspectRegisteredComponents()
			t.expect(#regs).toBe(1)
			t.expect(regs[1].ctor).toBe(Health)
			t.expect(regs[1].id).toBe("server/Health")
			t.expect(regs[1].editor).toBe(editor)
		end)

		t.it("returns entity component values, tags, ids, names, and editor metadata", function()
			rovy:__reset()
			local Health = class(function(self, value)
				self.value = value
			end)
			local Dead = class()
			local editor = {
				fields = {
					{ key = "value", typeLabel = "number", validator = function()
						return true
					end },
				},
				constructorValidator = function()
					return true
				end,
			}
			rovy:__component(Health, "server/Health", { editor = editor })
			rovy:__component(Dead, "client/Dead")

			local app = App.new()
			app:start()
			local health = Health.new(42)
			local entity = app.world:spawn(health, Dead)
			local comps = app.world:inspectEntityComponents(entity)

			local byName = {}
			for _, component in comps do
				byName[component.name] = component
			end

			t.expect(byName.Health.id).toBe("server/Health")
			t.expect(byName.Health.value).toBe(health)
			t.expect(byName.Health.tag).toBe(false)
			t.expect(byName.Health.editor).toBe(editor)
			t.expect(byName.Dead.id).toBe("client/Dead")
			t.expect(byName.Dead.tag).toBe(true)
		end)
	end)
end
