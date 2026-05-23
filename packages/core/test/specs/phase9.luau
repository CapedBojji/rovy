--!nocheck
-- Phase 9 exit: Trait<T> → one row per present implementer (2 impls → 2
-- rows); AllTraits<T> → one row/entity with array; HasTrait<T> filter;
-- trait monitor reconciles on impl gain/loss.

return function(TS, t)
	local rovy = (TS.loadPath("out/rovy") :: any).rovy
	local App = (TS.loadPath("out/runtime/app") :: any).App

	local function class(ctor)
		local C = {}
		C.__index = C
		C.new = function(...) return setmetatable(ctor(...) or {}, C) end
		return C
	end
	local function sysClass(runFn)
		local C = {}
		C.__index = C
		C.new = function() return setmetatable({}, C) end
		C.run = function(self, ...) return runFn(self, ...) end
		return C
	end
	local function monClass(h)
		local C = {}
		C.__index = C
		C.new = function() return setmetatable({}, C) end
		C.onEnter = function(self, ...) if h.onEnter then h.onEnter(...) end end
		C.onExit = function(self, ...) if h.onExit then h.onExit(...) end end
		return C
	end

	local Stunned = class(function() return { kind = "stun" } end)
	Stunned.blocksCasting = function()
		return true
	end
	local Rooted = class(function() return { kind = "root" } end)
	Rooted.blocksCasting = function()
		return false
	end
	local Health = class(function(v) return { v = v } end)
	local Update = {}
	local CC = "t/CrowdControl"

	local function regTraits()
		rovy:__component(Stunned, "t/Stunned")
		rovy:__component(Rooted, "t/Rooted")
		rovy:__component(Health, "t/Health")
		rovy:__traitImpl(CC, Stunned)
		rovy:__traitImpl(CC, Rooted)
		rovy:__schedule(Update, { runOnStart = false })
	end

	t.describe("Phase 9 — traits", function()
		t.it("Trait<T>: one row per present implementer", function()
			rovy:__reset()
			regTraits()
			rovy:__query({
				id = "qT",
				terms = { { t = "entity" }, { t = "trait", traitId = CC } },
				filters = {},
			})
			local rows = {}
			local Sys = sysClass(function(_, q)
				q:forEach(function(e, cc) table.insert(rows, cc.kind) end)
			end)
			rovy:__system(Sys, { id = "t/S", schedule = Update, params = { { kind = "query", handle = "qT" } } })
			local app = App.new()
			app:start()
			app.world:spawn(Stunned.new(), Rooted.new()) -- 2 impls → 2 rows
			app.world:spawn(Stunned.new()) -- 1 impl → 1 row
			app:runSchedule(Update)
			t.expect(#rows).toBe(3)
			local nStun, nRoot = 0, 0
			for _, k in rows do
				if k == "stun" then nStun += 1 elseif k == "root" then nRoot += 1 end
			end
			t.expect(nStun).toBe(2)
			t.expect(nRoot).toBe(1)
		end)

		t.it("Trait<T> rows preserve implementer methods, not raw jecs ids", function()
			rovy:__reset()
			regTraits()
			rovy:__query({
				id = "qTraitMethods",
				terms = { { t = "trait", traitId = CC } },
				filters = {},
			})
			local seen = {}
			local Sys = sysClass(function(_, q)
				q:forEach(function(cc)
					table.insert(seen, cc:blocksCasting())
				end)
			end)
			rovy:__system(Sys, {
				id = "t/TraitMethods",
				schedule = Update,
				params = { { kind = "query", handle = "qTraitMethods" } },
			})
			local app = App.new()
			app:start()
			app.world:spawn(Stunned.new(), Rooted.new())
			app:runSchedule(Update)

			table.sort(seen, function(a, b)
				return (a and 1 or 0) < (b and 1 or 0)
			end)
			t.expect(#seen).toBe(2)
			t.expect(seen[1]).toBe(false)
			t.expect(seen[2]).toBe(true)
		end)

		t.it("AllTraits<T>: one row per entity with array of impls", function()
			rovy:__reset()
			regTraits()
			rovy:__query({
				id = "qAll",
				terms = { { t = "entity" }, { t = "allTraits", traitId = CC } },
				filters = {},
			})
			local rows = {}
			local Sys = sysClass(function(_, q)
				q:forEach(function(e, arr) table.insert(rows, #arr) end)
			end)
			rovy:__system(Sys, { id = "t/SA", schedule = Update, params = { { kind = "query", handle = "qAll" } } })
			local app = App.new()
			app:start()
			app.world:spawn(Stunned.new(), Rooted.new())
			app.world:spawn(Stunned.new())
			app:runSchedule(Update)
			t.expect(#rows).toBe(2) -- one row per entity
			table.sort(rows)
			t.expect(rows[1]).toBe(1)
			t.expect(rows[2]).toBe(2)
		end)

		t.it("HasTrait<T> filter: entity must have Health AND ≥1 impl", function()
			rovy:__reset()
			regTraits()
			rovy:__query({
				id = "qHas",
				terms = { { t = "entity" }, { t = "component", ctor = Health } },
				filters = { hasTrait = { CC } },
			})
			local n = 0
			local Sys = sysClass(function(_, q)
				q:forEach(function() n += 1 end)
			end)
			rovy:__system(Sys, { id = "t/SH", schedule = Update, params = { { kind = "query", handle = "qHas" } } })
			local app = App.new()
			app:start()
			app.world:spawn(Health.new(1), Stunned.new()) -- match
			app.world:spawn(Health.new(2)) -- no impl → excluded
			app.world:spawn(Rooted.new()) -- no Health → excluded
			app:runSchedule(Update)
			t.expect(n).toBe(1)
		end)

		t.it("trait monitor reconciles on impl gain/loss", function()
			rovy:__reset()
			regTraits()
			rovy:__query({ id = "qM", terms = { { t = "entity" }, { t = "trait", traitId = CC } }, filters = {} })
			local enters, exits = 0, 0
			local Mon = monClass({ onEnter = function() enters += 1 end, onExit = function() exits += 1 end })
			rovy:__monitor(Mon, {
				match = "qM",
				methods = { "onEnter", "onExit" },
				params = { { kind = "entity" } },
			})
			local app = App.new()
			app:start()
			local e = app.world:spawn(Stunned.new())
			app:flush()
			t.expect(enters).toBe(1)
			app.world:remove(e, Stunned)
			app:flush()
			t.expect(exits).toBe(1)
		end)
	end)
end
