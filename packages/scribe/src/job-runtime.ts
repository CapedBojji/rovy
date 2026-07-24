import type {
	ScribeJobHandle,
	ScribeJobResult,
} from "./types";
import {
	cloneScribeValue,
	freezeScribeValue,
} from "./reader-tree";
import type { ScribeEventRuntime } from "./event-runtime";
import type { ScribeInstalledBundle } from "./runtime";

type UnknownTable = Record<string | number, unknown>;

export interface ScribeJobOwner {
	readonly key: string;
	readonly dataId: string;
}

interface InternalJobHandle extends ScribeJobHandle<unknown> {
	readonly ownerKey: string;
	readonly dataId: string;
}

interface PendingJob {
	readonly handle: InternalJobHandle;
	readonly owner: ScribeJobOwner;
	readonly player?: Player;
	readonly execute?: () => ScribeJobResult<unknown>;
	started: boolean;
	canceled: boolean;
	completionQueued: boolean;
}

interface JobCompletion {
	readonly handleId: number;
	readonly result: ScribeJobResult<unknown>;
}

interface StoredJobResult {
	readonly handle: InternalJobHandle;
	readonly ownerKey: string;
	readonly result: ScribeJobResult<unknown>;
}

/**
 * One app-local bridge for every yielding Scribe feature API. Calls only
 * allocate handles. Native work starts after the current Scribe write queue
 * commits, and task completions become polling results and Rovy events at a
 * later flush pass.
 */
export class ScribeJobRuntime {
	private readonly bundleById = new Map<string, ScribeInstalledBundle>();
	private readonly pending = new Map<number, PendingJob>();
	private readonly queued = new Array<number>();
	private readonly completions = new Array<JobCompletion>();
	private readonly results = new Map<number, StoredJobResult>();
	private nextHandleId = 0;

	constructor(
		private readonly boundary: "client" | "server",
		bundles: ReadonlyArray<ScribeInstalledBundle>,
		private readonly events: ScribeEventRuntime,
	) {
		for (const bundle of bundles) {
			this.bundleById.set(bundle.definition.id, bundle);
		}
		if (boundary === "server") this.connectSessionCancellation();
	}

	owner(service: string, dataId: string): ScribeJobOwner {
		return table.freeze({
			key: `${service}:${dataId}`,
			dataId,
		});
	}

	enqueue<T>(
		owner: ScribeJobOwner,
		operation: string,
		execute: () => ScribeJobResult<T>,
		player?: Player,
	): ScribeJobHandle<T> {
		const handle = this.allocate(
			owner,
			operation,
			player,
			execute as () => ScribeJobResult<unknown>,
			false,
		);
		this.queued.push(handle.id);
		return handle as ScribeJobHandle<T>;
	}

	reserveBuffered<T>(
		owner: ScribeJobOwner,
		operation: string,
		player: Player,
	): ScribeJobHandle<T> {
		return this.allocate(
			owner,
			operation,
			player,
			undefined,
			true,
		) as ScribeJobHandle<T>;
	}

	completeBuffered<T>(
		owner: ScribeJobOwner,
		handle: ScribeJobHandle<T>,
		result: ScribeJobResult<T>,
	): void {
		const pending = this.pending.get(handle.id);
		assert(
			pending !== undefined &&
				pending.handle === handle &&
				pending.owner.key === owner.key,
			"[rovy/scribe] cannot complete an unknown or foreign buffered job handle",
		);
		assert(
			!pending.canceled &&
				!pending.completionQueued &&
				!this.results.has(handle.id),
			"[rovy/scribe] buffered job completed more than once",
		);
		this.queueCompletion(
			pending,
			result as ScribeJobResult<unknown>,
		);
	}

	canRunBuffered<T>(
		owner: ScribeJobOwner,
		handle: ScribeJobHandle<T>,
	): boolean {
		const pending = this.pending.get(handle.id);
		return (
			pending !== undefined &&
			pending.handle === handle &&
			pending.owner.key === owner.key &&
			!pending.canceled &&
			!pending.completionQueued &&
			!this.results.has(handle.id)
		);
	}

	private allocate(
		owner: ScribeJobOwner,
		operation: string,
		player: Player | undefined,
		execute: (() => ScribeJobResult<unknown>) | undefined,
		started: boolean,
	): InternalJobHandle {
		assert(
			this.bundleById.has(owner.dataId),
			`[rovy/scribe] cannot queue ${operation} for unknown data definition '${owner.dataId}'`,
		);
		this.nextHandleId += 1;
		const handle = table.freeze({
			id: this.nextHandleId,
			operation,
			ownerKey: owner.key,
			dataId: owner.dataId,
		}) as InternalJobHandle;
		this.pending.set(handle.id, {
			handle,
			owner,
			player,
			execute,
			started,
			canceled: false,
			completionQueued: false,
		});
		return handle;
	}

