-- Bounded, App-independent scheduling. Actor transport is replaceable in tests.
local Kernel = require(script.Parent.kernel)
local Pool = {}
Pool.__index = Pool
local nextTicket = 0

local function timeout(seconds)
	seconds = seconds or 5
	assert(type(seconds) == "number" and seconds >= 0 and seconds < math.huge, "[rovy/parallel] timeout must be finite and nonnegative")
	return seconds
end

local function positive(value, fallback, name)
	value = value or fallback
	assert(value >= 1 and value % 1 == 0 and value < math.huge, "[rovy/parallel] invalid " .. name)
	return value
end

function Pool.new(options)
	local self = setmetatable({}, Pool)
	self.workerCount = positive(options.workers, 8, "workers")
	self.chunkSize = positive(options.chunkSize, 256, "chunkSize")
	self.maxBatches = positive(options.maxBatches, 8, "maxBatches")
	self.maxRows = positive(options.maxRows, 16384, "maxRows")
	self.jobs, self.order, self.latest, self.batches, self.records, self.workers = {}, {}, {}, {}, {}, {}
	self.waiters, self.localStates, self.localOutputs = {}, {}, {}
	self.destroyed, self.pumping, self.filling, self.cursor = false, false, false, 0
	self.counters = { submitted = 0, completed = 0, failed = 0, cancelled = 0, rejected = 0, staleRows = 0, dispatchedChunks = 0, kernelSeconds = 0, dispatchSeconds = 0 }
	self.guard = options.assertCanWait
	for _, registration in options.jobs do
		local definition = registration
		if not definition.run then
			definition = require(registration.module)[registration.exportName]
			definition = table.clone(definition)
			definition.__id = registration.id
			definition.__module = registration.module
			definition.__exportName = registration.exportName
			definition.__inputCount = registration.inputCount or definition.__inputCount
		end
		assert(type(definition.__id) == "string" and type(definition.__inputCount) == "number", "[rovy/parallel] invalid job registration")
		assert(definition.__inputCount >= 0 and definition.__inputCount % 1 == 0 and definition.__inputCount < math.huge, "[rovy/parallel] invalid inputCount")
		assert(not self.jobs[definition.__id], "[rovy/parallel] duplicate job id " .. definition.__id)
		assert((definition.serialBelow or 0) >= 0, "[rovy/parallel] invalid serialBelow")
		self.jobs[definition.__id] = definition
		self.order[definition.__id] = {}
		self.latest[definition.__id] = {}
	end
	for i = 1, self.maxBatches do
		self.records[i] = { columns = {}, entities = {}, output = {}, free = true, count = 0 }
	end
	for i = 1, self.workerCount do self.workers[i] = { ready = false, busy = false, generation = 0, columns = {} } end
	self.transport = options.transport or require(script.Parent.transport).new()
	self.transport:start(self.jobs, self.workerCount,
		function(worker, message)
			if self.destroyed then return end
			self.workers[worker].ready = message == nil
			self.workers[worker].error = message
			self:_notify()
			self:_pump()
		end,
		function(worker, generation, ticket, first, count, ok, result, kernelSeconds)
			self:_complete(worker, generation, ticket, first, count, ok, result, kernelSeconds)
		end)
	return self
end

function Pool:_check()
	assert(not self.destroyed, "[rovy/parallel] pool is destroyed")
end

function Pool:_canWait()
	self:_check()
	assert(not self.filling and not self.draining, "[rovy/parallel] cannot wait inside a batch callback")
	if self.guard then self.guard() end
end

function Pool:_notify()
	-- Waits allocate once per explicit barrier, never per dispatched chunk.
	for i = #self.waiters, 1, -1 do
		local waiter = self.waiters[i]
		if self.destroyed or waiter.test() then
			table.remove(self.waiters, i)
			waiter.done = true
			if waiter.timer then task.cancel(waiter.timer) end
			task.defer(waiter.thread, not self.destroyed)
		end
	end
end

function Pool:_await(test, seconds)
	assert(seconds >= 0 and seconds < math.huge, "[rovy/parallel] timeout must be finite and nonnegative")
	if test() then return true end
	if seconds == 0 then return false end
	local waiter = { thread = coroutine.running(), test = test, done = false }
	table.insert(self.waiters, waiter)
	waiter.timer = task.delay(seconds, function()
		if waiter.done then return end
		waiter.done = true
		for i, pending in self.waiters do if pending == waiter then table.remove(self.waiters, i); break end end
		task.defer(waiter.thread, false)
	end)
	return coroutine.yield()
