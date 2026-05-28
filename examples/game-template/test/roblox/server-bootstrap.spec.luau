return function()
	local ReplicatedStorage = game:GetService("ReplicatedStorage")

	describe("game template bootstrap", function()
		it("starts Rovy app through real Rojo shared module tree", function()
			local TS = ReplicatedStorage:WaitForChild("TS")
			local bootstrap = require(TS:WaitForChild("bootstrap"))
			local result = bootstrap.runTemplateSmoke()
			assert(result.started == true, "server bootstrap smoke failed")
		end)
	end)
end
