--!strict

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local function run()
	local RuntimeLib = require(ReplicatedStorage.rbxts_include.RuntimeLib)
	local bindingModule = RuntimeLib.import(
		script,
		ReplicatedStorage.RovyScribeBinding.binding
	)
	local schemaModule = RuntimeLib.import(
		script,
		ReplicatedStorage.RovyScribeBinding.schema
	)
	local nativeScribe = require(ReplicatedStorage.Scribe)
	local binding = bindingModule.NativeScribeBinding.new(nativeScribe)
	local capturedLog
	binding:addLogSink(function(entry)
		capturedLog = entry
	end)
	local template = binding:compileTemplate({
		Coins = schemaModule.s:int(0, {
			min = 0,
		}),
	})
	local transport = {
		Name = "RovyStudioCompatibility",
		SendToClient = function(_player: Player, _bytes: buffer) end,
		SendToAllClients = function(_bytes: buffer) end,
		ListenServer = function(_callback: (Player, buffer) -> ()) end,
		SendToServer = function(_bytes: buffer) end,
		ListenClient = function(_callback: (buffer) -> ()) end,
	}
	local bundle = binding:createBundle({
		Template = template,
		ProfileStoreIndex = "RovyScribeStudioCompatibility",
		ProfileKeyPrefix = "PLAYER_",
		Transport = transport,
		TransportChannel = "@rovy/scribe:studio-compat",
		StudioCompatibilityUnknownOption = true,
	})

	assert(binding.version == "1.0.11", "unexpected native Scribe version")
	assert(bundle.Client ~= nil, "wrapper binding did not construct the client bundle")
	assert(
		bundle.__ScribeTemplate == template,
		"wrapper did not preserve native Studio template metadata"
	)
	assert(table.isfrozen(template), "native Scribe did not freeze the template")
	assert(binding:status() == "Healthy", "native diagnostics status failed")
	local logs = binding:recentLogs({
		code = "UNKNOWN_OPTION",
		limit = 10,
	})
	assert(type(logs) == "table" and #logs >= 1, "native filtered log read failed")
	assert(type(binding:metrics()) == "table", "native metric read failed")
	assert(
		capturedLog ~= nil and capturedLog.Code == "UNKNOWN_OPTION",
		"native log sink did not receive the Studio diagnostic"
	)

	local hook = ReplicatedStorage:WaitForChild("_ScribeClientDebugHook", 5)
	assert(hook ~= nil, "native Scribe client debug hook did not attach")
	assert(hook:IsA("Folder"), "native Scribe client debug hook has the wrong class")
	assert(hook:FindFirstChild("Request") ~= nil, "debug hook request endpoint is absent")
	assert(hook:FindFirstChild("Stream") ~= nil, "debug hook stream endpoint is absent")

	ReplicatedStorage:SetAttribute("RovyScribeStudioCompatibility", "ok")
	print("ROVY_SCRIBE_STUDIO_COMPAT_OK", binding.version)
end

local ok, reason = xpcall(run, debug.traceback)
if not ok then
	ReplicatedStorage:SetAttribute(
		"RovyScribeStudioCompatibility",
		tostring(reason)
	)
	error(reason)
end