end

function Pool:ready(seconds)
	self:_canWait()
	self:_await(function()
		for _, worker in self.workers do if worker.error then return true end end
		for _, worker in self.workers do
			if not worker.ready then return false end
		end
		return true
	end, seconds or 5)
	if self.destroyed then return false end
	for _, worker in self.workers do if not worker.ready then return false end end
	return true
end

function Pool:_reserve(id)
	self:_check()
	assert(not self.filling, "[rovy/parallel] nested submission is unsupported")
	assert(self.jobs[id], "[rovy/parallel] unregistered job " .. tostring(id))
	for _, worker in self.workers do
		if not worker.ready then self.counters.rejected += 1; return nil end
	end
	for _, record in self.records do
		if record.free then
			nextTicket += 1
			record.free, record.ticket, record.id = false, nextTicket, id
			record.count, record.nextRow, record.received = 0, 1, 0
			record.status, record.message, record.reason = "filling", nil, nil
			table.clear(record.entities)
			table.clear(record.output)
			for _, column in record.columns do table.clear(column) end
			for i = 1, self.jobs[id].__inputCount do record.columns[i] = record.columns[i] or {} end
			for i = #record.columns, self.jobs[id].__inputCount + 1, -1 do record.columns[i] = nil end
			return record
		end
	end
	self.counters.rejected += 1
	return nil
end

function Pool:_accept(record)
	-- A fill callback may tear down its owning App/pool.
	if self.destroyed then
		record.free, record.status = true, "released"
		self:_clear(record)
		error("[rovy/parallel] pool destroyed during submission", 0)
	end
	record.status = "pending"
	self.batches[record.ticket] = record
	table.insert(self.order[record.id], record.ticket)
	for _, entity in record.entities do self.latest[record.id][entity] = record.ticket end
	self.counters.submitted += 1
	if record.count == 0 then
		self:_finish(record, "success")
	elseif record.count < (self.jobs[record.id].serialBelow or 0) then
		local definition = self.jobs[record.id]
		local state = self.localStates[record.id]
		if not state then
			local ok, value = true, nil
			if definition.setup then ok, value = Kernel.call(definition.setup, definition) end
			if not ok then self:_finish(record, "failed", "setup", tostring(value)); return record.ticket end
			state = { value = value }
			self.localStates[record.id] = state
		end
		local output = self.localOutputs[record.id] or {}
		self.localOutputs[record.id] = output
		local started = os.clock()
		local ok, message = Kernel.run(definition, state.value, { columns = record.columns, count = record.count }, output)
		self.counters.kernelSeconds += os.clock() - started
		if ok then
			-- Match Actor transfer ownership even when running locally.
			local copied, failure = pcall(function()
				for i = 1, record.count do record.output[i] = Kernel.snapshot(output[i]) end
			end)
			if copied then self:_finish(record, "success") else self:_finish(record, "failed", "kernel", tostring(failure)) end
		else self:_finish(record, "failed", "kernel", message) end
	else self:_pump() end
	return record.ticket
end

