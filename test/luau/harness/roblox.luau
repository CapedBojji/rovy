--!nocheck

local function createSignal()
	local listeners = {}
	return {
		Connect = function(_self, fn)
			table.insert(listeners, fn)
			return {
				Disconnect = function()
					for i = #listeners, 1, -1 do
						if listeners[i] == fn then
							table.remove(listeners, i)
							break
						end
					end
				end,
			}
		end,
		Fire = function(_self, ...)
			for _, fn in listeners do
				fn(...)
			end
		end,
	}
end

local function createRunService()
	return {
		RenderStepped = createSignal(),
		Heartbeat = createSignal(),
		Stepped = createSignal(),
	}
end

local function createStepper(runService)
	local state = { steps = 0, time = 0 }

	local function step(dt: number?)
		local delta = dt or (1 / 60)
		state.steps += 1
		state.time += delta

		if runService.Stepped and runService.Stepped.Fire then
			runService.Stepped:Fire(state.time, delta)
		end
		if runService.Heartbeat and runService.Heartbeat.Fire then
			runService.Heartbeat:Fire(delta)
		end
		if runService.RenderStepped and runService.RenderStepped.Fire then
			runService.RenderStepped:Fire(delta)
		end
	end

	local function stepN(count: number, dt: number?)
		for _ = 1, count do
			step(dt)
		end
	end

	return {
		state = state,
		step = step,
		stepN = stepN,
	}
end

local function createGame(services)
	return {
		GetService = function(_self, name: string)
			local service = services[name]
			if service ~= nil then
				return service
			end
			error("unknown fake service: " .. tostring(name))
		end,
	}
end

return {
	createSignal = createSignal,
	createRunService = createRunService,
	createStepper = createStepper,
	createGame = createGame,
}
