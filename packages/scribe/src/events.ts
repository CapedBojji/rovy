import type { Ctor } from "@rovy/core";
import type {
	AnyScribeData,
	ScribeArrayPath,
	ScribeArrayValueAtPath,
	ScribeDictionaryPath,
	ScribeDictionaryValueAtPath,
	ScribePath,
	ScribeSharedShape,
	ScribeValueAtPath,
} from "./definitions";
import type {
	ScribeCommandConstructor,
	ScribeCommandHandle,
	ScribeCommandResult,
} from "./commands";
import type {
	ReadonlyDeep,
	ScribeJobHandle,
	ScribeJobResult,
	ScribeLeaderboardEntry,
	ScribeLogEntry,
	ScribeSaveInfo,
	ScribeStatus,
} from "./types";

export type ScribeChangeSource =
	| "serverWrite"
	| "clientLocalWrite"
	| "replication"
	| "initialSnapshot"
	| "timer";

export type ScribePathlessEventKind =
	| "ready"
	| "unavailable"
	| "sessionEnded"
	| "save"
	| "anomaly"
	| "giftReceived"
	| "giftCredit"
	| "ownershipChanged"
	| "message"
	| "leaderboard"
	| "serviceStatus"
	| "sharedChanged"
	| "issue"
	| "jobCompleted";

export interface ScribePathlessEventOptions<D extends AnyScribeData> {
	readonly data: D;
	readonly kind: ScribePathlessEventKind;
}

export interface ScribeChangedEventOptions<
	D extends AnyScribeData,
	Path extends string,
> {
	readonly data: D;
	readonly kind: "changed";
	readonly path: Path;
}

export interface ScribeArrayEventOptions<
	D extends AnyScribeData,
	Path extends string,
> {
	readonly data: D;
	readonly kind: "inserted" | "removed";
	readonly path: Path;
}

export interface ScribeDictionaryEventOptions<
	D extends AnyScribeData,
	Path extends string,
> {
	readonly data: D;
	readonly kind: "keyAdded" | "keyRemoved";
	readonly path: Path;
}

export interface ScribeCommandCompletedEventOptions<Command extends object> {
	readonly command: ScribeCommandConstructor<Command>;
	readonly kind: "commandCompleted";
}

export declare function scribeEvent<D extends AnyScribeData>(
	options: ScribePathlessEventOptions<D>,
): (ctor: Ctor) => void;
export declare function scribeEvent<D extends AnyScribeData, Path extends string>(
	options: ScribeChangedEventOptions<D, Path>,
): (ctor: Ctor) => void;
export declare function scribeEvent<D extends AnyScribeData, Path extends string>(
	options: ScribeArrayEventOptions<D, Path>,
): (ctor: Ctor) => void;
export declare function scribeEvent<D extends AnyScribeData, Path extends string>(
	options: ScribeDictionaryEventOptions<D, Path>,
): (ctor: Ctor) => void;
export declare function scribeEvent<Command extends object>(
	options: ScribeCommandCompletedEventOptions<Command>,
): (ctor: Ctor) => void;

export declare class ScribeReady<D extends AnyScribeData> {
	readonly definition: D;
	readonly player?: Player;
}

export declare class ScribeUnavailable<D extends AnyScribeData> {
	readonly definition: D;
	readonly player?: Player;
	readonly reason: string;
}

export declare class ScribeValueChanged<
	D extends AnyScribeData,
	Path extends string,
> {
	readonly definition: D;
	readonly player?: Player;
	readonly path: ReadonlyArray<string | number>;
	readonly before: ReadonlyDeep<ScribeValueAtPath<D, Path>>;
	readonly after: ReadonlyDeep<ScribeValueAtPath<D, Path>>;
	readonly source: ScribeChangeSource;
	readonly revision: number;
}

export declare class ScribeArrayInserted<
	D extends AnyScribeData,
	Path extends string,
> {
	readonly definition: D;
	readonly player?: Player;
	readonly path: ReadonlyArray<string | number>;
	readonly index: number;
	readonly value: ReadonlyDeep<ScribeArrayValueAtPath<D, Path>>;
	readonly source: ScribeChangeSource;
}

export declare class ScribeArrayRemoved<
	D extends AnyScribeData,
	Path extends string,
> extends ScribeArrayInserted<D, Path> {}

export declare class ScribeKeyAdded<
	D extends AnyScribeData,
	Path extends string,
> {
	readonly definition: D;
	readonly player?: Player;
	readonly path: ReadonlyArray<string | number>;
	readonly key: string;
	readonly value: ReadonlyDeep<ScribeDictionaryValueAtPath<D, Path>>;
	readonly source: ScribeChangeSource;
}

export declare class ScribeKeyRemoved<
	D extends AnyScribeData,
	Path extends string,
> extends ScribeKeyAdded<D, Path> {}

export declare class ScribeCommandCompleted<Command extends object, Result> {
	readonly handle: ScribeCommandHandle<Command, Result>;
	readonly request: Command;
	readonly result: ScribeCommandResult<Result>;
}

export declare class ScribeJobCompleted<T> {
	readonly handle: ScribeJobHandle<T>;
	readonly result: ScribeJobResult<T>;
}

export declare class ScribeSaveCompleted<D extends AnyScribeData> {
	readonly definition: D;
	readonly player: Player;
	readonly ok: boolean;
	readonly duration: number;
	readonly at: number;
	readonly saveInfo: ScribeSaveInfo;
}

export declare class ScribeSessionEnded<D extends AnyScribeData> {
	readonly definition: D;
	readonly player: Player;
	readonly reason: string;
}

export declare class ScribeAnomaly<D extends AnyScribeData> {
	readonly definition: D;
	readonly player: Player;
	readonly path: ReadonlyArray<string | number>;
	readonly value?: ReadonlyDeep<unknown>;
	readonly reason: string;
}

export declare class ScribeOwnershipChanged<D extends AnyScribeData> {
	readonly definition: D;
	readonly player?: Player;
	readonly key: string;
	readonly owned: boolean;
}

export declare class ScribeGiftReceived<D extends AnyScribeData> {
	readonly definition: D;
	readonly player: Player;
	readonly fromUserId: number;
	readonly product: string;
	readonly giftId: string;
}

export declare class ScribeGiftCredit<D extends AnyScribeData> {
	readonly definition: D;
	readonly player: Player;
	readonly product: string;
}

export declare class ScribeMessageReceived<D extends AnyScribeData, Payload> {
	readonly definition: D;
	readonly player: Player;
	readonly value: ReadonlyDeep<Payload>;
}

export declare class ScribeLeaderboardChanged<D extends AnyScribeData> {
	readonly definition: D;
	readonly name: string;
	readonly entries: ReadonlyArray<ScribeLeaderboardEntry>;
}

export declare class ScribeSharedChanged<D extends AnyScribeData> {
	readonly definition: D;
	readonly userId: number;
	readonly value: ReadonlyDeep<ScribeSharedShape<D>>;
}

export declare class ScribeStatusChanged {
	readonly status: ScribeStatus;
}

export declare class ScribeIssue {
	readonly entry: ScribeLogEntry;
}
