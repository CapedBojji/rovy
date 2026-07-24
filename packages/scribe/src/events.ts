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

const noopEventDecorator = (_ctor: Ctor): void => {};

export function scribeEvent<D extends AnyScribeData>(
	options: ScribePathlessEventOptions<D>,
): (ctor: Ctor) => void;
export function scribeEvent<D extends AnyScribeData, Path extends string>(
	options: ScribeChangedEventOptions<D, Path>,
): (ctor: Ctor) => void;
export function scribeEvent<D extends AnyScribeData, Path extends string>(
	options: ScribeArrayEventOptions<D, Path>,
): (ctor: Ctor) => void;
export function scribeEvent<D extends AnyScribeData, Path extends string>(
	options: ScribeDictionaryEventOptions<D, Path>,
): (ctor: Ctor) => void;
export function scribeEvent<Command extends object>(
	options: ScribeCommandCompletedEventOptions<Command>,
): (ctor: Ctor) => void;
export function scribeEvent(_options: object): (ctor: Ctor) => void {
	return noopEventDecorator;
}

export class ScribeReady<D extends AnyScribeData> {
	readonly definition = undefined! as D;
	readonly player?: Player;
}

export class ScribeUnavailable<D extends AnyScribeData> {
	readonly definition = undefined! as D;
	readonly player?: Player;
	readonly reason = "";
}

export class ScribeValueChanged<
	D extends AnyScribeData,
	Path extends string,
> {
	readonly definition = undefined! as D;
	readonly player?: Player;
	readonly path = new Array<string | number>();
	readonly before = undefined! as
		| ReadonlyDeep<ScribeValueAtPath<D, Path>>
		| undefined;
	readonly after = undefined! as ReadonlyDeep<ScribeValueAtPath<D, Path>>;
	readonly source = "serverWrite" as ScribeChangeSource;
	readonly revision = 0;
}

export class ScribeArrayInserted<
	D extends AnyScribeData,
	Path extends string,
> {
	readonly definition = undefined! as D;
	readonly player?: Player;
	readonly path = new Array<string | number>();
	readonly index = 0;
	readonly value = undefined! as ReadonlyDeep<ScribeArrayValueAtPath<D, Path>>;
	readonly source = "serverWrite" as ScribeChangeSource;
}

export class ScribeArrayRemoved<
	D extends AnyScribeData,
	Path extends string,
> extends ScribeArrayInserted<D, Path> {}

export class ScribeKeyAdded<
	D extends AnyScribeData,
	Path extends string,
> {
	readonly definition = undefined! as D;
	readonly player?: Player;
	readonly path = new Array<string | number>();
	readonly key = "";
	readonly value = undefined! as ReadonlyDeep<ScribeDictionaryValueAtPath<D, Path>>;
	readonly source = "serverWrite" as ScribeChangeSource;
}

export class ScribeKeyRemoved<
	D extends AnyScribeData,
	Path extends string,
> extends ScribeKeyAdded<D, Path> {}

export class ScribeCommandCompleted<Command extends object, Result> {
	readonly handle = undefined! as ScribeCommandHandle<Command, Result>;
	readonly request = undefined! as Command;
	readonly result = undefined! as ScribeCommandResult<Result>;
}

export class ScribeJobCompleted<T> {
	readonly definition = undefined! as AnyScribeData;
	readonly player?: Player;
	readonly handle = undefined! as ScribeJobHandle<T>;
	readonly result = undefined! as ScribeJobResult<T>;
}

export class ScribeSaveCompleted<D extends AnyScribeData> {
	readonly definition = undefined! as D;
	readonly player = undefined! as Player;
	readonly ok = false;
	readonly duration = 0;
	readonly at = 0;
	readonly saveInfo = undefined! as ScribeSaveInfo;
}

export class ScribeSessionEnded<D extends AnyScribeData> {
	readonly definition = undefined! as D;
	readonly player = undefined! as Player;
	readonly reason = "";
}

export class ScribeAnomaly<D extends AnyScribeData> {
	readonly definition = undefined! as D;
	readonly player = undefined! as Player;
	readonly path = new Array<string | number>();
	readonly value?: ReadonlyDeep<unknown>;
	readonly reason = "";
}

export class ScribeOwnershipChanged<D extends AnyScribeData> {
	readonly definition = undefined! as D;
	readonly player?: Player;
	readonly key = "";
	readonly owned = false;
}

export class ScribeGiftReceived<D extends AnyScribeData> {
	readonly definition = undefined! as D;
	readonly player = undefined! as Player;
	readonly fromUserId = 0;
	readonly product = "";
	readonly giftId = "";
}

export class ScribeGiftCredit<D extends AnyScribeData> {
	readonly definition = undefined! as D;
	readonly player = undefined! as Player;
	readonly product = "";
}

export class ScribeMessageReceived<D extends AnyScribeData, Payload> {
	readonly definition = undefined! as D;
	readonly player = undefined! as Player;
	readonly value = undefined! as ReadonlyDeep<Payload>;
}

export class ScribeLeaderboardChanged<D extends AnyScribeData> {
	readonly definition = undefined! as D;
	readonly name = "";
	readonly entries = new Array<ScribeLeaderboardEntry>();
}

export class ScribeSharedChanged<D extends AnyScribeData> {
	readonly definition = undefined! as D;
	readonly userId = 0;
	readonly value?: ReadonlyDeep<ScribeSharedShape<D>>;
}

export class ScribeStatusChanged {
	readonly status = "Healthy" as ScribeStatus;
}

export class ScribeIssue {
	readonly entry = undefined! as ScribeLogEntry;
}
