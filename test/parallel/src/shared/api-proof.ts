import {
	App, Commands, Entity, EventReader, EventWriter, Query, ResMut, SystemSet, World,
	component, event, monitor, observer, query, resource, schedule, set, system,
} from "@rovy/core";
import { JobReader, JobWriter, ParallelPlugin } from "@rovy/parallel";
import { RunService } from "@rbxts/services";
import { GroundProbe } from "./ground-probe.job";
import { NpcScore, scoreNpc } from "./npc-score.job";

@component
class SensorOrigin { constructor(public value: Vector3) {} }
@component
class Sensed { constructor(public grounded: boolean) {} }
@component
class Observed { constructor(public grounded: boolean) {} }
@component
class Score { constructor(public value: number) {} }
@event
class ProbeApplied { constructor(public entity: Entity, public grounded: boolean) {} }
@event
class ProbeBuffered { constructor(public entity: Entity, public grounded: boolean) {} }
@event
class SubmitScores {}
@event
class ReadScores {}
@resource
class ApiState {
	parallel?: ParallelPlugin;
	applied = 0;
	observed = 0;
	buffered = 0;
	scores = 0;
	monitorEntries = 0;
	guardChecks = 0;
	readonly target = new Vector3(100, 3, 100);
}
@schedule
class ApiSubmit {}
@schedule
class ApiApply {}
@set
class ApplyResults extends SystemSet {}
@set
class ConsumeEvents extends SystemSet {}

function check(condition: boolean, message: string): void { assert(condition, message); }

function checkWaitGuard(state: ApiState) {
	const [ok, message] = pcall(() => state.parallel!.barrier([], 0));
	check(!ok && string.find(tostring(message), "cannot yield inside ECS execution", 1, true)[0] !== undefined,
		"parallel wait was not blocked inside ECS callback");
	state.guardChecks++;
}

@system({ schedule: ApiSubmit })
class SubmitFromSystem {
	run(q: Query<[Entity, SensorOrigin]>, jobs: JobWriter<typeof GroundProbe>, state: ResMut<ApiState>) {
		checkWaitGuard(state);
		check(jobs.tryBatch((batch) => {
			q.forEach((entity, origin) => batch.push(entity, origin.value, new Vector3(0, -6, 0)));
		}) !== undefined, "system batch rejected");
	}
}
@system({ schedule: ApiApply, set: ApplyResults })
class ApplyFromSystem {
	run(jobs: JobReader<typeof GroundProbe>, commands: Commands, events: EventWriter<ProbeBuffered>, state: ResMut<ApiState>) {
		let count = 0;
		jobs.drain((entity, grounded) => {
			check(grounded, "raycast missed fixture ground");
			commands.set(entity, Sensed, new Sensed(grounded));
			commands.trigger(new ProbeApplied(entity, grounded));
			events.send(new ProbeBuffered(entity, grounded));
			state.applied++;
			count++;
		});
		jobs.drainFailures((failure) => error(failure.message));
		if (count > 0) commands.trigger(new SubmitScores());
	}
}
@observer({ event: ProbeApplied })
class ObserveAppliedResult {
	run(result: ProbeApplied, world: World, commands: Commands, state: ResMut<ApiState>) {
		checkWaitGuard(state);
		check(world.get(result.entity, Sensed)?.grounded === result.grounded, "observer ran before component write");
		commands.set(result.entity, Observed, new Observed(result.grounded));
		state.observed++;
	}
}
@observer({ event: SubmitScores })
class SubmitFromObserver {
	run(_event: SubmitScores, q: Query<[Entity, SensorOrigin]>, jobs: JobWriter<typeof NpcScore>, state: ResMut<ApiState>) {
		check(jobs.tryBatch((batch) => {
			q.forEach((entity, origin) => batch.push(entity, origin.value, state.target));
		}) !== undefined, "observer batch rejected");
	}
}
@observer({ event: ReadScores })
class DrainFromObserver {
	run(_event: ReadScores, jobs: JobReader<typeof NpcScore>, commands: Commands, state: ResMut<ApiState>) {
		checkWaitGuard(state);
		jobs.drain((entity, value) => {
			commands.set(entity, Score, new Score(value));
			state.scores++;
		});
		jobs.drainFailures((failure) => error(failure.message));
	}
}
@system({ schedule: ApiApply, set: ConsumeEvents })
class ReadBufferedResults {
	run(events: EventReader<ProbeBuffered>, world: World, state: ResMut<ApiState>) {
		events.forEach((result) => {
			check(world.get(result.entity, Observed)?.grounded === result.grounded, "event reader missed observer write");
			state.buffered++;
		});
	}
}
@monitor({ match: query<[Sensed]>() })
class ObserveComponentEntry {
	onEnter(_entity: Entity, _sensed: Sensed, state: ResMut<ApiState>) {
		checkWaitGuard(state);
		state.monitorEntries++;
	}
}

