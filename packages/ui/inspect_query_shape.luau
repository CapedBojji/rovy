--!nocheck
local runtime = require("./test/harness/runtime")
local H = require("./test/harness/helpers").load(runtime)
H.reset()
local app = H.startedApp()
local target = H.target()
local entity = app.world:spawn()
local narrow = { size = 1 }
local counts = { members = 0, rowFor = 0 }
app.scheduler.queries["q#shape"] = {
	members = function()
		counts.members += 1
		return { entity }
	end,
	rowFor = function(actual)
		counts.rowFor += 1
		if actual ~= entity then return nil end
		if narrow.size == 1 then
			return { values = { [1] = "a" }, n = 1 }
		end
		return { values = { [1] = "a", [2] = "b" }, n = 2 }
	end,
	size = function()
		return 1
	end,
}
local stats = { renders = 0 }
local qdesc = H.queryTrigger({ on = { "changed" } })
qdesc.handle = "q#shape"
local Comp = H.uiClass("test/QueryShapeRow", function()
	stats.renders += 1
	return H.textLabel({ Name = "Status", Text = "renders=" .. tostring(stats.renders) })
end, {
	triggers = { qdesc },
})
H.mountUi(app, Comp, { target = target })
print("initial", stats.renders, counts.members, counts.rowFor)
narrow.size = 2
app.world:spawn()
H.settle(app)
print("after", stats.renders, counts.members, counts.rowFor)
