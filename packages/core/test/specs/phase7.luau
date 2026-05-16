--!nocheck
-- Phase 7 exit: Changed<C> only rows changed since consumer last ran;
-- Added ≠ Changed; Removed<C> drains once; first run yields all
-- (lastRunTick=-1). Deferred writes are flushed at the producer set's
-- boundary, so a consumer in a later set sees them the same run.

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

	local Update = {}
	local ProdSet = {}
	local ConsSet = {}
	local Health = class(function(v) return { v = v } end)

	t.describe("Phase 7 — change detection", function()
		t.it("Changed: first run yields all; quiet runs yield none; set yields again", function()
			rovy:__reset()
			rovy:__component(Health, "t/Health")
			rovy:__schedule(Update, { runOnStart = false })
			rovy:__query({
				id = "qch",
				terms = { { t = "entity" }, { t = "component", ctor = Health } },
				filters = { changed = { Health } },
			})
			local seen = {}
			local round = 0
			local Bump = sysClass(function(_, commands, e)
				if round == 3 then
					commands:set(e.id, Health, Health.new(99))
				end
			end)
			local Watch = sysClass(function(_, q)
				local n = 0
				q:forEach(function() n += 1 end)
				seen[round] = n
			end)
			-- shared entity holder
			local holder = {}
			Bump = sysClass(function(_, commands)
				if round == 3 then commands:set(holder.e, Health, Health.new(99)) end
			end)
			rovy:__system(Bump, {
				id = "t/Bump", schedule = Update, set = ProdSet,
				params = { { kind = "commands" } },
			})
			rovy:__system(Watch, {
				id = "t/Watch", schedule = Update, set = ConsSet,
				params = { { kind = "query", handle = "qch" } },
			})

			local app = App.new()
			app:configureSets(Update, { ProdSet, ConsSet })
			app:start()
			holder.e = app.world:spawn(Health.new(1))

			round = 1
			app:runSchedule(Update)
			t.expect(seen[1]).toBe(1) -- first run: lastRunTick=-1 → added counts

			round = 2
			app:runSchedule(Update)
			t.expect(seen[2]).toBe(0) -- nothing changed since

			round = 3
			app:runSchedule(Update)
			t.expect(seen[3]).toBe(1) -- Bump set Health in ProdSet, flushed before ConsSet

			round = 4
			app:runSchedule(Update)
			t.expect(seen[4]).toBe(0) -- quiet again
		end)

		t.it("Added is distinct from Changed (set does not re-add)", function()
			rovy:__reset()
			rovy:__component(Health, "t/Health")
			rovy:__schedule(Update, { runOnStart = false })
			rovy:__query({ id = "qadd", terms = { { t = "entity" } }, filters = { added = { Health } } })
			rovy:__query({ id = "qchg", terms = { { t = "entity" } }, filters = { changed = { Health } } })
			local addN, chgN = {}, {}
			local r = 0
			local holder = {}
			local Mut = sysClass(function(_, commands)
				if r == 2 then commands:set(holder.e, Health, Health.new(5)) end
			end)
			local W = sysClass(function(_, qa, qc)
				local a, c = 0, 0
				qa:forEach(function() a += 1 end)
				qc:forEach(function() c += 1 end)
				addN[r] = a
				chgN[r] = c
			end)
			rovy:__system(Mut, { id = "t/Mut", schedule = Update, set = ProdSet, params = { { kind = "commands" } } })
			rovy:__system(W, {
				id = "t/W", schedule = Update, set = ConsSet,
				params = { { kind = "query", handle = "qadd" }, { kind = "query", handle = "qchg" } },
			})
			local app = App.new()
			app:configureSets(Update, { ProdSet, ConsSet })
			app:start()
			holder.e = app.world:spawn(Health.new(1))
			r = 1
			app:runSchedule(Update)
			t.expect(addN[1]).toBe(1) -- just added (first run)
			t.expect(chgN[1]).toBe(1)
			r = 2
			app:runSchedule(Update)
			t.expect(addN[2]).toBe(0) -- set is NOT an add
			t.expect(chgN[2]).toBe(1) -- but is a change
		end)

		t.it("Removed<C> drains once (Entity-only bind)", function()
			rovy:__reset()
			rovy:__component(Health, "t/Health")
			rovy:__schedule(Update, { runOnStart = false })
			rovy:__query({ id = "qrem", terms = { { t = "entity" } }, filters = { removed = { Health } } })
			local got = {}
			local r = 0
			local holder = {}
			local Killer = sysClass(function(_, commands)
				if r == 2 then commands:remove(holder.e, Health) end
			end)
			local Obs = sysClass(function(_, q)
				local n = 0
				q:forEach(function(e) n += 1 end)
				got[r] = n
			end)
			rovy:__system(Killer, { id = "t/Killer", schedule = Update, set = ProdSet, params = { { kind = "commands" } } })
			rovy:__system(Obs, { id = "t/Obs", schedule = Update, set = ConsSet, params = { { kind = "query", handle = "qrem" } } })
			local app = App.new()
			app:configureSets(Update, { ProdSet, ConsSet })
			app:start()
			holder.e = app.world:spawn(Health.new(1))
			r = 1
			app:runSchedule(Update)
			t.expect(got[1]).toBe(0) -- nothing removed yet
			r = 2
			app:runSchedule(Update)
			t.expect(got[2]).toBe(1) -- removed this run, seen in ConsSet
			r = 3
			app:runSchedule(Update)
			t.expect(got[3]).toBe(0) -- buffer drained at run boundary → once
		end)
	end)
end
