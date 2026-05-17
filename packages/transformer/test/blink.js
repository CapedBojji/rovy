const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { assertNoDiagnostics, compileFixture } = require("./helpers");

const source = `
import { schedule, system } from "@rovy/core";
import {
	NetClient,
	NetEventContext,
	NetId,
	NetServer,
	netEvent,
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

@schedule class Update {}
@system({ schedule: Update })
class NetParams {
	run(_client: NetClient, _server: NetServer, _context: NetEventContext) {}
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

const schemas = [...result.printed.matchAll(/blink: ("(?:[^"\\]|\\.)*")/g)].map((match) => JSON.parse(match[1]));
assert.equal(schemas.length, 2, "expected two generated Blink event declarations");

const temp = result.temp;
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
assert.match(client, /PlayHitEffect/);

fs.rmSync(temp, { recursive: true, force: true });

console.log("rovy-transformer Blink integration OK");
