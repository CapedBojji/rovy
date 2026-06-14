const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { assertNoDiagnostics, compileFixture } = require("./helpers");
const { generateBlink } = require("../scripts/generate-blink.js");

const source = `
import { schedule, system } from "@rovy/core";
import {
	NetClient,
	NetEventContext,
	NetFunc,
	NetFunctionReader,
	NetFunctionResponder,
	NetId,
	NetServer,
	netEvent,
	netFunction,
	rovyNet,
} from "@rovy/networking";

@netEvent({ direction: "clientToServer", channel: "reliable", receive: "send" })
class CastAbilityIntent {
	constructor(
		public caster: NetId,
		public abilityId: string,
		public target?: NetId,
	) {}
}

@netEvent({ direction: "serverToClient", channel: "unreliable", receive: "trigger" })
class PlayHitEffect {
	constructor(
		public target: NetId,
		public effectId: string,
	) {}
}

class FetchProfileResult {
	constructor(
		public displayName: string,
		public coins: number,
	) {}
}

@netFunction({ direction: "clientToServer", result: FetchProfileResult })
class FetchProfile {
	constructor(public userId: NetId) {}
}

@schedule class Update {}
@system({ schedule: Update })
class NetParams {
	run(_client: NetClient, _server: NetServer, _context: NetEventContext, _fetch: NetFunc<FetchProfile, FetchProfileResult>, _reader: NetFunctionReader<FetchProfile>, _responder: NetFunctionResponder) {}
}
`;

const result = compileFixture(source, {
	keepTemp: true,
	rovyConfig: {
		current: "dev",
		environments: {
			dev: {
				rojo: "test.project.json",
				boundaries: {
					client: ["src/client"],
					server: ["src/server"],
					shared: ["src/shared"],
				},
				net: {
					transport: "blink",
					strictBoundaryChecks: false,
					blink: {
						enabled: true,
						remoteScope: "ROVY_TEST",
						manualReplication: true,
						usePolling: true,
					},
				},
			},
		},
	},
});
assertNoDiagnostics(result, "blink integration fixture");

const schemas = [...result.printed.matchAll(/(?:blink|requestBlink|resultBlink): ("(?:[^"\\]|\\.)*")/g)].map((match) => JSON.parse(match[1]));
assert.equal(schemas.length, 4, "expected four generated Blink event/function declarations");

const temp = result.temp;
fs.writeFileSync(
	path.join(temp, "tsconfig.json"),
	JSON.stringify(
		{
			compilerOptions: {
				target: "ES2020",
				module: "CommonJS",
				moduleResolution: "Node",
				rootDir: "src",
				outDir: "out",
				experimentalDecorators: true,
				strict: true,
				skipLibCheck: true,
				types: [],
			},
			include: ["src/**/*"],
		},
		null,
		2,
	),
);
generateBlink(temp);

const generatedDir = path.join(temp, "out", "shared", "net", "generated");
const blinkSourcePath = path.join(generatedDir, "rovy.generated.blink");
const clientOutput = path.join(generatedDir, "RovyBlinkClient.luau");
const serverOutput = path.join(generatedDir, "RovyBlinkServer.luau");
const typesOutput = path.join(generatedDir, "RovyBlinkTypes.luau");

assert.ok(fs.existsSync(blinkSourcePath), `missing generated Blink source: ${blinkSourcePath}`);
const blinkSource = fs.readFileSync(blinkSourcePath, "utf8");
assert.match(blinkSource, /option RemoteScope = "ROVY_TEST"/);
for (const schema of schemas) {
	assert.match(blinkSource, new RegExp(schema.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

for (const output of [clientOutput, serverOutput, typesOutput]) {
	assert.ok(fs.existsSync(output), `missing Blink output: ${output}`);
	assert.ok(fs.statSync(output).size > 0, `empty Blink output: ${output}`);
}

const server = fs.readFileSync(serverOutput, "utf8");
const client = fs.readFileSync(clientOutput, "utf8");
assert.match(server, /CastAbilityIntent/);
assert.match(server, /FetchProfileRequest/);
assert.match(client, /PlayHitEffect/);
assert.match(client, /FetchProfileResult/);

fs.rmSync(temp, { recursive: true, force: true });

console.log("rovy-transformer Blink integration OK");
