--!nocheck
-- Phase 16 — extension params. Packages outside @rovy/core can provide
-- injected values through stable ids without adding package-specific kinds to
-- the core contract.

return function(TS, t)
	local rovy = (TS.loadPath("out/rovy") :: any).rovy
	local App = (TS.loadPath("out/runtime/app") :: any).App

	local function sysClass(runFn)
		local C = {}
		C.__index = C
		C.new = function() return setmetatable({}, C) end
		C.run = function(self, ...) return runFn(self, ...) end
		return C
	end

	local Update = {}

	t.describe("Phase 16 — external injected params", function()
		t.it("systems receive package-provided params by stable id", function()
			rovy:__reset()
			rovy:__schedule(Update, { runOnStart = false })
			local injected = { label = "net-client" }
			local seen = nil
			local Sys = sysClass(function(_, value)
				seen = value
			end)
			rovy:__system(Sys, {
				id = "t/Sys",
				schedule = Update,
				params = { { kind = "external", id = "@rovy/networking/NetClient" } },
			})
			local app = App.new()
			app:insertParam("@rovy/networking/NetClient", injected)
			app:start()
			app:runSchedule(Update)
			t.expect(seen).toBe(injected)
		end)

		t.it("missing external params fail loudly", function()
			rovy:__reset()
			rovy:__schedule(Update, { runOnStart = false })
			local Sys = sysClass(function() end)
			rovy:__system(Sys, {
				id = "t/Sys",
				schedule = Update,
				params = { { kind = "external", id = "missing" } },
			})
			local app = App.new()
			app:start()
			local ok, err = pcall(function()
				app:runSchedule(Update)
			end)
			t.expect(ok).toBeFalsy()
			t.expect(tostring(err):find("missing external injected param 'missing'") ~= nil).toBeTruthy()
		end)
	end)
end
