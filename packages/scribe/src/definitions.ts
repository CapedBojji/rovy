import type {
	ScribeArraySchema,
	ScribeDictionarySchema,
	ScribeSchema,
	ScribeSchemaKind,
	ScribeSchemaValue,
	ScribeVisibility,
	ScribeVisibilitySchema,
} from "./schema";
import type { ScribeLogLevel, ScribeStatusThresholds } from "./types";

export interface AnyScribeData {
	readonly id: string;
	readonly name: string;
	readonly __scribeDataBrand?: unknown;
}

export interface ScribeDataDefinition<TSchema extends object> extends AnyScribeData {
	readonly __scribeDataBrand?: TSchema;
	readonly __schema?: TSchema;
}

export type ScribeSchemaOf<D extends AnyScribeData> = D extends ScribeDataDefinition<infer Schema> ? Schema : never;

type UnwrapVisibility<Schema> = Schema extends ScribeVisibilitySchema<ScribeVisibility, infer Inner> ? Inner : Schema;

export type ScribeFullSchema<D extends AnyScribeData> = {
	[Key in keyof ScribeSchemaOf<D>]: UnwrapVisibility<ScribeSchemaOf<D>[Key]>;
};

export type ScribeClientSchema<D extends AnyScribeData> = {
	[Key in keyof ScribeSchemaOf<D> as ScribeSchemaOf<D>[Key] extends ScribeVisibilitySchema<
		"serverOnly",
		infer _Inner
	>
		? never
		: Key]: UnwrapVisibility<ScribeSchemaOf<D>[Key]>;
};

export type ScribeSharedSchema<D extends AnyScribeData> = {
	[Key in keyof ScribeSchemaOf<D> as ScribeSchemaOf<D>[Key] extends ScribeVisibilitySchema<
		"shared",
		infer _Inner
	>
		? Key
		: never]: UnwrapVisibility<ScribeSchemaOf<D>[Key]>;
};

export type ScribePersistedSchema<D extends AnyScribeData> = {
	[Key in keyof ScribeSchemaOf<D> as ScribeSchemaOf<D>[Key] extends ScribeVisibilitySchema<
		"session",
		infer _Inner
	>
		? never
		: Key]: UnwrapVisibility<ScribeSchemaOf<D>[Key]>;
};

export type ScribeShape<D extends AnyScribeData> = ScribeSchemaValue<ScribeFullSchema<D>>;
export type ScribeClientShape<D extends AnyScribeData> = ScribeSchemaValue<ScribeClientSchema<D>>;
export type ScribeSharedShape<D extends AnyScribeData> = ScribeSchemaValue<ScribeSharedSchema<D>>;
export type ScribePersistedShape<D extends AnyScribeData> = ScribeSchemaValue<ScribePersistedSchema<D>>;

type JoinPath<Head extends string, Tail> = Tail extends string ? `${Head}.${Tail}` : never;

type SchemaPaths<Schema> = Schema extends ScribeVisibilitySchema<ScribeVisibility, infer Inner>
	? SchemaPaths<Inner>
	: Schema extends ScribeSchema<unknown, ScribeSchemaKind>
		? never
		: Schema extends ReadonlyArray<unknown>
			? never
			: Schema extends object
				? {
						[Key in Extract<keyof Schema, string>]:
							| Key
							| JoinPath<Key, SchemaPaths<UnwrapVisibility<Schema[Key]>>>;
					}[Extract<keyof Schema, string>]
				: never;

type SchemaAtPath<Schema, Path extends string> = Path extends `${infer Head}.${infer Tail}`
	? Head extends keyof Schema
		? SchemaAtPath<UnwrapVisibility<Schema[Head]>, Tail>
		: never
	: Path extends keyof Schema
		? UnwrapVisibility<Schema[Path]>
		: never;

type PathsMatching<Schema, Candidate> = SchemaPaths<Schema> extends infer Path
	? Path extends string
		? SchemaAtPath<Schema, Path> extends Candidate
			? Path
			: never
		: never
	: never;

type NumericPaths<Schema> = SchemaPaths<Schema> extends infer Path
	? Path extends string
		? Exclude<ScribeSchemaValue<SchemaAtPath<Schema, Path>>, undefined> extends number
			? Path
			: never
		: never
	: never;

export type ScribePath<D extends AnyScribeData> = SchemaPaths<ScribeFullSchema<D>>;
export type ScribeClientPath<D extends AnyScribeData> = SchemaPaths<ScribeClientSchema<D>>;
export type ScribeDictionaryPath<D extends AnyScribeData> = PathsMatching<
	ScribeFullSchema<D>,
	ScribeDictionarySchema<unknown>
>;
export type ScribeClientDictionaryPath<D extends AnyScribeData> = PathsMatching<
	ScribeClientSchema<D>,
	ScribeDictionarySchema<unknown>
>;
export type ScribeArrayPath<D extends AnyScribeData> = PathsMatching<ScribeFullSchema<D>, ScribeArraySchema<unknown>>;
export type ScribeClientArrayPath<D extends AnyScribeData> = PathsMatching<
	ScribeClientSchema<D>,
	ScribeArraySchema<unknown>
