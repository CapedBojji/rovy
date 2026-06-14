--!nocheck
-- Remote functions: client call handles, server request readers/responders,
-- result inbox routing, rejection, and loopback round trip.

local nethelp = require("../harness/net")

return function(TS, t)
	local net = TS.loadPath("out/init")

	local Fetch = nethelp.eventClass({ "key" })
	local FetchResult = nethelp.eventClass({ "value" })
	local fetchReg = nethelp.fnReg(Fetch, FetchResult, {
		id = "g/Fetch",
		name = "Fetch",
		fields = { "key" },
		resultName = "FetchResult",
		resultFields = { "value" },
	})

	local function runtime()
		return net.NetRuntime.new({}, { fetchReg })
	end

	t.describe("NetRuntime functions", function()
		t.it("client call sends once per callsite while pending", function()
			local rt = runtime()
			rt:setBoundary("client")
			local handle = rt.client:call(Fetch.new("coins"), "site/a")
			t.expect(handle.functionId).toBe("g/Fetch")
			local out = rt:drainFunctionRequestOutbox()
			t.expect(#out).toBe(1)
			t.expect(out[1].handle.functionId).toBe("g/Fetch")
			t.expect(out[1].handle.callSiteId).toBe("site/a")
			t.expect(out[1].handle.sequence).toBe(0)
			t.expect(out[1].request.key).toBe("coins")
			t.expect(rt:encodeFunctionRequest(out[1]).payload.key).toBe("coins")
			t.expect(rt.client:call(Fetch.new("coins"), "site/a")).toBe(handle)
			t.expect(#rt:drainFunctionRequestOutbox()).toBe(0)
		end)

		t.it("injected NetFunc calls only its registered request type", function()
			local rt = runtime()
			rt:setBoundary("client")
			local fetch = rt:functionParam("g/Fetch")
			local handle = fetch:call(Fetch.new("coins"), "site/a")
			t.expect(handle.functionId).toBe("g/Fetch")
			t.expect(#rt:drainFunctionRequestOutbox()).toBe(1)

			local Other = nethelp.eventClass({ "key" })
			t.expect(function()
				fetch:call(Other.new("bad"), "site/b")
			end).toThrow()
		end)

		t.it("server reads request and resolves result", function()
			local rt = runtime()
			rt:setBoundary("server")
			local player = { Name = "P" }
			rt:receiveFunctionRequest(fetchReg, {
				callSiteId = "site/a",
				sequence = 4,
				payload = { key = "coins" },
			}, player)

			local seen
			rt:functionReader("g/Fetch"):forEach(function(call)
				seen = call
				t.expect(call.request.key).toBe("coins")
				t.expect(call.sender).toBe(player)
				rt.responder:resolve(call, FetchResult.new("42"))
			end)

			t.expect(seen).never.toBeUndefined()
			local out = rt:drainFunctionResultOutbox()
			t.expect(#out).toBe(1)
			t.expect(out[1].target.player).toBe(player)
			local envelope = rt:encodeFunctionResult(out[1])
			t.expect(envelope.ok).toBe(true)
			t.expect(envelope.payload.value).toBe("42")
		end)

		t.it("client call returns exact result once on later frame", function()
			local rt = runtime()
			rt:setBoundary("client")
			local handle = rt.client:call(Fetch.new("coins"), "site/a")
			rt:drainFunctionRequestOutbox()
			t.expect(rt.client:hasResult(handle)).toBe(false)

			rt:receiveFunctionResult(fetchReg, {
				callSiteId = "site/a",
				sequence = handle.sequence,
				ok = true,
				payload = { value = "42" },
			})

			t.expect(rt.client:hasResult(handle)).toBe(true)
			t.expect(rt.client:hasResult(handle)).toBe(true)
			local result = rt.client:getResult(handle)
			t.expect(result.value).toBe("42")
			t.expect(rt.client:hasResult(handle)).toBe(false)
			t.expect(rt.client:call(Fetch.new("coins"), "site/a").sequence).toBe(1)
			t.expect(#rt:drainFunctionRequestOutbox()).toBe(1)
		end)

		t.it("reject result routes as error", function()
			local rt = runtime()
			rt:setBoundary("client")
			local handle = rt.client:call(Fetch.new("coins"), "site/a")
			rt:drainFunctionRequestOutbox()

			rt:receiveFunctionResult(fetchReg, {
				callSiteId = "site/a",
				sequence = handle.sequence,
				ok = false,
				error = "nope",
			})

			local result = rt.client:getResult(handle)
			t.expect(result.ok).toBe(false)
			t.expect(result.error).toBe("nope")
		end)

		t.it("result expires after ttl frames", function()
			local rt = runtime()
			rt:setBoundary("client")
			local handle = rt.client:call(Fetch.new("coins"), "site/a")
			rt:drainFunctionRequestOutbox()
			rt:receiveFunctionResult(fetchReg, {
				callSiteId = "site/a",
				sequence = handle.sequence,
				ok = true,
				payload = { value = "42" },
			})
			for _ = 1, 301 do
				rt:endFrame()
			end
			t.expect(rt.client:getResult(handle)).toBeUndefined()
			t.expect(rt.client:call(Fetch.new("coins"), "site/a").sequence).toBe(1)
			t.expect(#rt:drainFunctionRequestOutbox()).toBe(1)
		end)
	end)

	t.describe("function loopback", function()
		t.it("round-trips request and result through transport pumps", function()
			local player = { Name = "P" }
			local clientRt = runtime()
			local serverRt = runtime()
			clientRt:setBoundary("client")
			serverRt:setBoundary("server")

			local clientTransport = net.LoopbackTransport.new(player)
			local serverTransport = net.LoopbackTransport.new()
			net.connectLoopback(clientTransport, serverTransport)

			clientTransport:start({
				boundary = "client",
				deliver = function() end,
				deliverFunctionResult = function(name, envelope)
					clientRt:receiveFunctionResult(net.rovyNet:functionByName(name) or fetchReg, envelope)
				end,
			})
			serverTransport:start({
				boundary = "server",
				deliver = function() end,
				deliverFunctionRequest = function(name, envelope, sender)
					serverRt:receiveFunctionRequest(net.rovyNet:functionByName(name) or fetchReg, envelope, sender)
				end,
			})

			local handle = clientRt.client:call(Fetch.new("coins"), "site/a")
			for _, item in clientRt:drainFunctionRequestOutbox() do
				clientTransport:sendFunctionRequest(item, clientRt:encodeFunctionRequest(item))
			end
			serverTransport:pump()

			serverRt:functionReader("g/Fetch"):forEach(function(call)
				serverRt.responder:resolve(call, FetchResult.new("42"))
			end)
			for _, item in serverRt:drainFunctionResultOutbox() do
				serverTransport:sendFunctionResult(item, serverRt:encodeFunctionResult(item))
			end
			clientTransport:pump()

			local result = clientRt.client:getResult(handle)
			t.expect(result.value).toBe("42")
		end)
	end)
end
