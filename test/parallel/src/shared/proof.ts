import { App, Commands, Entity, Query, component, schedule, system } from "@rovy/core";
import { JobReader, JobWriter, ParallelPlugin } from "@rovy/parallel";
import { GroundProbe } from "./ground-probe.job";

@component
export class Position { constructor(public value: Vector3) {} }
@component
export class Grounded { constructor(public value: boolean) {} }
@schedule
export class SubmitSensing {}
@schedule
export class ApplySensing {}

@system({ schedule: SubmitSensing })
class SubmitGroundProbes {
	run(entities: Query<[Entity, Position]>, probes: JobWriter<typeof GroundProbe>) {
		probes.tryBatch((batch) => {
			entities.forEach((entity, position) => batch.push(entity, position.value, new Vector3(0, -6, 0)));
		});
	}
}

@system({ schedule: ApplySensing })
class ApplyGroundProbes {
	run(probes: JobReader<typeof GroundProbe>, commands: Commands) {
		probes.drain((entity, grounded) => commands.set(entity, Grounded, new Grounded(grounded)));
		probes.drainFailures((failure) => error(failure.message));
	}
}

/** Invoke each update after readiness; consumes earlier completed submissions. */
export function backgroundStep(app: App, dt: number) {
	app.runSchedule(ApplySensing, dt);
	app.runSchedule(SubmitSensing, dt);
}

/** Invoke from one serialized outer driver, never from a system. */
export function barrierStep(app: App, parallel: ParallelPlugin, dt: number) {
	app.runSchedule(SubmitSensing, dt);
	const outcome = parallel.barrier([GroundProbe], 5);
	app.runSchedule(ApplySensing, dt);
	return outcome;
}

export function proof() {
	const parallel = new ParallelPlugin({ jobs: [GroundProbe], workers: 4, chunkSize: 64 });
	const app = new App();
	app.addPlugin(parallel);
	app.start();
	const [ok, failure] = pcall(() => {
		assert(parallel.ready(10), "worker startup failed");
		const entities = new Array<Entity>();
		for (let i = 0; i < 257; i++) entities.push(app.world.spawn(new Position(new Vector3(i, 3, 0))));
		for (let pass = 0; pass < 3; pass++) {
			assert(barrierStep(app, parallel, 1 / 60).ok, "probe barrier failed");
			for (const entity of entities) assert(app.world.get(entity, Grounded)?.value === true, "ground result mismatch");
		}
		assert(parallel.stats().retainedBatches === 0, "result storage retained");
	});
	parallel.destroy();
	if (!ok) error(tostring(failure));
	return "ROVY_PARALLEL_ECS_OK";
}
