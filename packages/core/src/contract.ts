/**
 * FROZEN CONTRACT — the transformer↔runtime boundary.
 *
 * The `rovy-transformer` (separate package, later) injects `rovy.__*` calls
 * carrying these descriptor shapes. The runtime consumes them. Tests hand-write
 * them. Nothing here references jecs — it is pure data. Treat changes as
 * breaking: bump a contract version and update the transformer in lockstep.
 *
 * Spec: docs/19-compiled-output.md, docs/20-runtime-lifecycle.md.
 */

/** Any decorated class constructor. Components/resources/events/relations may carry data via constructor params. */
export type Ctor<T extends object = object> = new (...args: never[]) => T;

/** Stable, collision-free id = canonical module path (e.g. "src/components/Position"). */
export type StableId = string;

// ─── Parameter injection ────────────────────────────────────────────────────
// The transformer reads run/onEnter/onExit/onChange param types and emits an
// ordered list of these. The runtime resolves each positionally at call time.

export type ParamKind =
	| "commands"
	| "world"
	| "query"
	| "res"
	| "resMut"
	| "optRes"
	| "eventReader"
	| "eventWriter"
	| "event"
	| "entity"
	| "term"
	| "local";

export interface CommandsParam {
	readonly kind: "commands";
}
export interface WorldParam {
	readonly kind: "world";
}
export interface EventParam {
	/** Observer first param — the triggering event instance. */
	readonly kind: "event";
}
export interface EntityParam {
	/** Monitor first param / explicit Entity query term position. */
	readonly kind: "entity";
}
export interface TermParam {
	/** Monitor onEnter/onExit/onChange bound match-term value at `index` (0-based over match terms). */
	readonly kind: "term";
	readonly index: number;
}
export interface ResParam {
	readonly kind: "res" | "resMut" | "optRes";
	readonly ctor: Ctor;
}
export interface EventChannelParam {
	readonly kind: "eventReader" | "eventWriter";
	readonly ctor: Ctor;
}
export interface QueryParam {
	readonly kind: "query";
	/** Stable id of the hoisted QueryDescriptor (see `rovy.__query`). */
	readonly handle: StableId;
}
export interface LocalParam {
	readonly kind: "local";
	/** Position among Local params on this method (its slot key). */
	readonly index: number;
	/** Optional initial-value factory; runtime calls once per system instance. */
	readonly init?: () => unknown;
}

export type ParamDescriptor =
	| CommandsParam
	| WorldParam
	| EventParam
	| EntityParam
	| TermParam
	| ResParam
	| EventChannelParam
	| QueryParam
	| LocalParam;

// ─── Query descriptor (hoisted by transformer) ──────────────────────────────

/** A single bound term in a query's term tuple, in declared order. */
export type QueryTerm =
	| { readonly t: "entity" }
	| { readonly t: "component"; readonly ctor: Ctor }
	| { readonly t: "optional"; readonly ctor: Ctor }
	| { readonly t: "trait"; readonly traitId: StableId }
	| { readonly t: "allTraits"; readonly traitId: StableId }
	| { readonly t: "pair"; readonly relation: Ctor };

/** Non-binding filters. `changed/added/removed` are tick-based (runtime applies post-archetype). */
export interface QueryFilters {
	readonly with?: ReadonlyArray<Ctor>;
	readonly without?: ReadonlyArray<Ctor>;
	readonly hasTrait?: ReadonlyArray<StableId>;
	readonly hasPair?: ReadonlyArray<Ctor>;
	readonly changed?: ReadonlyArray<Ctor>;
	readonly added?: ReadonlyArray<Ctor>;
	readonly removed?: ReadonlyArray<Ctor>;
}

export interface QueryDescriptor {
	readonly id: StableId;
	readonly terms: ReadonlyArray<QueryTerm>;
	readonly filters: QueryFilters;
}

// ─── Registration entries ───────────────────────────────────────────────────

export interface ComponentReg {
	readonly ctor: Ctor;
	readonly id: StableId;
}

export interface ResourceReg {
	readonly ctor: Ctor;
	readonly id: StableId;
}

export interface EventReg {
	readonly ctor: Ctor;
	/** Max buffered events; undefined = unbounded. */
	readonly capacity?: number;
	readonly label?: string;
}

export interface SystemReg {
	readonly ctor: Ctor;
	readonly id: StableId;
	/** Schedule class this system runs in. */
	readonly schedule: Ctor;
	/** Optional SystemSet class (membership for ordering). */
	readonly set?: Ctor;
	readonly after?: ReadonlyArray<Ctor>;
	readonly before?: ReadonlyArray<Ctor>;
	/** Zero-arg gate (v1: no world access). */
	readonly runIf?: () => boolean;
	readonly params: ReadonlyArray<ParamDescriptor>;
}

export interface ObserverReg {
	readonly ctor: Ctor;
	/** @event class this observer reacts to. */
	readonly event: Ctor;
	/** Higher runs first. Default 0. */
	readonly priority: number;
	readonly params: ReadonlyArray<ParamDescriptor>;
}

export type MonitorMethod = "onEnter" | "onExit" | "onChange";

export interface MonitorReg {
	readonly ctor: Ctor;
	/** Stable id of the hoisted match QueryDescriptor. */
	readonly match: StableId;
	/** Which lifecycle methods the class actually implements. */
	readonly methods: ReadonlyArray<MonitorMethod>;
	/** Param descriptors shared by the implemented methods (validated equal by transformer). */
	readonly params: ReadonlyArray<ParamDescriptor>;
}

export type CleanupPolicy = "cascade" | "remove" | "none";

export interface RelationReg {
	readonly ctor: Ctor;
	readonly exclusive: boolean;
	readonly onTargetDelete: CleanupPolicy;
	readonly onDelete: CleanupPolicy;
}

export interface ScheduleReg {
	readonly ctor: Ctor;
	readonly runOnStart: boolean;
}

/** Set ordering within a schedule, declared via app.configureSets (not a decorator). */
export interface SetOrderReg {
	readonly schedule: Ctor;
	readonly order: ReadonlyArray<Ctor>;
}

// ─── Registry shape ─────────────────────────────────────────────────────────

export interface RovyRegistry {
	readonly components: Array<ComponentReg>;
	readonly resources: Array<ResourceReg>;
	readonly events: Array<EventReg>;
	readonly systems: Array<SystemReg>;
	readonly observers: Array<ObserverReg>;
	readonly monitors: Array<MonitorReg>;
	readonly relations: Array<RelationReg>;
	readonly schedules: Array<ScheduleReg>;
	/** traitId → implementer ctors (from `implements` clauses). */
	readonly traits: Map<StableId, Array<Ctor>>;
	/** queryId → hoisted descriptor. */
	readonly queries: Map<StableId, QueryDescriptor>;
}

/**
 * CALLING CONVENTION: roblox-ts compiles object-literal methods with an
 * implicit `self` first arg. The transformer MUST emit method-call syntax —
 * `rovy:__component(ctor, id)` (Luau colon) / `rovy.__component(rovy, …)` —
 * not `rovy.__component(ctor, id)`. Hand-written tests do likewise.
 */

/** Bumped on any breaking change to the shapes above. Transformer asserts a match. */
export const CONTRACT_VERSION = 1;
