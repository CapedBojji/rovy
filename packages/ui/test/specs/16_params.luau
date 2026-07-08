--!nocheck
-- Param injection into render(): World/Res/Commands/Query are resolved fresh on
-- every render, while Local<T> slots persist across re-renders (per node) and
-- are isolated between separate mounts.

local Helpers = require("../harness/helpers")

return function(TS, t)
	local H = Helpers.load(TS)

	t.describe("param injection", function()
		t.it("injects World, Res and a Query in declared order", function()
			H.reset()
			local Theme = H.class(function(v) return { value = v or 3 } end)
			H.rovy:__resource(Theme, "test/Theme")
			local Health = H.class(function(v) return { value = v or 1 } end)
			H.rovy:__component(Health, "test/Health")
			H.rovy:__query({
				id = "q#p",
				terms = { { t = "entity" }, { t = "component", ctor = Health } },
				filters = {},
			})
			local seen = {}
			local Comp = H.uiClass("test/Inject", function(self, world, theme, q)
				seen.world = world
				seen.theme = theme
				seen.size = q:size()
				return H.textLabel({ Name = "x" })
			end, {
				params = {
					{ kind = "world" },
					{ kind = "res", ctor = Theme },
					{ kind = "query", handle = "q#p" },
				},
			})
			local app = H.startedApp()
			app.world:spawn(Health.new(1))
			H.mountUi(app, Comp, { target = H.target() })

			t.expect(seen.world).toBeDefined()
			t.expect(seen.theme.value).toBe(3)
			t.expect(seen.size).toBe(1)
		end)

		t.it("Local<T> persists across re-renders of the same node", function()
			H.reset()
			local Bump = H.rerenderResource()
			local Comp = H.uiClass("test/LocalView", function(self, store)
				store.count += 1
				return H.textLabel({ Name = "Status", Text = "count=" .. tostring(store.count) })
			end, {
				params = { { kind = "local", index = 0, init = function() return { count = 0 } end } },
				triggers = { H.resourceTrigger(Bump) },
			})
			local app = H.startedApp()
			local target = H.target()
			H.mountUi(app, Comp, { target = target })
			t.expect(target:FindFirstChild("Status").Text).toBe("count=1")

			H.bump(app)
			t.expect(target:FindFirstChild("Status").Text).toBe("count=2")
			H.bump(app)
			t.expect(target:FindFirstChild("Status").Text).toBe("count=3")
		end)

		t.it("Local<T> slots are isolated between separate mounts", function()
			H.reset()
			local Comp = H.uiClass("test/LocalIso", function(self, store)
				store.count += 1
				return H.textLabel({ Name = "Status", Text = "count=" .. tostring(store.count) })
			end, {
				params = { { kind = "local", index = 0, init = function() return { count = 0 } end } },
			})
			local app = H.startedApp()
			local t1 = H.target()
			local t2 = H.target()
			H.mountUi(app, Comp, { target = t1 })
			H.mountUi(app, Comp, { target = t2 })
			t.expect(t1:FindFirstChild("Status").Text).toBe("count=1")
			t.expect(t2:FindFirstChild("Status").Text).toBe("count=1") -- fresh slot, not shared
		end)

		t.it("injects Commands usable to mutate the world", function()
			H.reset()
			local captured = {}
			local Comp = H.uiClass("test/Cmd", function(self, commands)
				captured.commands = commands
				return H.textLabel({ Name = "x" })
			end, {
				params = { { kind = "commands" } },
			})
			local app = H.startedApp()
			H.mountUi(app, Comp, { target = H.target() })
			t.expect(captured.commands).toBeDefined()
			t.expect(typeof(captured.commands.spawn)).toBe("function")
		end)
	end)
end