export function apiProof() {
	const parallel = new ParallelPlugin({ jobs: [GroundProbe, NpcScore], workers: 4, chunkSize: 16 });
	const state = new ApiState();
	state.parallel = parallel;
	const app = new App();
	app.insertResource(state).addPlugin(parallel);
	app.configureSets(ApiApply, [ApplyResults, ConsumeEvents]);
	app.start();
	const [ok, result] = pcall(() => {
		check(parallel.ready(10), "API workers not ready");
		const entities = new Array<Entity>();
		for (let i = 0; i < 97; i++) entities.push(app.world.spawn(new SensorOrigin(new Vector3(i, 3, 0))));
		// The second accepted snapshot supersedes the first. Delete/reuse one ID
		// before replies arrive; neither its stale handle nor replacement may apply.
		app.runSchedule(ApiSubmit);
		app.runSchedule(ApiSubmit);
		const removed = entities.pop()!;
		app.world.despawn(removed);
		const replacement = app.world.spawn();
		check(parallel.barrier([GroundProbe], 5).ok, "API sensing barrier failed");
		app.runSchedule(ApiApply);
		check(state.applied === 96 && state.observed === 96, "wrong system/observer count");
		check(state.monitorEntries === 96, "component monitor entry count differs");
		check(app.world.get(replacement, Sensed) === undefined, "stale entity generation applied");
		const finishScores = () => {
			check(parallel.barrier([NpcScore], 5).ok, "observer-submitted jobs failed");
			app.world.trigger(new ReadScores());
			app.flush();
		};
		finishScores();
		check(state.buffered === 96 && state.scores === 96, "event/observer-reader count differs");
		// Background sensing: ordinary schedule calls consume later completions.
		// No sensing barrier is used in this pass.
		app.runSchedule(ApiSubmit);
		const deadline = os.clock() + 5;
		let backgroundFrames = 0;
		while (state.applied < 192 && os.clock() < deadline) {
			RunService.Heartbeat.Wait();
			app.runSchedule(ApiApply);
			backgroundFrames++;
		}
		check(state.applied === 192, "background result delivery timed out");
		finishScores();
		check(state.observed === 192 && state.buffered === 192 && state.scores === 192, "background event chain incomplete");
		for (const entity of entities) {
			const origin = app.world.get(entity, SensorOrigin)!;
			check(app.world.get(entity, Score)?.value === scoreNpc(origin.value, state.target), "follow-up score mismatch");
		}
		const stats = parallel.stats();
		check(stats.retainedBatches === 0 && stats.busyWorkers === 0, "API pool did not settle");
		check(stats.staleRows === 98, "supersession/deletion filtering differs");
		return { applied: state.applied, observers: state.observed, bufferedEvents: state.buffered,
			observerResults: state.scores, monitorEntries: state.monitorEntries, guardChecks: state.guardChecks,
			backgroundFrames, stats };
	});
	parallel.destroy();
	if (!ok) error(tostring(result));
	return result;
}
