/**
 * Public authoring type surface. Almost all of this is **erased at runtime** —
 * the transformer reads these annotations and emits `rovy.__*` descriptors
 * (see src/contract.ts). The only runtime values here are `SystemSet` (a real
 * base class used as a nominal marker) and the `Commands`/`World` interfaces
 * (implemented by the runtime in later phases).
 */

import type { Entity as JecsEntity } from "@rbxts/jecs";
import type { Ctor } from "../contract";

/** A jecs entity id. Add `Entity` to a query term tuple to bind it. */
export type Entity = JecsEntity;

export type { Ctor };

// ─── Query terms & filters (compile-time markers) ───────────────────────────

/** Term: bind `C | undefined` (row appears whether or not entity has C). */
export type Optional<C extends object> = C | undefined;

/** Term: bind one matching trait implementer per row, typed as the trait `T`. */
export type Trait<T> = T & { readonly __rovyTrait?: unique symbol };

/** Term: bind `T[]` — all implementers of trait `T` on the entity, one row per entity. */
export type AllTraits<T> = ReadonlyArray<T> & { readonly __rovyAllTraits?: unique symbol };

/** Term: bind a relationship pair `{ target, data? }`. */
export interface Pair<R extends object> {
	readonly target: Entity;
	readonly data: R;
}

/** Filter: entity must have C (no binding). */
export type With<C extends object> = { readonly __rovyWith?: [C] };
/** Filter: entity must NOT have C. */
export type Without<C extends object> = { readonly __rovyWithout?: [C] };
/** Filter: entity must have any implementer of trait T. */
export type HasTrait<T> = { readonly __rovyHasTrait?: [T] };
/** Filter: entity must have any pair of relation R. */
export type HasPair<R extends object> = { readonly __rovyHasPair?: [R] };
/** Filter: C added or set since this consumer last ran. */
export type Changed<C extends object> = { readonly __rovyChanged?: [C] };
/** Filter: C added since this consumer last ran. */
export type Added<C extends object> = { readonly __rovyAdded?: [C] };
/** Filter: C removed since this consumer last ran (row binds Entity only). */
export type Removed<C extends object> = { readonly __rovyRemoved?: [C] };

/** Resolve a single declared term to the value bound in `forEach`. */
type ResolveTerm<T> = T extends typeof EntityMarker
	? Entity
	: T extends Ctor<infer I>
		? I
		: T;

type ResolveTerms<Terms extends ReadonlyArray<unknown>> = {
	[K in keyof Terms]: ResolveTerm<Terms[K]>;
} & unknown[];

/** Marker usable in a term tuple position to bind the entity id. */
export declare const EntityMarker: unique symbol;

/**
 * Compile-time query. Declared as a `run`/method param type; the transformer
 * hoists it to a `QueryDescriptor` and injects a built handle. You never
 * construct this.
 *
 * `Query<[Entity, Position, Optional<Shield>], With<Unit>, Without<Dead>>`
 */
export interface Query<
	Terms extends ReadonlyArray<unknown>,
	// Variadic filters — accepted positionally, read by the transformer.
	_F1 = void,
	_F2 = void,
	_F3 = void,
	_F4 = void,
	_F5 = void,
> {
	forEach(cb: (...row: ResolveTerms<Terms>) => void): void;
	size(): number;
	first(): LuaTuple<ResolveTerms<Terms>> | undefined;
	/** Narrow a `Pair<R>` term to a specific target entity. */
	withTarget(target: Entity): Query<Terms, _F1, _F2, _F3, _F4, _F5>;
	/** Iterable: `for (const [e, pos] of q) {}` */
	iter(): IterableFunction<LuaTuple<ResolveTerms<Terms>>>;
}

// ─── Injection wrappers (transformer reads the wrapper name) ─────────────────

/** Read-only resource. Throws at resolve if missing. */
export type Res<T extends object> = T;
/** Mutable resource (advisory write-intent in v1). */
export type ResMut<T extends object> = T;
/** Optional resource. */
export type OptRes<T extends object> = T | undefined;
/** Per-system persistent state, initialised once. */
export type Local<T> = T;

/** Buffered-event reader (drains the buffer for the current schedule run). */
export interface EventReader<E extends object> {
	forEach(cb: (event: E) => void): void;
	size(): number;
}

/** Typed `send` handle for buffered events. */
export interface EventWriter<E extends object> {
	send(event: E): void;
}

// ─── Commands / World runtime surfaces (implemented Phases 2–3) ──────────────

export interface Commands {
	spawn(...bundle: ReadonlyArray<object>): void;
	despawn(entity: Entity): void;
	insert(entity: Entity, componentOrTag: object | Ctor): void;
	set<T extends object>(entity: Entity, component: Ctor<T>, value: T): void;
	remove(entity: Entity, component: Ctor): void;
	send(event: object): void;
	trigger(event: object): void;
	relate(source: Entity, relation: Ctor, target: Entity, data?: object): void;
	unrelate(source: Entity, relation: Ctor, target: Entity): void;
	runSchedule(schedule: Ctor): void;
}

export interface World {
	spawn(...bundle: ReadonlyArray<object>): Entity;
	despawn(entity: Entity): void;
	insert(entity: Entity, componentOrTag: object | Ctor): void;
	set<T extends object>(entity: Entity, component: Ctor<T>, value: T): void;
	remove(entity: Entity, component: Ctor): void;
	has(entity: Entity, component: Ctor): boolean;
	get<T extends object>(entity: Entity, component: Ctor<T>): T | undefined;
	resource<T extends object>(resource: Ctor<T>): T;
	insertResource(instance: object): void;
	relate(source: Entity, relation: Ctor, target: Entity, data?: object): void;
	unrelate(source: Entity, relation: Ctor, target: Entity): void;
	hasRelation(source: Entity, relation: Ctor, target: Entity): boolean;
	getRelation<T extends object>(source: Entity, relation: Ctor<T>, target: Entity): T | undefined;
	trigger(event: object): void;
	runSchedule(schedule: Ctor): void;
	flush(): void;
}

// ─── SystemSet (nominal marker base — a real runtime value) ──────────────────

/**
 * Extend to declare a system set. `extends SystemSet` is the type marker that
 * makes a class accepted as `set:`. Optional `@set({label})` adds a debug name.
 */
export abstract class SystemSet {
	static readonly label?: string;
}
