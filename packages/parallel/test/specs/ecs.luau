return function(TS, t)
	local parallel = TS.loadPath("out/init")
	local coreRoot = TS.getModule(nil, "@rovy", "core")
	local core = TS.import(nil, coreRoot, "out", "init")
	local rovy, App = core.rovy, core.App
	local function class(run)
		local C = {}; C.__index = C
		C.new = function(...) return setmetatable({value = ...}, C) end
		C.run = run
		return C
	end
	local function transport()
		local adapter = {pending={}}
		function adapter:start(_, count, ready, complete)
			self.complete = complete
			for i = 1, count do ready(i) end
		end
		function adapter:dispatch(worker, generation, ticket, _, first, count, columns)
			local output = {}
			for i = 1, count do output[i] = columns[1][i] * 2 end
			table.insert(self.pending, {worker, generation, ticket, first, count, true, output})
		end
		function adapter:finish()
			while #self.pending > 0 do self.complete(table.unpack(table.remove(self.pending, 1))) end
		end
		function adapter:destroy() self.destroyed = true end
		return adapter
	end

	t.describe("parallel ECS integration", function()
		t.it("injects handles and applies only living entity generations through Commands", function()
			rovy:__reset()
			local Submit, Apply = {}, {}
			local Value = class()
			rovy:__component(Value, "parallel-test/Value")
			rovy:__schedule(Submit, {runOnStart=false})
			rovy:__schedule(Apply, {runOnStart=false})
			local targets = {}
			local Send = class(function(_, writer)
				writer:tryBatch(function(batch) for _, entity in targets do batch:push(entity, 7) end end)
			end)
			local Receive = class(function(_, reader, commands)
				reader:drain(function(entity, value) commands:set(entity, Value, Value.new(value)) end)
			end)
			rovy:__system(Send, {id="parallel-test/Send", schedule=Submit, params={{kind="external",id="@rovy/parallel/writer:calc"}}})
			rovy:__system(Receive, {id="parallel-test/Receive", schedule=Apply, params={{kind="external",id="@rovy/parallel/reader:calc"},{kind="commands"}}})
			local adapter = transport()
			local plugin = parallel.ParallelPlugin.new({jobs={{__id="calc",__inputCount=1,run=function() end}},transport=adapter,workers=2,chunkSize=1})
			local app = App.new(); app:addPlugin(plugin); app:start()
			t.expect(plugin:ready(0)).toBe(true)
			local old, alive = app.world:spawn(), app.world:spawn()
			targets = {old, alive}
			app:runSchedule(Submit)
			app.world:despawn(old)
			local replacement = app.world:spawn()
			t.expect(app.world.jecs:contains(old)).toBe(false)
			adapter:finish()
			t.expect(plugin:barrier({{__id="calc"}},0).ok).toBe(true)
			app:runSchedule(Apply)
			t.expect(app.world:get(alive, Value).value).toBe(14)
			t.expect(app.world:get(replacement, Value)).toBe(nil)
			t.expect(plugin:stats().staleRows).toBe(1)
			t.expect(plugin:stats().retainedBatches).toBe(0)
			plugin:destroy()
			t.expect(adapter.destroyed).toBe(true)
		end)
		t.it("isolates Apps sharing one job definition", function()
			rovy:__reset()
			rovy:__schedule({}, {runOnStart=false})
			local definition = {__id="shared",__inputCount=1,run=function() end}
			local first = parallel.ParallelPlugin.new({jobs={definition},transport=transport()})
			local second = parallel.ParallelPlugin.new({jobs={definition},transport=transport()})
			local a, b = App.new(), App.new()
			a:addPlugin(first); a:start()
			b:addPlugin(second); b:start()
			first:destroy()
			t.expect(second:ready(0)).toBe(true)
			second:destroy()
		end)
	end)
end
