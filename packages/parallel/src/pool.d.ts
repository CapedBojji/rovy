import type { AnyJob } from "./worker";
export type JobTicket = number & { readonly __jobTicket: unique symbol };
export interface JobFailure {
	readonly ticket: JobTicket;
	readonly jobId: string;
	readonly reason: "setup" | "kernel" | "transport" | "cancelled" | "timeout" | "destroyed";
	readonly message: string;
}
export interface BarrierOutcome { readonly ok: boolean; readonly message?: string }
export interface PoolStats {
	readonly workers: number;
	readonly busyWorkers: number;
	readonly retainedBatches: number;
	readonly queuedRows: number;
	readonly submitted: number;
	readonly completed: number;
	readonly failed: number;
	readonly cancelled: number;
	readonly rejected: number;
	readonly staleRows: number;
	readonly dispatchedChunks: number;
	/** Sum across all completed worker chunks, not wall time. */
	readonly kernelSeconds: number;
	/** Main-thread chunk preparation and SendMessage call duration. */
	readonly dispatchSeconds: number;
}
export interface WorkerRegistration {
	readonly id: string;
	readonly module: ModuleScript;
	readonly exportName: string;
	readonly inputCount: number;
}
export interface PoolOptions {
	readonly jobs: ReadonlyArray<AnyJob | WorkerRegistration>;
	readonly workers?: number;
	readonly chunkSize?: number;
	readonly maxBatches?: number;
	readonly maxRows?: number;
	/** Integration guard, invoked before any yielding wait. */
	readonly assertCanWait?: () => void;
}
export interface RawBatch {
	readonly columns: ReadonlyArray<ReadonlyArray<unknown>>;
	readonly count: number;
}
export interface BatchResult {
	readonly ticket: JobTicket;
	readonly status: "success" | "failed" | "cancelled";
	readonly output: ReadonlyArray<unknown>;
	readonly count: number;
	readonly reason?: JobFailure["reason"];
	readonly message?: string;
}
export interface RawBatchWriter { push(entity: number, ...inputs: unknown[]): void }
export declare class WorkerPool {
	constructor(options: PoolOptions);
	ready(timeoutSeconds?: number): boolean;
	submit(jobId: string, batch: RawBatch): JobTicket | undefined;
	tryBatch(jobId: string, fill: (batch: RawBatchWriter) => void): JobTicket | undefined;
	poll(ticket: JobTicket, callback: (result: BatchResult) => void): boolean;
	wait(ticket: JobTicket, timeoutSeconds?: number): BarrierOutcome;
	barrier(jobIds: ReadonlyArray<string>, timeoutSeconds?: number): BarrierOutcome;
	cancel(ticket: JobTicket): boolean;
	drain(jobId: string, callback: (entity: number, result: unknown) => void, alive?: (entity: number) => boolean): void;
	drainFailures(jobId: string, callback: (failure: JobFailure) => void): void;
	stats(): PoolStats;
	destroy(): void;
}
