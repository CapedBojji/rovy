const assert = require("node:assert/strict");
const { assertNoDiagnostics, compileFixture } = require("./helpers");

function runCase(name, fn) {
	try {
		fn();
		console.log(`ok  ${name}`);
	} catch (error) {
		console.error(`not ok  ${name}`);
		throw error;
	}
}

const header = `
import {
	Commands,
	Entity,
	EventReader,
	EventWriter,
	Local,
	OptRes,
	Query,
	Res,
	ResMut,
	Trait,
	With,
	Without,
	Added,
	Changed,
	Removed,
	component,
	event,
	monitor,
	observer,
	query,
	resource,
	relation,
	rovy,
	schedule,
	system,
	trait,
} from "@rovy/core";
`;

runCase("bare decorators inject registry calls", () => {
	const result = compileFixture(`
${header}
@component class Unit {}
@resource class Clock { constructor(public tick = 0) {} }
@event({ capacity: 8 }) class DamageTaken {}
@relation({ exclusive: true }) class ChildOf {}
@schedule({ runOnStart: true }) class Update {}
`);
	assertNoDiagnostics(result, "decorator injection");
	assert.match(result.printed, /__component\(Unit,/);
	assert.match(result.printed, /__resource\(Clock,/);
	assert.match(result.printed, /__event\(DamageTaken,/);
	assert.match(result.printed, /__relation\(ChildOf,/);
	assert.match(result.printed, /__schedule\(Update,/);
});

runCase("system query and injection params lower into descriptors", () => {
	const result = compileFixture(`
${header}
@schedule class Update {}
@component class Unit {}
@component class Dead {}
@component class Health {}
@resource class Clock { constructor(public tick = 0) {} }
@event() class DamageTaken {}
@system({ schedule: Update })
class TickSystem {
	run(
		commands: Commands,
		world: World,
		queryA: Query<[Entity, Health], With<Unit>, Without<Dead>, Changed<Health>, Added<Health>, Removed<Dead>>,
		clock: Res<Clock>,
		clockMut: ResMut<Clock>,
		maybeClock: OptRes<Clock>,
		reader: EventReader<DamageTaken>,
		writer: EventWriter<DamageTaken>,
		cache: Local<{ count: number }>,
	) {}
}
`);
	assertNoDiagnostics(result, "system params");
	assert.match(result.printed, /kind: "commands"/);
	assert.match(result.printed, /kind: "world"/);
	assert.match(result.printed, /kind: "query"/);
	assert.match(result.printed, /kind: "res"/);
	assert.match(result.printed, /kind: "resMut"/);
	assert.match(result.printed, /kind: "optRes"/);
	assert.match(result.printed, /kind: "eventReader"/);
	assert.match(result.printed, /kind: "eventWriter"/);
	assert.match(result.printed, /kind: "local"/);
	assert.match(result.printed, /with: \[Unit\]/);
	assert.match(result.printed, /without: \[Dead\]/);
	assert.match(result.printed, /changed: \[Health\]/);
	assert.match(result.printed, /added: \[Health\]/);
	assert.match(result.printed, /removed: \[Dead\]/);
});

runCase("traits and pairs lower in query descriptors and trait macro rewrites", () => {
	const result = compileFixture(`
${header}
interface CrowdControl {}
@component class Stunned implements CrowdControl {}
@relation class ChildOf {}
@schedule class Update {}
@system({ schedule: Update })
class TraitSystem {
	run(queryA: Query<[Entity, Trait<CrowdControl>, Pair<ChildOf>]>) {
		const token = trait<CrowdControl>();
		print(queryA, token);
	}
}
`);
	assertNoDiagnostics(result, "traits and pairs");
	assert.match(result.printed, /__traitImpl\("src\/main", Stunned\)/);
	assert.match(result.printed, /traitToken\("src\/main"\)/);
	assert.match(result.printed, /t: "trait"/);
	assert.match(result.printed, /t: "pair"/);
});

runCase("monitor match query and term params lower separately", () => {
	const result = compileFixture(`
${header}
@component class Unit {}
@component class Health {}
@schedule class Update {}
@monitor({ match: query<[Entity, Health], With<Unit>>() })
class HealthMonitor {
	onEnter(entity: Entity, health: Health, commands: Commands) {}
}
`);
	assertNoDiagnostics(result, "monitor lowering");
	assert.match(result.printed, /__query\(\{ id: "src\/main:match"/);
	assert.match(result.printed, /__monitor\(HealthMonitor, \{ match: "src\/main:match"/);
	assert.match(result.printed, /kind: "entity"/);
	assert.match(result.printed, /kind: "term", index: 1/);
	assert.match(result.printed, /kind: "commands"/);
});

runCase("observer event param lowers to kind event", () => {
	const result = compileFixture(`
${header}
@event() class DamageTaken {}
@observer({ event: DamageTaken, priority: 2 })
class DamageObserver {
	run(event: DamageTaken, commands: Commands) {}
}
`);
	assertNoDiagnostics(result, "observer lowering");
	assert.match(result.printed, /priority: 2/);
	assert.match(result.printed, /kind: "event"/);
	assert.match(result.printed, /kind: "commands"/);
});

runCase("loadPaths string lowers through rojo path", () => {
	const result = compileFixture(`
${header}
rovy.loadPaths("src");
`);
	assertNoDiagnostics(result, "loadPaths lowering");
	assert.match(result.printed, /game\.GetService\("ReplicatedStorage"\)/);
	assert.match(result.printed, /WaitForChild\("game"\)/);
});

runCase("resource ctor validation catches required params", () => {
	const result = compileFixture(`
${header}
@resource
class Clock {
	constructor(public tick: number) {}
}
`);
	assert.match(result.diagnostics.join("\n"), /constructor params must be optional or defaulted/);
});

runCase("generic system validation fires", () => {
	const result = compileFixture(`
${header}
@schedule class Update {}
@system({ schedule: Update })
class GenericSystem<T> {
	run(commands: Commands) {}
}
`);
	assert.match(result.diagnostics.join("\n"), /cannot be generic/);
});

runCase("monitor match must use query macro", () => {
	const result = compileFixture(`
${header}
@component class Health {}
@monitor({ match: "bad" as never })
class BadMonitor {
	onEnter(health: Health) {}
}
`);
	assert.match(result.diagnostics.join("\n"), /requires match: query<\.\.\.\>\(\)/);
});

runCase("unsupported bare param type surfaces diagnostic", () => {
	const result = compileFixture(`
${header}
@schedule class Update {}
class Plain {}
@system({ schedule: Update })
class BadSystem {
	run(plain: Plain) {}
}
`);
	assert.match(result.diagnostics.join("\n"), /unsupported injected param type/);
});

console.log("rovy-transformer cases OK");
