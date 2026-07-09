--!nocheck
local runtime = require("./packages/ui/test/harness/runtime")
local TS = runtime.loadPath("./packages/ui/test/run.luau")
local H = require("./packages/ui/test/harness/helpers").load(TS)
H.reset()
local app = H.startedApp()
print('scheduler', type(app.scheduler))
print('scheduler queries', type(app.scheduler and app.scheduler.queries))
if app.scheduler and app.scheduler.queries then
  print('hasSet', type((app.scheduler.queries).set))
  print('hasGet', type((app.scheduler.queries).get))
else
  print('no queries')
end
