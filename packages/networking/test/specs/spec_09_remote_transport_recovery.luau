--!nocheck
-- Exercise the compiled RemoteEvent backend with deterministic Roblox signals.
-- No gameplay dependencies or Roblox network scheduling are involved.
local nethelp = require("../harness/net")
local roblox = require("../../../../test/luau/harness/roblox")

return function(TS, t)
	local net = nethelp.load(TS, "server")
	local function withTransport(capacity, context, check)
		local tree = roblox.createTree()
		local transport = net.ServerRemoteEventTransport.new(capacity)
		local env = getfenv(transport.start)
		local oldGame, oldInstance, oldWarn = env.game, env.Instance, env.warn
		local warnings = {}
		env.game, env.Instance = tree.game, tree.Instance
		env.warn = function(message) table.insert(warnings, message) end
		local ok, problem = pcall(function()
			transport:start(context)
			local folder = tree.getService("ReplicatedStorage"):FindFirstChild("RovyNetworking")
			check(transport, folder, warnings)
		end)
		env.game, env.Instance, env.warn = oldGame, oldInstance, oldWarn
		if not ok then error(problem) end
	end
	local player = { Name = "sender" }

	t.describe("RemoteEvent transport admission and recovery", function()
		t.it("caps a 10,000-message flood before delivery, drops newest, then recovers without replay", function()
			local received = {}
			withTransport(256, {
				boundary = "server",
				deliver = function(name, payload, sender)
					table.insert(received, { name = name, payload = payload, sender = sender })
				end,
			}, function(transport, folder)
				local reliable = folder:FindFirstChild("ReliableClientToServer").OnServerEvent
				local unreliable = folder:FindFirstChild("UnreliableClientToServer").OnServerEvent
				for i = 1, 10000 do
					local signal = if i % 2 == 0 then unreliable else reliable
					signal:Fire(player, "Flood", { n = i })
				end
				t.expect(#received).toBe(0)
				t.expect(#transport.inbound).toBe(256)
				t.expect(transport.droppedInbound).toBe(9744)
				transport:pump()
				t.expect(#transport.inbound).toBe(0)
				t.expect(#received).toBe(256)
				for i, message in received do
					t.expect(message.name).toBe("Flood")
					t.expect(message.payload.n).toBe(i)
					t.expect(message.sender).toBe(player)
				end
				transport:pump()
				t.expect(#received).toBe(256)
				reliable:Fire(player, "Recovered", { n = 10001 })
				transport:pump()
				t.expect(#received).toBe(257)
				t.expect(received[257].payload.n).toBe(10001)
				t.expect(transport.droppedInbound).toBe(9744)
			end)
		end)

		t.it("rejects malformed event and function envelopes without using capacity", function()
			local events, functions = 0, 0
			withTransport(2, {
				boundary = "server",
				deliver = function() events += 1 end,
				deliverFunctionRequest = function(name, envelope, sender)
					t.expect(name).toBe("Call")
					t.expect(envelope.sequence).toBe(1)
					t.expect(sender).toBe(player)
					functions += 1
				end,
			}, function(transport, folder)
				local signal = folder:FindFirstChild("ReliableClientToServer").OnServerEvent
				for _, value in { false, 42, "wrong" } do
					if type(value) ~= "string" then signal:Fire(player, value, {}) end
					signal:Fire(player, "Event", value)
					if type(value) ~= "string" then signal:Fire(player, "__rovy_fn_req", value, {}) end
					signal:Fire(player, "__rovy_fn_req", "Call", value)
				end
				signal:Fire(player)
				signal:Fire(player, "Event")
				signal:Fire(player, "__rovy_fn_req", "Call")
				t.expect(#transport.inbound).toBe(0)
				signal:Fire(player, "Event", {})
				signal:Fire(player, "__rovy_fn_req", "Call", { sequence = 1 })
				transport:pump()
				t.expect(events).toBe(1)
				t.expect(functions).toBe(1)
				t.expect(transport.droppedInbound).toBe(0)
			end)
		end)

		t.it("isolates event and function delivery failures and preserves arrivals during pump", function()
			local attempts, delivered = 0, 0
			local signal
			withTransport(3, {
				boundary = "server",
				deliver = function(name)
					attempts += 1
					if name == "Fail" then error("expected event failure") end
					delivered += 1
					if name == "Valid" then signal:Fire(player, "Next", {}) end
				end,
				deliverFunctionRequest = function() error("expected function failure") end,
			}, function(transport, folder, warnings)
				signal = folder:FindFirstChild("ReliableClientToServer").OnServerEvent
				signal:Fire(player, "Fail", {})
				signal:Fire(player, "__rovy_fn_req", "Call", {})
				signal:Fire(player, "Valid", {})
				transport:pump()
				t.expect(attempts).toBe(2)
				t.expect(delivered).toBe(1)
				t.expect(#warnings).toBe(2)
				t.expect(#transport.inbound).toBe(1)
				transport:pump()
				t.expect(attempts).toBe(3)
				t.expect(delivered).toBe(2)
				transport:pump()
				t.expect(attempts).toBe(3)
				t.expect(#warnings).toBe(2)
			end)
		end)

		t.it("defaults to unlimited admission and rejects nonpositive capacity", function()
			for _, capacity in { 0, -1 } do
				local ok = pcall(function() net.ServerRemoteEventTransport.new(capacity) end)
				t.expect(ok).toBe(false)
			end
			local delivered = 0
			withTransport(nil, { boundary = "server", deliver = function() delivered += 1 end }, function(transport, folder)
				for _ = 1, 10000 do
					folder:FindFirstChild("ReliableClientToServer").OnServerEvent:Fire(player, "Event", {})
				end
				transport:pump()
				t.expect(delivered).toBe(10000)
				t.expect(transport.droppedInbound).toBe(0)
			end)
		end)
	end)
end
