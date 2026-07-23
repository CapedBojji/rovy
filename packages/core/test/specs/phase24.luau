--!nocheck
-- Phase 24 — package-neutral flush participants share command convergence at
-- every set/app/world boundary, run deterministically, and reconcile monitors
-- only after observer-produced package work settles.

return function(TS, t)
	local rovy = (TS.loadPath("out/rovy") :: any).rovy
	local App = (TS.loadPath("out/runtime/app") :: any).App

	local function class(ctor)
		local C = {}
		C.__index = C
		C.new = function(...)
			return setmetatable(ctor(...) or {}, C)
		end
		return C
	end

	local function sysClass(runFn)
		local C = {}
		C.__index = C
		C.new = function()
			return setmetatable({}, C)
		end
		C.run = function(self, ...)
			return runFn(self, ...)
		end
		return C
	end

	local function monClass(handlers)
		local C = {}
		C.__index = C
		C.new = function()
			return setmetatable({}, C)
		end
		C.onEnter = function(self, ...)
			if handlers.onEnter then handlers.onEnter(...) end
		end
		return C
	end

	t.describe("Phase 24 — flush participants", function()
		t.it("keeps same-set reads stable and commits package work before the next set", function()
			rovy:__reset()
			local Update, RewardSet, NextSet = {}, {}, {}
			rovy:__schedule(Update, { runOnStart = false })

			local state = { value = 100, pending = 0 }
			local before, during, after
			local workContext

			local QueueReward = sysClass(function()
				before = state.value
				state.pending += 50
				during = state.value
			end)
			local ReadReward = sysClass(function()
				after = state.value
			end)
			rovy:__system(QueueReward, {
				id = "t/QueueReward",
				schedule = Update,
				set = RewardSet,
				params = {},
			})
			rovy:__system(ReadReward, {
				id = "t/ReadReward",
				schedule = Update,
				set = NextSet,
				params = {},
			})

			local participant = {
				flush = function(self, context)
					if state.pending == 0 then return false end
					workContext = context
					state.value += state.pending
					state.pending = 0
					return true
				end,
			}

			local app = App.new()
			app:registerFlushParticipant(participant)
			app:configureSets(Update, { RewardSet, NextSet })
			app:start()
			app:runSchedule(Update)

			t.expect(before).toBe(100)
			t.expect(during).toBe(100)
			t.expect(after).toBe(150)
			t.expect(workContext.app).toBe(app)
			t.expect(workContext.world).toBe(app.world)
			t.expect(workContext.commands).toBe(app.commands)
			t.expect(workContext.schedule).toBe(Update)
			t.expect(workContext.set).toBe(RewardSet)
		end)

		t.it("converges observer-produced package writes before monitors and the next set", function()
			rovy:__reset()
			local Update, RewardSet, NextSet = {}, {}, {}
			local Base = class(function() return {} end)
			local Ready = class(function() return {} end)
			local CoinsChanged = class(function(before, after)
				return { before = before, after = after }
			end)

			rovy:__component(Base, "t/Base")
			rovy:__component(Ready, "t/Ready")
			rovy:__event(CoinsChanged, {})
			rovy:__schedule(Update, { runOnStart = false })
			rovy:__query({
				id = "q/ready-after-flush",
				terms = { { t = "entity" } },
				filters = { with = { Ready } },
			})

			local state = { value = 100 }
			local pending = {}
			local holder = {}
			local observed = {}
			local buffered = {}
			local nextSetValue
			local monitorValue

			local OnCoinsChanged = sysClass(function(_, event)
				table.insert(observed, event.after)
				if event.after == 150 then table.insert(pending, 25) end
			end)
			rovy:__observer(OnCoinsChanged, {
				event = CoinsChanged,
				priority = 0,
				params = { { kind = "event" } },
			})

			local QueueReward = sysClass(function()
				table.insert(pending, 50)
			end)
			local ReadReward = sysClass(function(_, changes)
				nextSetValue = state.value
				changes:forEach(function(change)
					table.insert(buffered, change.after)
				end)
			end)
			rovy:__system(QueueReward, {
				id = "t/QueueObserverReward",
				schedule = Update,
				set = RewardSet,
				params = {},
			})
			rovy:__system(ReadReward, {
				id = "t/ReadObserverReward",
				schedule = Update,
				set = NextSet,
				params = { { kind = "eventReader", ctor = CoinsChanged } },
			})

			local ReadyMonitor = monClass({
				onEnter = function()
					monitorValue = state.value
				end,
			})
			rovy:__monitor(ReadyMonitor, {
				match = "q/ready-after-flush",
				methods = { "onEnter" },
				params = { { kind = "entity" } },
			})

			local participant = {
				flush = function(self, context)
					if #pending == 0 then return false end
					local amount = table.remove(pending, 1)
					local before = state.value
					state.value += amount
					if state.value == 175 then
						context.commands:insert(holder.player, Ready)
					end
					local change = CoinsChanged.new(before, state.value)
					context.commands:send(change)
					context.commands:trigger(change)
					return true
				end,
			}

			local app = App.new()
			app:registerFlushParticipant(participant)
			app:configureSets(Update, { RewardSet, NextSet })
			app:start()
			holder.player = app.world:spawn(Base.new())
			app:runSchedule(Update)

			t.expect(nextSetValue).toBe(175)
			t.expect(monitorValue).toBe(175)
			t.expect(table.concat(observed, ",")).toBe("150,175")
			t.expect(table.concat(buffered, ",")).toBe("150,175")
		end)

		t.it("runs participants in registration order and rejects duplicate registration", function()
			rovy:__reset()
			local Update = {}
			rovy:__schedule(Update, { runOnStart = false })

			local stage = 0
			local order = {}
			local first = {
				flush = function()
					if stage ~= 0 then return false end
					table.insert(order, "first")
					stage = 1
					return true
				end,
			}
			local second = {
				flush = function()
					if stage ~= 1 then return false end
					table.insert(order, "second")
					stage = 2
					return true
				end,
			}

			local app = App.new()
			app:registerFlushParticipant(first)
			app:registerFlushParticipant(second)
			t.expect(function()
				app:registerFlushParticipant(first)
			end).toThrow()
			app:start()
			app:flush()

			t.expect(table.concat(order, ",")).toBe("first,second")
		end)

		t.it("uses the same participant path for app.flush and world.flush", function()
			rovy:__reset()
			local Update = {}
			rovy:__schedule(Update, { runOnStart = false })

			local state = { value = 0, pending = 0 }
			local explicitContexts = {}
			local participant = {
				flush = function(self, context)
					if state.pending == 0 then return false end
					state.value += state.pending
					state.pending = 0
					table.insert(explicitContexts, context)
					return true
				end,
			}

			local app = App.new()
			app:registerFlushParticipant(participant)
			app:start()

			state.pending = 1
			app:flush()
			t.expect(state.value).toBe(1)

			state.pending = 2
			app.world:flush()
			t.expect(state.value).toBe(3)
			t.expect(#explicitContexts).toBe(2)
			t.expect(explicitContexts[1].schedule).toBeUndefined()
			t.expect(explicitContexts[1].set).toBeUndefined()
			t.expect(explicitContexts[2].schedule).toBeUndefined()
			t.expect(explicitContexts[2].set).toBeUndefined()
		end)

		t.it("fails clearly when a participant prevents convergence", function()
			rovy:__reset()
			local Update = {}
			rovy:__schedule(Update, { runOnStart = false })

			local app = App.new()
			app:registerFlushParticipant({
				flush = function()
					return true
				end,
			})
			app:start()

			local ok, err = pcall(function()
				app:flush()
			end)
			local message = tostring(err)
			t.expect(ok).toBeFalsy()
			t.expect(message:find("did not converge after 1000 cycles", 1, true) ~= nil).toBeTruthy()
			t.expect(message:find("flush participant", 1, true) ~= nil).toBeTruthy()
		end)
	end)
end
