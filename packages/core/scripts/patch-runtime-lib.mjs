import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outputPath = resolve("out/init.luau");
const source = readFileSync(outputPath, "utf8");
const header = "local TS = _G[script]\n";
const runtimeFallback = `${header}-- @rovy/runtime-lib-fallback:start
if type(TS) ~= "table" or type(TS.import) ~= "function" then
	local current = script
	while current do
		local include = current:FindFirstChild("TS") or current:FindFirstChild("rbxts_include")
		local runtime = include and include:FindFirstChild("RuntimeLib")
		if runtime then
			TS = require(runtime)
			break
		end
		current = current.Parent
	end
end
assert(type(TS) == "table" and type(TS.import) == "function", "@rovy/core: RuntimeLib not found; map RuntimeLib under ReplicatedStorage.TS or ReplicatedStorage.rbxts_include")
-- @rovy/runtime-lib-fallback:end
`;

const withoutExistingFallback = source.replace(
	/-- @rovy\/runtime-lib-fallback:start\n[\s\S]*?-- @rovy\/runtime-lib-fallback:end\n/g,
	"",
);

if (!withoutExistingFallback.includes(header)) {
	throw new Error(`Unexpected @rovy/core entry header in ${outputPath}`);
}

writeFileSync(outputPath, withoutExistingFallback.replace(header, runtimeFallback));
