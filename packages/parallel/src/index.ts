import { type App, type Entity } from "@rovy/core";
import { WorkerPool, type BarrierOutcome, type JobFailure, type JobTicket, type PoolOptions, type PoolStats } from "./pool";
import type { AnyJob, JobInputs, JobOutput } from "./worker";

export { WorkerPool } from "./pool";
export type { BarrierOutcome, JobFailure, JobTicket, PoolOptions, PoolStats, RawBatch, BatchResult, WorkerRegistration } from "./pool";
export type { AnyJob, JobDefinition, JobInput, JobInputs, JobOutput } from "./worker";

export interface BatchWriter<J extends AnyJob> {
	/** Only valid inside tryBatch's synchronous fill callback. */
	push(entity: Entity, ...inputs: JobInputs<J>): void;
}
export interface JobWriter<J extends AnyJob> {
	tryBatch(fill: (batch: BatchWriter<J>) => void): JobTicket | undefined;
}
export interface JobReader<J extends AnyJob> {
	/** Reference-valued outputs are borrowed until the callback returns. */
	drain(callback: (entity: Entity, output: JobOutput<J>) => void): void;
	drainFailures(callback: (failure: JobFailure) => void): void;
}
export interface ParallelPluginOptions extends Omit<PoolOptions, "jobs" | "assertCanWait"> {
	readonly jobs: ReadonlyArray<AnyJob>;
}

export class ParallelPlugin {
	private pool?: WorkerPool;
	constructor(private readonly options: ParallelPluginOptions) {}
	build(app: App): void {
		assert(this.pool === undefined, "[rovy/parallel] one plugin instance belongs to one App");
		app.enforceSynchronousExecution();
		const pool = new WorkerPool({
			...this.options,
			assertCanWait: () => app.assertCanYield("parallel wait"),
		});
		this.pool = pool;
		const alive = (entity: number) => app.world.jecs.contains(entity);
		for (const job of this.options.jobs) {
			const writer: JobWriter<AnyJob> = {
				tryBatch(fill) { return pool.tryBatch(job.__id, fill as never); },
			};
			const reader: JobReader<AnyJob> = {
				drain(callback) { pool.drain(job.__id, callback as never, alive); },
				drainFailures(callback) { pool.drainFailures(job.__id, callback); },
			};
			app.insertParam(`@rovy/parallel/writer:${job.__id}`, writer);
			app.insertParam(`@rovy/parallel/reader:${job.__id}`, reader);
		}
	}
	private runtime(): WorkerPool {
		assert(this.pool !== undefined, "[rovy/parallel] add plugin and start App before using it");
		return this.pool;
	}
	ready(timeoutSeconds = 5): boolean { return this.runtime().ready(timeoutSeconds); }
	barrier(jobs: ReadonlyArray<AnyJob>, timeoutSeconds = 5): BarrierOutcome {
		return this.runtime().barrier(jobs.map((job) => job.__id), timeoutSeconds);
	}
	cancel(ticket: JobTicket): boolean { return this.runtime().cancel(ticket); }
	stats(): PoolStats { return this.runtime().stats(); }
	destroy(): void { this.pool?.destroy(); }
}
