import { App, Commands, Entity, Query, Res, component, resource, schedule, system } from "@rovy/core";
import { WorkerPool } from "@rovy/parallel";
import { HttpService, RunService, Workspace } from "@rbxts/services";
import { Position } from "./proof";
import { GroundProbe } from "./ground-probe.job";
import { NpcScore, scoreNpc } from "./npc-score.job";
import { FrameProbe } from "./frame-probe.job";

@component
class Answer { constructor(public value: boolean | number) {} }
@resource
class BenchState {
	pool?: WorkerPool;
	kind: "raycast" | "npc" = "raycast";
	direct = true;
	readonly target = new Vector3(100, 3, 100);
	readonly down = new Vector3(0, -6, 0);
	readonly params = GroundProbe.setup!();
}
@schedule
class BenchSubmit {}
@schedule
class BenchApply {}
@system({ schedule: BenchSubmit })
class SubmitBenchmark {
	run(q: Query<[Entity, Position]>, state: Res<BenchState>, commands: Commands) {
		if (state.direct) {
			q.forEach((entity, position) => {
				const answer = state.kind === "raycast"
					? Workspace.Raycast(position.value, state.down, state.params) !== undefined
					: scoreNpc(position.value, state.target);
				commands.set(entity, Answer, new Answer(answer));
			});
		} else {
			const id = state.kind === "raycast" ? GroundProbe.__id : NpcScore.__id;
			const ticket = state.pool!.tryBatch(id, (batch) => {
				q.forEach((entity, position) => batch.push(entity, position.value, state.kind === "raycast" ? state.down : state.target));
			});
			assert(ticket !== undefined, "benchmark submission rejected");
		}
	}
}
@system({ schedule: BenchApply })
class ApplyBenchmark {
	run(state: Res<BenchState>, commands: Commands) {
		const id = state.kind === "raycast" ? GroundProbe.__id : NpcScore.__id;
		state.pool!.drain(id, (entity, value) => commands.set(entity as Entity, Answer, new Answer(value as boolean | number)));
		state.pool!.drainFailures(id, (failure) => error(failure.message));
	}
}

function percentile(values: number[], fraction: number): number {
	values.sort((a, b) => a < b);
	return values[math.max(0, math.ceil(values.size() * fraction) - 1)] ?? 0;
}

/** Run one side at a time in the isolated place. No native compilation on either baseline. */
export function runBenchmarks(samples = 20, sizes = [256, 2048, 8192]) {
	const reports = new Array<object>();
	for (const kind of ["raycast", "npc"] as const) {
		for (const rows of sizes) {
			const state = new BenchState();
			state.kind = kind;
			const app = new App();
			app.insertResource(state).start();
			const entities = new Array<Entity>();
			for (let i = 0; i < rows; i++) entities.push(app.world.spawn(new Position(new Vector3(i % 256, 3, math.floor(i / 256)))));
			const baseline = new Array<boolean | number>();
			const configurations = [{ mode: "direct", workers: 1, chunkSize: 256 }, { mode: "serial-package", workers: 1, chunkSize: 256 }];
			for (const workers of [1, 2, 4, 8, 16, 32]) for (const chunkSize of [64, 256, 1024]) configurations.push({mode: "parallel", workers, chunkSize});
			for (const config of configurations) {
				state.direct = config.mode === "direct";
				const selected = kind === "raycast" ? GroundProbe : NpcScore;
				const pool = state.direct ? undefined : new WorkerPool({
					jobs: [{ ...selected, serialBelow: config.mode === "serial-package" ? rows + 1 : 0 }],
					workers: config.workers, chunkSize: config.chunkSize,
				});
				state.pool = pool;
				const [ok, failure] = pcall(() => {
					if (pool !== undefined) assert(pool.ready(10), "benchmark workers not ready");
					const totalMs = new Array<number>();
					const submitMs = new Array<number>();
					const waitMs = new Array<number>();
					const applyMs = new Array<number>();
					const frameMs = new Array<number>();
					let sameFrame = 0;
					let memoryStart = 0;
					for (let trial = -5; trial < samples; trial++) {
						const [dt] = RunService.Heartbeat.Wait();
						if (trial === 0) memoryStart = gcinfo();
						const frame = RunService.FrameNumber;
						const start = os.clock();
						app.runSchedule(BenchSubmit, dt);
						const submitted = os.clock();
						if (pool !== undefined) assert(pool.barrier([selected.__id], 5).ok, "benchmark barrier failed");
						const returned = os.clock();
						if (pool !== undefined) app.runSchedule(BenchApply, dt);
						const finish = os.clock();
						if (trial >= 0) {
							totalMs.push((finish - start) * 1000);
							submitMs.push((submitted - start) * 1000);
							waitMs.push((returned - submitted) * 1000);
							applyMs.push((finish - returned) * 1000);
							frameMs.push(dt * 1000);
							if (frame === RunService.FrameNumber) sameFrame++;
						}
					}
					for (let i = 0; i < entities.size(); i++) {
						const value = app.world.get(entities[i], Answer)!.value;
						if (state.direct) baseline[i] = value;
						else assert(value === baseline[i], "parallel result differs from serial ECS baseline");
					}
					const report = {
						kind, rows, ...config, samples, signal: game.GetAttribute("ParallelSignalMode"),
						side: RunService.IsServer() ? "server" : "client",
						p50Ms: percentile(totalMs, 0.5), p95Ms: percentile(totalMs, 0.95),
						submitP95Ms: percentile(submitMs, 0.95), waitP95Ms: percentile(waitMs, 0.95), applyP95Ms: percentile(applyMs, 0.95),
						frameP95Ms: percentile(frameMs, 0.95), sameFrameRate: sameFrame / samples,
						heapDeltaKB: gcinfo() - memoryStart, pool: pool?.stats(),
					};
					reports.push(report);
					print(`ROVY_PARALLEL_BENCH ${HttpService.JSONEncode(report)}`);
				});
				pool?.destroy();
				if (!ok) error(tostring(failure));
			}
		}
	}
	return reports;
}

export function runTimingProbe(samples = 20) {
	const pool = new WorkerPool({ jobs: [FrameProbe], workers: 4, chunkSize: 64 });
	const results = new Array<object>();
	const [ok, failure] = pcall(() => {
		assert(pool.ready(10), "timing workers not ready");
		for (const operations of [1, 10000]) for (const rows of [1, 257]) {
			const input = new Array<number>();
			for (let i = 0; i < rows; i++) input.push(operations);
			for (let trial = -3; trial < samples; trial++) {
				RunService.PreSimulation.Wait();
				const submitFrame = RunService.FrameNumber;
				const submitTime = os.clock();
				const ticket = pool.submit(FrameProbe.__id, {columns: [input], count: rows})!;
				assert(ticket !== undefined && pool.wait(ticket, 5).ok, "timing round trip failed");
				const completeTime = os.clock();
				const completeFrame = RunService.FrameNumber;
				pool.poll(ticket, (result) => {
					if (trial < 0) return;
					const first = result.output[0] as { start: number; finish: number; frame: number };
					results.push({trial, operations, rows, submitFrame, completeFrame, workerFrame: first.frame,
						submitTime, workerStart: first.start, workerFinish: first.finish, completeTime,
						applyTime: os.clock(), applyFrame: RunService.FrameNumber,
						signal: game.GetAttribute("ParallelSignalMode"), side: RunService.IsServer() ? "server" : "client"});
				});
			}
		}
	});
	pool.destroy();
	if (!ok) error(tostring(failure));
	print(`ROVY_PARALLEL_TIMING ${HttpService.JSONEncode(results)}`);
	return results;
}