>;
export type ScribeNumericPath<D extends AnyScribeData> = NumericPaths<ScribeFullSchema<D>>;

export type ScribeSchemaAtPath<
	D extends AnyScribeData,
	Path extends string,
> = Path extends string ? SchemaAtPath<ScribeFullSchema<D>, Path> : never;

export type ScribeValueAtPath<
	D extends AnyScribeData,
	Path extends string,
> = ScribeSchemaValue<ScribeSchemaAtPath<D, Path>>;

export type ScribeDictionaryValueAtPath<
	D extends AnyScribeData,
	Path extends string,
> = Path extends string
	? SchemaAtPath<ScribeFullSchema<D>, Path> extends ScribeDictionarySchema<infer Element>
		? ScribeSchemaValue<Element>
		: never
	: never;

export type ScribeArrayValueAtPath<
	D extends AnyScribeData,
	Path extends string,
> = Path extends string
	? SchemaAtPath<ScribeFullSchema<D>, Path> extends ScribeArraySchema<infer Element>
		? ScribeSchemaValue<Element>
		: never
	: never;

export interface ScribeLeaderboardConfig<StatPath extends string = string> {
	readonly stat: StatPath;
	readonly limit?: number;
	readonly scale?: number;
	readonly replicate?: boolean;
	readonly storeName?: string;
}

export interface ScribeProductDeclaration {
	readonly id: number;
	readonly category?: string;
	readonly grants?: string;
}

export interface ScribePassDeclaration {
	readonly id: number;
	readonly category?: string;
}

export interface ScribePurchaseLogConfig {
	readonly robuxCap?: number;
	readonly inGameCap?: number;
	readonly replicateRobux?: boolean;
	readonly replicateInGame?: boolean;
	readonly categories?: ReadonlyArray<string>;
}

export interface ScribeGiftingConfig {
	readonly cooldown?: number;
	readonly maxPending?: number;
	readonly intentTtl?: number;
	readonly allowDuplicate?: boolean;
	readonly noIntentPolicy?: "grantOrCredit" | "hold";
}

export interface ScribeEconomyFieldDeclaration {
	readonly name: string;
	readonly prefix?: boolean;
}

export interface ScribeEconomyCurrencyDeclaration {
	readonly label?: string;
	readonly fields?: ReadonlyArray<string | ScribeEconomyFieldDeclaration>;
}

export interface ScribeEconomyDeclaration {
	readonly prefix?: boolean;
	readonly currencies?: Readonly<Record<string, ScribeEconomyCurrencyDeclaration>>;
}

export interface ScribeDataOptions<Schema extends object = object> {
	readonly saveInterval?: number;
	readonly mode?: "Live" | "Mock" | "NoSave";
	readonly targetUserId?: number;
	readonly useMock?: boolean;
	readonly viewedUserId?: number;
	readonly overriddenUserId?: number;
	readonly dontSave?: boolean;
	readonly resetData?: boolean;
	readonly loadFailurePolicy?: "kick" | "wait";
	readonly versionAheadPolicy?: "kick" | "allow";
	readonly kickOnSessionEnd?: boolean;
	readonly loadFailureMessage?: string;
	readonly sessionEndMessage?: string;
	readonly commandRateLimit?: number;
	readonly requestTimeout?: number;
	readonly maxInboundBytes?: number;
	readonly boundsPolicy?: "clamp" | "reject";
	readonly wipeGuardPolicy?: "warn" | "block";
	readonly wipeGuardShrinkRatio?: number;
	readonly logLevel?: ScribeLogLevel;
	readonly statusThresholds?: ScribeStatusThresholds;
	readonly banner?: boolean;
	readonly transportChannel?: string;
	readonly purchaseLog?: ScribePurchaseLogConfig;
	readonly gifting?: ScribeGiftingConfig;
	readonly leaderboards?: Readonly<Record<string, ScribeLeaderboardConfig<NumericPaths<Schema>>>>;
	readonly products?: Readonly<Record<string, ScribeProductDeclaration>>;
	readonly passes?: Readonly<Record<string, ScribePassDeclaration>>;
	readonly perks?: ReadonlyArray<string>;
	readonly ownReceipts?: boolean;
	readonly economy?: ScribeEconomyDeclaration;
}

export interface ScribeDataDeclaration<Schema extends object> {
	readonly name: string;
	readonly profileStoreIndex: string;
	readonly profileKeyPrefix: string;
	readonly template: Schema;
	readonly options?: ScribeDataOptions<Schema>;
}

const SCRIBE_DATA_GUARD =
	"[rovy/scribe] scribeData declaration reached runtime untransformed - is rovy-transformer configured?";

/**
 * The transformer replaces this declaration call with `rovyScribe.__data`.
 * Reaching the authored function at runtime is always a build configuration
 * error, never a fallback persistence path.
 */
export function scribeData<const Schema extends object>(
	_declaration: ScribeDataDeclaration<Schema>,
): ScribeDataDefinition<Schema> {
	throw SCRIBE_DATA_GUARD;
}
