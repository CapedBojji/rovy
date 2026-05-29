--!nocheck
-- Phase 14 — runtime collector lifecycle. App owns singleton collector
-- instances, injects them into every hook kind, and validates missing wiring.

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
	local function monClass(h)
		local C = {}
		C.__index = C
		C.new = function() return setmetatable({}, C) end
		C.onEnter = function(self, ...) if h.onEnter then h.onEnter(...) end end
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
	local Ping = class(function() return {} end)
	local Marker = class(function() return {} end)

	t.describe("Phase 14 — collector runtime", function()
		t.it("collector-only app can start", function()
			rovy:__reset()
			local Inbox = collectClass()
			rovy:__collect(Inbox, "t/Inbox")

			local app = App.new()
			app:start()
			t.expect(app:isStarted()).toBeTruthy()
		end)

		t.it("same collector instance is injected into system observer and monitor", function()
			rovy:__reset()
			local constructed = { inbox = nil, system = nil, observer = nil, monitor = nil, resource = nil }
			local Inbox = collectClass(function(instance)
				constructed.inbox = instance
			end)
			local InboxRefs = class(function()
				return { inbox = nil }
			end)
			rovy:__collect(Inbox, "t/Inbox")
			rovy:__resource(InboxRefs, "t/InboxRefs", {
				collectorRefs = { { key = "inbox", ctor = Inbox } },
			})
			rovy:__component(Marker, "t/Marker")
			rovy:__event(Ping, {})
			rovy:__schedule(Update, { runOnStart = false })

			local Tick = sysClass(function(_, inbox, refs)
				constructed.system = inbox
				constructed.resource = refs.inbox
			end)
			local Obs = sysClass(function(_, _event, inbox)
				constructed.observer = inbox
			end)
			local Mon = monClass({
				onEnter = function(_entity, _marker, inbox)
					constructed.monitor = inbox
				end,
			})

			rovy:__query({ id = "t/MarkerMatch", terms = { { t = "entity" }, { t = "component", ctor = Marker } }, filters = {} })
			rovy:__system(Tick, {
				id = "t/Tick",
				schedule = Update,
				params = { { kind = "collect", ctor = Inbox }, { kind = "res", ctor = InboxRefs } },
			})
			rovy:__observer(Obs, {
				event = Ping,
				priority = 0,
				params = { { kind = "event" }, { kind = "collect", ctor = Inbox } },
			})
			rovy:__monitor(Mon, {
				match = "t/MarkerMatch",
				methods = { "onEnter" },
				params = { { kind = "entity" }, { kind = "term", index = 1 }, { kind = "collect", ctor = Inbox } },
			})

			local app = App.new()
			app:start()
			t.expect(app.world:resource(InboxRefs).inbox).toBe(constructed.inbox)
			app:runSchedule(Update)
			app.world:trigger(Ping.new())
			app.world:spawn(Marker.new())
			app:flush()

			t.expect(constructed.inbox).toBeDefined()
			t.expect(constructed.system).toBe(constructed.inbox)
			t.expect(constructed.observer).toBe(constructed.inbox)
			t.expect(constructed.monitor).toBe(constructed.inbox)
			t.expect(constructed.resource).toBe(constructed.inbox)
		end)

		t.it("collector-backed resource fields keep identity through inspected resource snapshots", function()
			rovy:__reset()
			local seen = { inbox = nil, raw = nil, resourceWasRaw = nil, inboxWasRaw = nil, nestedWasRaw = nil }
			local Inbox = collectClass(function(instance)
				seen.inbox = instance
			end)
			local InboxRefs = class(function()
				return { inbox = nil, nested = { count = 0 } }
			end)
			local Touch = sysClass(function(_, refs)
				seen.resourceWasRaw = refs == seen.raw
				seen.inboxWasRaw = refs.inbox == seen.raw.inbox
				seen.nestedWasRaw = refs.nested == seen.raw.nested
				refs.inbox:push("from-resource")
				refs.nested.count += 1
			end)

			rovy:__collect(Inbox, "t/Inbox")
			rovy:__resource(InboxRefs, "t/InboxRefs", {
				collectorRefs = { { key = "inbox", ctor = Inbox } },
				inspect = {
					fields = {
						{ key = "inbox", typeLabel = "table", validator = function()
							return true
						end },
						{ key = "nested", typeLabel = "table", validator = function()
							return true
						end },
					},
				},
			})
			rovy:__schedule(Update, { runOnStart = false })
			rovy:__system(Touch, {
				id = "t/Touch",
				schedule = Update,
				params = { { kind = "resMut", ctor = InboxRefs } },
			})

			local app = App.new()
			app:start()
			seen.raw = app.world:resource(InboxRefs)
			app:runSchedule(Update)

			local live = app.world:resource(InboxRefs)
			t.expect(seen.resourceWasRaw).toBe(true)
			t.expect(seen.inboxWasRaw).toBe(true)
			t.expect(seen.nestedWasRaw).toBe(true)
			t.expect(live).toBe(seen.raw)
			t.expect(live.inbox).toBe(seen.inbox)
			t.expect(live.nested).toBe(seen.raw.nested)
			t.expect(live.nested.count).toBe(1)
			t.expect(#seen.inbox:drain()).toBe(1)
		end)

		t.it("collector queue survives schedule runs until author drains it", function()
			rovy:__reset()
			local seen = { inbox = nil, sizes = {} }
			local Inbox = collectClass(function(instance)
				seen.inbox = instance
			end)
			rovy:__collect(Inbox, "t/Inbox")
			rovy:__schedule(Update, { runOnStart = false })

			local Peek = sysClass(function(_, inbox)
				table.insert(seen.sizes, #inbox.queue)
			end)
			rovy:__system(Peek, {
				id = "t/Peek",
				schedule = Update,
				params = { { kind = "collect", ctor = Inbox } },
			})

			local app = App.new()
			app:start()
			seen.inbox:push("fire")
			app:runSchedule(Update)
			app:runSchedule(Update)
			seen.inbox:drain()
			app:runSchedule(Update)

			t.expect(seen.sizes[1]).toBe(1)
			t.expect(seen.sizes[2]).toBe(1)
			t.expect(seen.sizes[3]).toBe(0)
		end)

		t.it("unregistered collector param throws named error", function()
			rovy:__reset()
			rovy:__schedule(Update, { runOnStart = false })
			local Missing = collectClass()
			local S = sysClass(function() end)
			rovy:__system(S, {
				id = "t/NeedsCollect",
				schedule = Update,
				params = { { kind = "collect", ctor = Missing } },
			})

			local ok, err = pcall(function()
				App.new():start()
			end)
			t.expect(ok).toBeFalsy()
			t.expect(tostring(err):find("NeedsCollect") ~= nil).toBeTruthy()
			t.expect(tostring(err):find("unregistered @collect") ~= nil).toBeTruthy()
		end)

		t.it("unregistered collector resource field throws named error", function()
			rovy:__reset()
			local Missing = collectClass()
			local InboxRefs = class(function()
				return { inbox = nil }
			end)
			rovy:__resource(InboxRefs, "t/InboxRefs", {
				collectorRefs = { { key = "inbox", ctor = Missing } },
			})

			local ok, err = pcall(function()
				App.new():start()
			end)
			t.expect(ok).toBeFalsy()
			t.expect(tostring(err):find("InboxRefs") ~= nil).toBeTruthy()
			t.expect(tostring(err):find("unregistered @collect field 'inbox'") ~= nil).toBeTruthy()
		end)

		t.it("collector without inherited or manual drain() fails at start", function()
			rovy:__reset()
			local Broken = class(function() return {} end)
			rovy:__collect(Broken, "t/Broken")

			local ok, err = pcall(function()
				App.new():start()
			end)
			t.expect(ok).toBeFalsy()
			t.expect(tostring(err):find("@collect 't/Broken' must define drain") ~= nil).toBeTruthy()
		end)
	end)
end
