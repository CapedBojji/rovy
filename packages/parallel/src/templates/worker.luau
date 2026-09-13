-- Packaged script template. All requires and setup happen in serial context.
local actor = script:GetActor()
local workerIndex = actor:GetAttribute("WorkerIndex")
local completion = actor:WaitForChild("Completion").Value
local Kernel = require(actor:WaitForChild("Kernel").Value)
local definitions, states = {}, {}
local output, input = {}, {columns = {}, count = 0}
local initialized = false

actor:BindToMessage("RovyInitialize", function(registrations)
	if initialized then return end
	initialized = true
	local ok, message = pcall(function()
		for _, registration in registrations do
			local definition = require(registration.module)[registration.exportName]
			assert(type(definition) == "table" and type(definition.run) == "function", "invalid job export")
			definitions[registration.id] = definition
			if definition.setup then
				local initialized, state = Kernel.call(definition.setup, definition)
				assert(initialized, state)
				states[registration.id] = state
			end
		end
	end)
	if not ok then completion:Fire("ready", workerIndex, tostring(message)); return end
	actor:BindToMessageParallel("RovyExecute", function(generation, ticket, id, first, count, columns)
		input.columns, input.count = columns, count
		local definition = definitions[id]
		local started = os.clock()
		local success, failure = Kernel.run(definition, states[id], input, output)
		local kernelSeconds = os.clock() - started
		task.synchronize()
		local sent, sendError = pcall(function()
			completion:Fire("result", workerIndex, generation, ticket, first, count, success, success and output or failure, kernelSeconds)
		end)
		if not sent then completion:Fire("result", workerIndex, generation, ticket, first, count, false, tostring(sendError)) end
	end)
	completion:Fire("ready", workerIndex)
end)

completion:Fire("boot", workerIndex)