function Pool:tryBatch(id, fill)
	local record = self:_reserve(id)
	if not record then return nil end
	local builder = record.builder
	if not builder then
		builder = {}
		function builder:push(entity, ...)
			assert(record.status == "filling" and self._pool.filling and not record.free, "[rovy/parallel] batch writer is only valid during fill")
			assert(type(entity) == "number", "[rovy/parallel] expected full entity handle")
			assert(record.count < self._pool.maxRows, "[rovy/parallel] maxRows exceeded")
			assert(select("#", ...) == #record.columns, "[rovy/parallel] wrong input tuple arity")
			local row = record.count + 1
			for column = 1, #record.columns do
				local value = select(column, ...)
				assert(value ~= nil, "[rovy/parallel] input tuple values must not be nil")
				record.columns[column][row] = Kernel.snapshot(value)
			end
			record.entities[row], record.count = entity, row
		end
		builder._pool = self
		record.builder = builder
	end
	self.filling = true
	local ok, message = Kernel.call(fill, builder)
	self.filling = false
	if not ok then
		record.status, record.free = "released", true
		self:_clear(record)
		error(message, 0)
	end
	return self:_accept(record)
end

function Pool:submit(id, input)
	local record = self:_reserve(id)
	if not record then return nil end
	local ok, message = pcall(function()
		assert(input.count >= 0 and input.count % 1 == 0 and input.count <= self.maxRows, "[rovy/parallel] invalid batch count")
		assert(#input.columns == #record.columns, "[rovy/parallel] wrong input column count")
		record.count = input.count
		for c, column in input.columns do
			for row = 1, input.count do
				assert(column[row] ~= nil, "[rovy/parallel] missing input value")
				record.columns[c][row] = Kernel.snapshot(column[row])
			end
		end
	end)
	if not ok then record.free = true; record.status = "released"; self:_clear(record); error(message, 0) end
	return self:_accept(record)
end

function Pool:_pump()
	if self.destroyed or self.pumping then return end
	self.pumping = true
	for workerId, worker in self.workers do
		if worker.ready and not worker.busy then
			local record
			for _ = 1, self.maxBatches do
				self.cursor = self.cursor % self.maxBatches + 1
				local candidate = self.records[self.cursor]
				if not candidate.free and candidate.status == "pending" and candidate.nextRow <= candidate.count then record = candidate; break end
			end
			if record then
				local started = os.clock()
				local first = record.nextRow
				local count = math.min(self.chunkSize, record.count - first + 1)
				record.nextRow += count
				worker.busy, worker.ticket, worker.first, worker.count = true, record.ticket, first, count
				worker.generation += 1
				for _, column in worker.columns do table.clear(column) end
				for c, source in record.columns do
					local column = worker.columns[c] or {}
					worker.columns[c] = column
					table.move(source, first, first + count - 1, 1, column)
				end
				for c = #worker.columns, #record.columns + 1, -1 do worker.columns[c] = nil end
				self.counters.dispatchedChunks += 1
				local ok, message = pcall(self.transport.dispatch, self.transport, workerId, worker.generation, record.ticket, record.id, first, count, worker.columns)
				self.counters.dispatchSeconds += os.clock() - started
				if not ok then
					worker.busy = false
					self:_finish(record, "failed", "transport", tostring(message))
				end
			end
		end
	end
	self.pumping = false
end

function Pool:_finish(record, status, reason, message)
	if record.status ~= "pending" then return end
	record.status, record.reason, record.message = status, reason, message
	if status == "success" then self.counters.completed += 1
	elseif status == "cancelled" then self.counters.cancelled += 1
	else self.counters.failed += 1 end
	if status ~= "success" then table.clear(record.output) end
	self:_notify()
end

function Pool:_complete(workerId, generation, ticket, first, count, ok, result, kernelSeconds)
	if self.destroyed then return end
	local worker = self.workers[workerId]
	if not worker or not worker.busy or worker.generation ~= generation or worker.ticket ~= ticket then return end
	-- Reject duplicate/malformed completion without releasing another chunk's scratch.
	if worker.first ~= first or worker.count ~= count then return end
	self.counters.kernelSeconds += kernelSeconds or 0
	worker.busy = false
	local record = self.batches[ticket]
	if record and record.status == "pending" then
		if not ok then self:_finish(record, "failed", "kernel", tostring(result))
		else
			local valid = type(result) == "table"
			if valid then for i = 1, count do if result[i] == nil then valid = false; break end end end
			if not valid then self:_finish(record, "failed", "transport", "worker returned incomplete output")
			else
				table.move(result, 1, count, first, record.output)
				record.received += count
				if record.received == record.count then self:_finish(record, "success") end
			end
		end
	end
	self:_pump()
end

function Pool:cancel(ticket, reason)
	self:_check()
	local record = self.batches[ticket]
	if not record or record.status ~= "pending" then return false end
	self:_finish(record, "cancelled", reason or "cancelled", reason == "timeout" and "parallel barrier timed out" or "parallel job cancelled")
	self:_pump()
	return true
end

function Pool:barrier(ids, seconds)
	self:_canWait()
	seconds = timeout(seconds)
	for _, id in ids do assert(self.jobs[id], "[rovy/parallel] unregistered job") end
	local captured = {}
	for _, id in ids do
		assert(self.jobs[id], "[rovy/parallel] unregistered job")
		for _, ticket in self.order[id] do
			local record = self.batches[ticket]
			if record then
				record.holds = (record.holds or 0) + 1
				table.insert(captured, record)
			end
		end
	end
	return self:_waitRecords(captured, seconds)
end

function Pool:wait(ticket, seconds)
	self:_canWait()
	seconds = timeout(seconds)
	local record = self.batches[ticket]
	assert(record, "[rovy/parallel] unknown or consumed ticket")
	record.holds = (record.holds or 0) + 1
	return self:_waitRecords({record}, seconds)
end

function Pool:_waitRecords(records, seconds)
	local completed = self:_await(function()
		for _, record in records do if record.status == "pending" then return false end end
		return true
	end, seconds)
	local outcome = { ok = true }
	for _, record in records do
		if not completed and not self.destroyed and record.status == "pending" then self:cancel(record.ticket, "timeout") end
		if record.status ~= "success" then outcome.ok = false; outcome.message = record.message or "parallel pool destroyed" end
		record.holds -= 1
		if (record.consumed or self.destroyed) and record.holds == 0 then record.free = true; self:_clear(record) end
	end
	if self.destroyed then outcome.ok = false; outcome.message = "parallel pool destroyed" end
	return outcome
end

function Pool:_clear(record)
	table.clear(record.entities)
	table.clear(record.output)
	for _, column in record.columns do table.clear(column) end
	record.consumed = false
end

function Pool:_release(record)
	self.batches[record.ticket] = nil
	for _, entity in record.entities do
		if self.latest[record.id][entity] == record.ticket then self.latest[record.id][entity] = nil end
	end
	local queue = self.order[record.id]
	for i, ticket in queue do if ticket == record.ticket then table.remove(queue, i); break end end
	record.consumed = true
	if (record.holds or 0) == 0 then record.free = true; self:_clear(record) end
end

function Pool:poll(ticket, callback)
	self:_check()
	local record = self.batches[ticket]
	if not record or record.status == "pending" then return false end
	assert(not self.draining, "[rovy/parallel] nested drain is unsupported")
	self.draining = true
	local ok, message = Kernel.call(callback, { ticket = ticket, status = record.status, count = record.count, output = record.output, reason = record.reason, message = record.message })
	self.draining = false
	self:_release(record)
	if not ok then error(message, 0) end
	return true
end

function Pool:_drain(id, failures, callback, alive)
	self:_check()
	assert(not self.draining, "[rovy/parallel] nested drain is unsupported")
	local queue = self.order[id]
	assert(queue, "[rovy/parallel] unregistered job")
	local remaining = #queue
	local index = 1
	while index <= #queue and remaining > 0 do
		remaining -= 1
		local record = self.batches[queue[index]]
		if record.status == "pending" then break end
		if (record.status ~= "success") ~= failures then index += 1
		else
			self.draining = true
			local ok, message = Kernel.call(function()
				if failures then callback({ticket = record.ticket, jobId = id, reason = record.reason, message = record.message})
				else
					for row = 1, record.count do
						local entity = record.entities[row]
						if self.latest[id][entity] == record.ticket and (not alive or alive(entity)) then callback(entity, record.output[row])
						else self.counters.staleRows += 1 end
					end
				end
			end)
			self.draining = false
			self:_release(record)
			if not ok then error(message, 0) end
		end
	end
end

function Pool:drain(id, callback, alive) self:_drain(id, false, callback, alive) end
function Pool:drainFailures(id, callback) self:_drain(id, true, callback) end

function Pool:stats()
	local stats = table.clone(self.counters)
	stats.workers, stats.busyWorkers, stats.retainedBatches, stats.queuedRows = self.workerCount, 0, 0, 0
	for _, worker in self.workers do if worker.busy then stats.busyWorkers += 1 end end
	for _, record in self.records do
		if not record.free then
			stats.retainedBatches += 1
			if record.status == "pending" then stats.queuedRows += math.max(0, record.count - record.nextRow + 1) end
		end
	end
	return stats
end

function Pool:destroy()
	if self.destroyed then return end
	self.destroyed = true
	self.transport:destroy()
	for _, worker in self.workers do worker.busy = false; table.clear(worker.columns) end
	for _, record in self.records do
		if not record.free and record.status == "pending" then record.status, record.reason, record.message = "cancelled", "destroyed", "parallel pool destroyed" end
	end
	self:_notify()
	for _, record in self.records do if (record.holds or 0) == 0 then self:_clear(record); record.free = true end end
	table.clear(self.batches)
	for _, latest in self.latest do table.clear(latest) end
	for _, queue in self.order do table.clear(queue) end
	table.clear(self.localStates)
	table.clear(self.localOutputs)
end

return { WorkerPool = Pool }
