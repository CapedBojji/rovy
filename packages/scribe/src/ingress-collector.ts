import {
	cloneScribeValue,
	freezeScribeValue,
} from "./reader-tree";
import type {
	ScribeCommandHandle,
	ScribeCommandResult,
} from "./commands";
import type {
	ScribeChangeSource,
} from "./events";
import type {
	ScribeJobHandle,
	ScribeJobResult,
	ScribeLogEntry,
	ScribeSaveInfo,
	ScribeStatus,
} from "./types";

export interface ScribeIngressBase {
	readonly dataId: string;
	readonly player?: Player;
}

export interface ScribeChangedIngress extends ScribeIngressBase {
	readonly kind: "changed";
	readonly path: ReadonlyArray<string | number>;
	readonly before?: unknown;
	readonly after: unknown;
	readonly source: ScribeChangeSource;
}

export interface ScribeArrayIngress extends ScribeIngressBase {
	readonly kind: "inserted" | "removed";
	readonly path: ReadonlyArray<string | number>;
	readonly index: number;
	readonly value: unknown;
	readonly source: ScribeChangeSource;
}

export interface ScribeDictionaryIngress extends ScribeIngressBase {
	readonly kind: "keyAdded" | "keyRemoved";
	readonly path: ReadonlyArray<string | number>;
	readonly key: string;
	readonly value: unknown;
	readonly source: ScribeChangeSource;
}

export interface ScribeReadyIngress extends ScribeIngressBase {
	readonly kind: "ready";
}

export interface ScribeUnavailableIngress extends ScribeIngressBase {
	readonly kind: "unavailable";
	readonly reason: string;
}

export interface ScribeSessionEndedIngress extends ScribeIngressBase {
	readonly kind: "sessionEnded";
	readonly player: Player;
	readonly reason: string;
}

export interface ScribeSaveIngress extends ScribeIngressBase {
	readonly kind: "save";
	readonly player: Player;
	readonly ok: boolean;
	readonly duration: number;
	readonly at: number;
	readonly saveInfo: ScribeSaveInfo;
}

export interface ScribeAnomalyIngress extends ScribeIngressBase {
	readonly kind: "anomaly";
	readonly player: Player;
	readonly path: ReadonlyArray<string | number>;
	readonly value?: unknown;
	readonly reason: string;
}

export interface ScribeGiftReceivedIngress extends ScribeIngressBase {
	readonly kind: "giftReceived";
	readonly player: Player;
	readonly fromUserId: number;
	readonly product: string;
	readonly giftId: string;
}

export interface ScribeGiftCreditIngress extends ScribeIngressBase {
	readonly kind: "giftCredit";
	readonly player: Player;
	readonly product: string;
}

export interface ScribeOwnershipIngress extends ScribeIngressBase {
	readonly kind: "ownershipChanged";
	readonly key: string;
	readonly owned: boolean;
}

export interface ScribeMessageIngress extends ScribeIngressBase {
	readonly kind: "message";
	readonly player: Player;
	readonly value: unknown;
}

export interface ScribeLeaderboardIngress extends ScribeIngressBase {
	readonly kind: "leaderboard";
	readonly name: string;
	readonly entries: ReadonlyArray<Readonly<Record<string, unknown>>>;
}

export interface ScribeServiceStatusIngress extends ScribeIngressBase {
	readonly kind: "serviceStatus";
	readonly status: ScribeStatus;
}

export interface ScribeSharedIngress extends ScribeIngressBase {
	readonly kind: "sharedChanged";
	readonly userId: number;
	readonly value?: unknown;
}

export interface ScribeIssueIngress extends ScribeIngressBase {
	readonly kind: "issue";
	readonly entry: ScribeLogEntry;
}

export interface ScribeCommandCompletedIngress {
	readonly kind: "commandCompleted";
	readonly commandId: string;
	readonly handle: ScribeCommandHandle<object, unknown>;
	readonly request: object;
	readonly result: ScribeCommandResult<unknown>;
}

export interface ScribeJobCompletedIngress extends ScribeIngressBase {
	readonly kind: "jobCompleted";
	readonly handle: ScribeJobHandle<unknown>;
	readonly result: ScribeJobResult<unknown>;
}

export type ScribeIngressRecord =
	| ScribeChangedIngress
	| ScribeArrayIngress
	| ScribeDictionaryIngress
	| ScribeReadyIngress
	| ScribeUnavailableIngress
	| ScribeSessionEndedIngress
	| ScribeSaveIngress
	| ScribeAnomalyIngress
	| ScribeGiftReceivedIngress
	| ScribeGiftCreditIngress
	| ScribeOwnershipIngress
	| ScribeMessageIngress
	| ScribeLeaderboardIngress
	| ScribeServiceStatusIngress
	| ScribeSharedIngress
	| ScribeIssueIngress
	| ScribeCommandCompletedIngress
	| ScribeJobCompletedIngress;

/**
 * Package-owned callback ingress. Native callbacks do no Rovy work: they only
 * place immutable records here for the next flush-participant pass.
 */
export class ScribeIngressCollector {
	private queue = new Array<ScribeIngressRecord>();

	enqueue(record: ScribeIngressRecord): void {
		this.queue.push(table.freeze(record));
	}

	hasPending(): boolean {
		return this.queue.size() > 0;
	}

	drain(): Array<ScribeIngressRecord> {
		const records = this.queue;
		this.queue = new Array<ScribeIngressRecord>();
		return records;
	}
}

export function immutableIngressValue(value: unknown): unknown {
	return freezeScribeValue(cloneScribeValue(value));
}

export function immutableIngressPath(
	path: ReadonlyArray<string | number>,
): ReadonlyArray<string | number> {
	const copy = new Array<string | number>();
	for (const segment of path) copy.push(segment);
	return table.freeze(copy);
}
