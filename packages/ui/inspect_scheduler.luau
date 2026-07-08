--!nocheck
local runtime = require("./test/harness/runtime")
local H = require("./test/harness/helpers").load(runtime)
H.reset()
local app = H.startedApp()
local q = app.scheduler.queries
print('type', type(q))
for k,v in pairs(q) do
  print('k', k, 'type', type(v), 'v', tostring(v))
end
