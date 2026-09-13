local Transport = {}
Transport.__index = Transport

function Transport.new()
	return setmetatable({ actors = {}, destroyed = false }, Transport)
end

function Transport:start(jobs, workerCount, ready, complete)
	local runService = game:GetService("RunService")
	local isServer = runService:IsServer()
	local parent = isServer and game:GetService("ServerScriptService")
		or game:GetService("Players").LocalPlayer:WaitForChild("PlayerScripts")
	local folder = Instance.new("Folder")
	folder.Name = "RovyParallel"
	self.folder = folder
	local completion = Instance.new("BindableEvent")
	completion.Name = "Completion"
	completion.Parent = folder
	self.completion = completion
	local registrations = {}
	for id, job in jobs do
		table.insert(registrations, { id = id, module = job.__module, exportName = job.__exportName, inputCount = job.__inputCount })
	end
	self.connection = completion.Event:Connect(function(kind, worker, ...)
		if self.destroyed then return end
		if kind == "boot" then
			self.actors[worker]:SendMessage("RovyInitialize", registrations)
		elseif kind == "ready" then ready(worker, ...)
		elseif kind == "result" then complete(worker, ...) end
	end)
	-- Server and client templates have separate containers to avoid Rojo name collisions.
	local templates = script.Parent.templates[isServer and "server" or "client"]
	local template = templates:FindFirstChild("worker")
	assert(template, "[rovy/parallel] packaged worker template missing; rebuild @rovy/parallel")
	for index = 1, workerCount do
		local actor = Instance.new("Actor")
		actor.Name = "Worker" .. index
		actor:SetAttribute("WorkerIndex", index)
		self.actors[index] = actor
		local eventRef = Instance.new("ObjectValue")
		eventRef.Name, eventRef.Value, eventRef.Parent = "Completion", completion, actor
		local kernelRef = Instance.new("ObjectValue")
		kernelRef.Name, kernelRef.Value, kernelRef.Parent = "Kernel", script.Parent.kernel, actor
		local worker = template:Clone()
		worker.Parent = actor
		actor.Parent = folder
		worker.Disabled = false
	end
	-- Parenting last makes every worker's initial state and reply listener ready.
	folder.Parent = parent
end

function Transport:dispatch(worker, generation, ticket, job, first, count, columns)
	self.actors[worker]:SendMessage("RovyExecute", generation, ticket, job, first, count, columns)
end
function Transport:flush() end
function Transport:destroy()
	if self.destroyed then return end
	self.destroyed = true
	if self.connection then self.connection:Disconnect() end
	if self.folder then self.folder:Destroy() end
	table.clear(self.actors)
end
return Transport
