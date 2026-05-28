--!nocheck
-- Phase 15 — collector integration. External payload queue enters ECS through
-- collectors, then fans into buffered events and observer triggers.

return function(TS, t)
	local rovy = (TS.loadPath("out/rovy") :: any).rovy
	local App = (TS.loadPath("out/runtime/app") :: any).App
	local Collector = (TS.loadPath("out/init") :: any).Collector

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
	local function collectClass(onNew)
		local C = {}
		C.__index = C
		C.new = function()
			local self = setmetatable({}, C)
			Collector.constructor(self)
			if onNew then onNew(self) end
			return self
		end
		setmetatable(C, { __index = Collector })
		C.push = function(self, value)
			self:enqueue(value)
		end
		return C
	end

	local Update = {}
	local BufferedSet, ReaderSet, TriggerSet = {}, {}, {}
	local BufferedEvent = class(function(value) return { value = value } end)
	local TriggeredEvent = class(function(value) return { value = value } end)

	t.describe("Phase 15 — collector integration", function()
		t.it("systems translate collectors into send() and trigger() flows", function()
			rovy:__reset()
			local refs = { send = nil, trigger = nil }
			local SendInbox = collectClass(function(instance) refs.send = instance end)
			local TriggerInbox = collectClass(function(instance) refs.trigger = instance end)
			rovy:__collect(SendInbox, "t/SendInbox")
			rovy:__collect(TriggerInbox, "t/TriggerInbox")
			rovy:__event(BufferedEvent, {})
			rovy:__event(TriggeredEvent, {})
			rovy:__schedule(Update, { runOnStart = false })

			local seenBuffered = {}
			local seenTriggered = {}

			local DrainBuffered = sysClass(function(_, inbox, writer)
				for _, value in ipairs(inbox:drain()) do
					writer:send(BufferedEvent.new(value))
				end
			end)
			local ReadBuffered = sysClass(function(_, reader)
				reader:forEach(function(event)
					table.insert(seenBuffered, event.value)
				end)
			end)
			local DrainTriggered = sysClass(function(_, commands, inbox)
				for _, value in ipairs(inbox:drain()) do
					commands:trigger(TriggeredEvent.new(value))
				end
			end)
			local Obs = sysClass(function(_, event)
				table.insert(seenTriggered, event.value)
			end)

			rovy:__system(DrainBuffered, {
				id = "t/DrainBuffered",
				schedule = Update,
				set = BufferedSet,
				params = {
					{ kind = "collect", ctor = SendInbox },
					{ kind = "eventWriter", ctor = BufferedEvent },
				},
			})
			rovy:__system(ReadBuffered, {
				id = "t/ReadBuffered",
				schedule = Update,
				set = ReaderSet,
				params = { { kind = "eventReader", ctor = BufferedEvent } },
			})
			rovy:__system(DrainTriggered, {
				id = "t/DrainTriggered",
				schedule = Update,
				set = TriggerSet,
				params = {
					{ kind = "commands" },
					{ kind = "collect", ctor = TriggerInbox },
				},
			})
			rovy:__observer(Obs, {
				event = TriggeredEvent,
				priority = 0,
				params = { { kind = "event" } },
			})

			local app = App.new()
			app:configureSets(Update, { BufferedSet, ReaderSet, TriggerSet })
			app:start()

			refs.send:push("alpha")
			refs.send:push("beta")
			refs.trigger:push("gamma")
			refs.trigger:push("delta")

			local sendPeek = refs.send:peek()
			local triggerPeek = refs.trigger:peek()
			t.expect(#sendPeek).toBe(2)
			t.expect(sendPeek[1]).toBe("alpha")
			t.expect(sendPeek[2]).toBe("beta")
			t.expect(#triggerPeek).toBe(2)
			t.expect(triggerPeek[1]).toBe("gamma")
			t.expect(triggerPeek[2]).toBe("delta")
			t.expect(#refs.send.queue).toBe(2)
			t.expect(#refs.trigger.queue).toBe(2)

			app:runSchedule(Update)

			t.expect(#seenBuffered).toBe(2)
			t.expect(seenBuffered[1]).toBe("alpha")
			t.expect(seenBuffered[2]).toBe("beta")
			t.expect(#seenTriggered).toBe(2)
			t.expect(seenTriggered[1]).toBe("gamma")
			t.expect(seenTriggered[2]).toBe("delta")
			t.expect(#refs.send.queue).toBe(0)
			t.expect(#refs.trigger.queue).toBe(0)
			t.expect(#refs.send:peek()).toBe(0)
			t.expect(#refs.trigger:peek()).toBe(0)
		end)
	end)
end
