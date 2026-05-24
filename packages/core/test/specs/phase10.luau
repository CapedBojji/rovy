--!nocheck
-- Phase 10 exit: tag + data relations round-trip; exclusive auto-removes
-- prior; onTargetDelete=cascade despawns holder; Pair<R> binds {target,data};
-- withTarget narrows; HasPair filter.

return function(TS, t)
	local rovy = (TS.loadPath("out/rovy") :: any).rovy
	local App = (TS.loadPath("out/runtime/app") :: any).App
	local BuiltinChildOf = (TS.loadPath("out/init") :: any).ChildOf

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

	local Health = class(function(v) return { v = v } end)
	local ChildOf = class(function() return {} end) -- tag relation
	local Owns = class(function(n) return { amount = n } end) -- data relation
	local BelongsTo = class(function() return {} end) -- exclusive
	local Update = {}

	t.describe("Phase 10 — relationships", function()
		t.it("tag + data relation round-trip via world and commands", function()
			rovy:__reset()
			rovy:__component(Health, "t/Health")
			rovy:__relation(ChildOf, { exclusive = false, onTargetDelete = "none", onDelete = "none" })
			rovy:__relation(Owns, { exclusive = false, onTargetDelete = "none", onDelete = "none" })
			rovy:__schedule(Update, { runOnStart = false })
			local app = App.new()
			app:start()
			local w = app.world
			local parent = w:spawn(Health.new(1))
			local child = w:spawn(Health.new(2))
			w:relate(child, ChildOf, parent)
			t.expect(w:hasRelation(child, ChildOf, parent)).toBeTruthy()
			local item = w:spawn(Health.new(3))
			app.commands:relate(item, Owns, parent, Owns.new(7))
			app:flush()
			local d = w:getRelation(item, Owns, parent)
			t.expect(d).toBeDefined()
			t.expect(d.amount).toBe(7)
			w:unrelate(child, ChildOf, parent)
			t.expect(w:hasRelation(child, ChildOf, parent)).toBeFalsy()
		end)

		t.it("exclusive relation auto-removes the prior target", function()
			rovy:__reset()
			rovy:__component(Health, "t/Health")
			rovy:__relation(BelongsTo, { exclusive = true, onTargetDelete = "none", onDelete = "none" })
			rovy:__schedule(Update, { runOnStart = false })
			local app = App.new()
			app:start()
			local w = app.world
			local e = w:spawn(Health.new(1))
			local a = w:spawn(Health.new(1))
			local b = w:spawn(Health.new(1))
			w:relate(e, BelongsTo, a)
			w:relate(e, BelongsTo, b) -- exclusive → a dropped
			t.expect(w:hasRelation(e, BelongsTo, b)).toBeTruthy()
			t.expect(w:hasRelation(e, BelongsTo, a)).toBeFalsy()
		end)

		t.it("onTargetDelete=cascade despawns the pair holder", function()
			rovy:__reset()
			rovy:__component(Health, "t/Health")
			rovy:__relation(ChildOf, { exclusive = false, onTargetDelete = "cascade", onDelete = "none" })
			rovy:__schedule(Update, { runOnStart = false })
			local app = App.new()
			app:start()
			local w = app.world
			local parent = w:spawn(Health.new(1))
			local child = w:spawn(Health.new(2))
			w:relate(child, ChildOf, parent)
			t.expect(w.jecs:contains(child)).toBeTruthy()
			w:despawn(parent)
			t.expect(w.jecs:contains(child)).toBeFalsy() -- cascaded
		end)

		t.it("Pair<R> binds {target,data}; withTarget narrows; HasPair filters", function()
			rovy:__reset()
			rovy:__component(Health, "t/Health")
			rovy:__relation(ChildOf, { exclusive = false, onTargetDelete = "none", onDelete = "none" })
			rovy:__schedule(Update, { runOnStart = false })
			rovy:__query({
				id = "qpair",
				terms = { { t = "entity" }, { t = "pair", relation = ChildOf } },
				filters = {},
			})
			rovy:__query({
				id = "qhas",
				terms = { { t = "entity" }, { t = "component", ctor = Health } },
				filters = { hasPair = { ChildOf } },
			})
			local pairRows, hasN, narrowed = {}, 0, {}
			local Sys = sysClass(function(_, qp, qh, qpAll)
				qp:forEach(function(e, pr) table.insert(pairRows, pr.target) end)
				qh:forEach(function() hasN += 1 end)
			end)
			rovy:__system(Sys, {
				id = "t/RS", schedule = Update,
				params = {
					{ kind = "query", handle = "qpair" },
					{ kind = "query", handle = "qhas" },
				},
			})
			local app = App.new()
			app:start()
			local w = app.world
			local p1 = w:spawn(Health.new(1))
			local p2 = w:spawn(Health.new(1))
			local c1 = w:spawn(Health.new(2))
			local c2 = w:spawn(Health.new(2))
			local lone = w:spawn(Health.new(9))
			w:relate(c1, ChildOf, p1)
			w:relate(c2, ChildOf, p2)
			app:runSchedule(Update)
			t.expect(#pairRows).toBe(2)
			t.expect(hasN).toBe(2) -- c1,c2 have Health + ChildOf; lone excluded

			-- withTarget narrows to a specific parent
			local handle = app.scheduler.queries["qpair"]
			local only = {}
			handle:withTarget(p1):forEach(function(e) table.insert(only, e) end)
			t.expect(#only).toBe(1)
			t.expect(only[1]).toBe(c1)
		end)

		t.it("builtin ChildOf works as a class token with hierarchy helpers and queries", function()
			rovy:__reset()
			rovy:__component(Health, "t/Health")
			rovy:__schedule(Update, { runOnStart = false })
			rovy:__query({
				id = "qBuiltinPair",
				terms = { { t = "entity" }, { t = "pair", relation = BuiltinChildOf } },
				filters = {},
			})
			rovy:__query({
				id = "qBuiltinHas",
				terms = { { t = "entity" }, { t = "component", ctor = Health } },
				filters = { hasPair = { BuiltinChildOf } },
			})
			local pairTargets, hasN = {}, 0
			local Sys = sysClass(function(_, qp, qh)
				qp:forEach(function(_, pr) table.insert(pairTargets, pr.target) end)
				qh:forEach(function() hasN += 1 end)
			end)
			rovy:__system(Sys, {
				id = "t/BuiltinRS",
				schedule = Update,
				params = {
					{ kind = "query", handle = "qBuiltinPair" },
					{ kind = "query", handle = "qBuiltinHas" },
				},
			})
			local app = App.new()
			app:start()
			local w = app.world
			local parent = w:spawn(Health.new(1))
			local child = w:spawn(Health.new(2))
			local child2 = w:spawn(Health.new(3))
			w:relate(child, BuiltinChildOf, parent)
			app.commands:relate(child2, BuiltinChildOf, parent)
			app:flush()

			t.expect(w:hasRelation(child, BuiltinChildOf, parent)).toBeTruthy()
			t.expect(w:parent(child)).toBe(parent)
			local children = {}
			for c in w:children(parent) do
				table.insert(children, c)
			end
			t.expect(#children).toBe(2)

			app:runSchedule(Update)
			t.expect(#pairTargets).toBe(2)
			t.expect(hasN).toBe(2)
			local only = {}
			app.scheduler.queries["qBuiltinPair"]:withTarget(parent):forEach(function(e) table.insert(only, e) end)
			t.expect(#only).toBe(2)

			w:unrelate(child, BuiltinChildOf, parent)
			t.expect(w:hasRelation(child, BuiltinChildOf, parent)).toBeFalsy()
			t.expect(w:parent(child)).toBeUndefined()
			w:despawn(parent)
			t.expect(w.jecs:contains(child2)).toBeFalsy()
		end)

		t.it("builtin ChildOf is exclusive and auto-removes the prior parent pair", function()
			rovy:__reset()
			rovy:__component(Health, "t/Health")
			rovy:__schedule(Update, { runOnStart = false })
			local app = App.new()
			app:start()
			local w = app.world
			local child = w:spawn(Health.new(1))
			local parentA = w:spawn(Health.new(2))
			local parentB = w:spawn(Health.new(3))

			w:relate(child, BuiltinChildOf, parentA)
			t.expect(w:hasRelation(child, BuiltinChildOf, parentA)).toBeTruthy()
			t.expect(w:parent(child)).toBe(parentA)

			w:relate(child, BuiltinChildOf, parentB)

			t.expect(w.jecs:contains(child)).toBeTruthy()
			t.expect(w:hasRelation(child, BuiltinChildOf, parentA)).toBeFalsy()
			t.expect(w:hasRelation(child, BuiltinChildOf, parentB)).toBeTruthy()
			t.expect(w:parent(child)).toBe(parentB)
		end)
	end)
end