	hasResult<T>(
		owner: ScribeJobOwner,
		handle: ScribeJobHandle<T>,
	): boolean {
		const stored = this.results.get(handle.id);
		return (
			stored !== undefined &&
			stored.handle === handle &&
			stored.ownerKey === owner.key
		);
	}

	takeResult<T>(
		owner: ScribeJobOwner,
		handle: ScribeJobHandle<T>,
	): ScribeJobResult<T> | undefined {
		const stored = this.results.get(handle.id);
		if (
			stored === undefined ||
			stored.handle !== handle ||
			stored.ownerKey !== owner.key
		) {
			return undefined;
		}
		this.results.delete(handle.id);
		this.pending.delete(handle.id);
		return stored.result as ScribeJobResult<T>;
	}

	/**
	 * Called after buffered writers. Starting `saveNow` before this point could
	 * persist the prior revision while a same-system write was still queued.
	 */
	flushAfterWrites(): boolean {
		let worked = false;
		while (this.completions.size() > 0) {
			const completion = this.completions.shift()!;
			const pending = this.pending.get(completion.handleId);
			if (
				pending === undefined ||
				this.results.has(completion.handleId)
			) {
				continue;
			}
			const result = immutableJobResult(completion.result);
			this.results.set(completion.handleId, {
				handle: pending.handle,
				ownerKey: pending.owner.key,
				result,
			});
			this.events.publishJobCompletion(
				pending.owner.dataId,
				pending.handle,
				result,
				pending.player,
			);
			worked = true;
		}
		while (this.queued.size() > 0) {
			const id = this.queued.shift()!;
			const pending = this.pending.get(id);
			if (
				pending === undefined ||
				pending.started ||
				pending.canceled
			) {
				continue;
			}
			pending.started = true;
			this.start(pending);
			worked = true;
		}
		return worked;
	}

	cancelPlayer(player: Player, reason = "session-ended"): void {
		if (this.boundary !== "server") return;
		for (const [, pending] of this.pending) {
			if (
				pending.player !== player ||
				this.results.has(pending.handle.id) ||
				pending.canceled ||
				pending.completionQueued
			) {
				continue;
			}
			pending.canceled = true;
			this.queueCompletion(
				pending,
				table.freeze({
					ok: false,
					error: reason,
				}),
			);
		}
	}

	private start(pending: PendingJob): void {
		task.spawn(() => {
			const execute = pending.execute;
			assert(
				execute !== undefined,
				"[rovy/scribe] buffered job cannot start as a yielding job",
			);
			const [ok, valueOrError] = pcall(execute);
			if (pending.canceled) return;
			const result: ScribeJobResult<unknown> = ok
				? valueOrError
				: table.freeze({
						ok: false,
						error: `${pending.handle.operation}-error: ${tostring(valueOrError)}`,
					});
			this.queueCompletion(pending, result);
		});
	}

	private queueCompletion(
		pending: PendingJob,
		result: ScribeJobResult<unknown>,
	): void {
		if (pending.completionQueued) return;
		pending.completionQueued = true;
		this.completions.push({
			handleId: pending.handle.id,
			result,
		});
	}

	private connectSessionCancellation(): void {
		for (const [, bundle] of this.bundleById) {
			const signal = (bundle.active as UnknownTable).SessionEnded;
			if (!typeIs(signal, "table")) continue;
			const connect = (signal as UnknownTable).Connect;
			if (!typeIs(connect, "function")) continue;
			(connect as (
				self: object,
				callback: (player: Player, reason?: string) => void,
			) => unknown)(signal, (player, reason) => {
				this.cancelPlayer(player, reason ?? "session-ended");
			});
		}
	}
}

export function successfulJob<T>(value: T): ScribeJobResult<T> {
	return table.freeze({
		ok: true,
		value,
	});
}

export function failedJob<T = never>(errorMessage: string): ScribeJobResult<T> {
	return table.freeze({
		ok: false,
		error: errorMessage,
	});
}

function immutableJobResult(
	result: ScribeJobResult<unknown>,
): ScribeJobResult<unknown> {
	if (!result.ok) {
		return table.freeze({
			ok: false,
			error: result.error,
		});
	}
	return table.freeze({
		ok: true,
		value: freezeScribeValue(cloneScribeValue(result.value)),
	});
}
