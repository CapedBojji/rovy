/**
 * Query runtime. A hoisted `QueryDescriptor` becomes a `QueryHandle` at
 * finalize. Phase 5 scope: structural terms — Entity, component, Optional —
 * plus With/Without filters. Trait/AllTraits/Pair terms and tick filters
 * (Changed/Added/Removed) are later phases and currently rejected loudly.
 *
 * jecs query semantics: `world:query(a, b)` yields `(entity, aVal, bVal)` for
 * entities holding all of a,b. Optional terms are NOT query args (that would
 * filter); they are fetched per-row via `world:get`, so the row still appears
 * when absent.
 */

import type { Archetype, CachedQuery, Id } from "@rbxts/jecs";
import type { Ctor, QueryDescriptor } from "../contract";
import type { Entity } from "../types";
import type { RovyWorld } from "./world";

/** Lua-table row + length so Optional `undefined` holes survive `table.unpack`. */
interface Row {
	values: { [k: number]: unknown };
	n: number;
}

declare const table: {
	unpack: <T>(list: { [k: number]: T }, i: number, j: number) => LuaTuple<Array<T>>;
};

type AnyCached = CachedQuery<Array<Id>>;
type AnyArchetype = Archetype<Array<Id>>;

export class QueryHandle {
	/** Required component ctors in jecs-arg order (drives result interleaving). */
	private required: Array<Ctor> = [];
	private withIds: Array<Entity> = [];
	private withoutIds: Array<Entity> = [];

	constructor(
		private world: RovyWorld,
		private descriptor: QueryDescriptor,
	) {
		for (const term of descriptor.terms) {
			if (term.t === "component") {
				this.required.push(term.ctor);
			} else if (term.t === "entity" || term.t === "optional") {
				// entity: jecs-implicit; optional: fetched per row
			} else {
				error(`[rovy] query term '${term.t}' not implemented until a later phase`);
			}
		}
		const f = descriptor.filters;
		const map = (c: Ctor) => {
			const id = this.world.componentMap.get(c);
			assert(id !== undefined, `[rovy] query filter on unregistered component: ${tostring(c)}`);
			return id;
		};
		for (const c of f.with ?? []) this.withIds.push(map(c));
		for (const c of f.without ?? []) this.withoutIds.push(map(c));
		// Changed<C>/Added<C> imply the entity HAS C → structural With so the
		// jecs query constrains correctly even when C isn't a bound term.
		// (Removed<C> is the opposite — handled entirely by FilteredQueryHandle.)
		for (const c of f.changed ?? []) this.withIds.push(map(c));
		for (const c of f.added ?? []) this.withIds.push(map(c));
		if ((f.hasTrait ?? []).size() + (f.hasPair ?? []).size() > 0) {
			error("[rovy] HasTrait/HasPair not implemented until phases 9/10");
		}
	}

	getDescriptor(): QueryDescriptor {
		return this.descriptor;
	}

	/** Live archetype membership test (jecs cached query). */
	has(entity: Entity): boolean {
		return (this.buildJecsQuery() as unknown as CachedQuery<Array<Id>>).has(entity);
	}

	/** All currently-matching entities (for monitor reconcile). */
	members(): Array<Entity> {
		const out: Array<Entity> = [];
		this.each((entity) => {
			out.push(entity);
			return true;
		});
		return out;
	}

	/** Public row iteration for FilteredQueryHandle. */
	iterate(visit: (entity: Entity, arch: AnyArchetype, row: number) => boolean): void {
		this.each(visit);
	}
	buildRow(entity: Entity, arch: AnyArchetype, row: number): Row {
		return this.assemble(entity, this.requiredValues(arch, row));
	}

	private cached?: AnyCached;

	/** Build once, `:cached()` so `archetypes()` works and stays live. */
	private buildJecsQuery(): AnyCached {
		if (this.cached !== undefined) return this.cached;
		const ids: Array<Entity> = [];
		for (const c of this.required) {
			const id = this.world.componentMap.get(c);
			assert(id !== undefined, `[rovy] query on unregistered component: ${tostring(c)}`);
			ids.push(id);
		}
		// jecs requires ≥1 positional component. If nothing is bound (e.g.
		// Entity-only + Changed<C>), promote the first With id to a query arg
		// (still constrains; its value is never read).
		const withList = [...this.withIds];
		if (ids.size() === 0) {
			assert(withList.size() > 0, "[rovy] query has no terms or constraints");
			ids.push(withList.shift()!);
		}
		let q = this.world.jecs.query(...(ids as never[]));
		if (withList.size() > 0) q = q.with(...(withList as never[]));
		if (this.withoutIds.size() > 0) q = q.without(...(this.withoutIds as never[]));
		this.cached = q.cached() as unknown as AnyCached;
		return this.cached;
	}

	/**
	 * Iterate via `query:archetypes()` + column indexing — avoids the jecs
	 * iterator's multi-return, which roblox-ts mangles
	 * (`table.pack(it())` → `table.pack({ it() })`).
	 */
	private each(visit: (entity: Entity, arch: AnyArchetype, row: number) => boolean): void {
		const q = this.buildJecsQuery();
		const archetypes = q.archetypes();
		for (const arch of archetypes) {
			const ents = arch.entities as unknown as Array<Entity>;
			const count = ents.size();
			for (let i = 1; i <= count; i++) {
				if (!visit(ents[i - 1], arch, i)) return;
			}
		}
	}

	/** Required component value for a row from the archetype columns. */
	private requiredValues(arch: AnyArchetype, row: number): Array<defined> {
		const cols = arch.columns_map as unknown as { [id: number]: { [i: number]: unknown } };
		const out: Array<defined> = [];
		for (const c of this.required) {
			const id = this.world.componentMap.get(c) as unknown as number;
			out.push(cols[id][row] as defined);
		}
		return out;
	}

	/** Assemble a declared-order row from (entity, ...requiredValues). */
	private assemble(entity: Entity, values: Array<unknown>): Row {
		const out: { [k: number]: unknown } = {};
		let n = 0;
		let vi = 0;
		for (const term of this.descriptor.terms) {
			n += 1;
			if (term.t === "entity") {
				out[n] = entity;
			} else if (term.t === "component") {
				out[n] = values[vi];
				vi += 1;
			} else if (term.t === "optional") {
				out[n] = this.world.get(entity, term.ctor as Ctor<object>); // may be nil
			}
		}
		return { values: out, n };
	}

	forEach(cb: (...row: Array<unknown>) => void): void {
		this.each((entity, arch, rowIdx) => {
			const row = this.assemble(entity, this.requiredValues(arch, rowIdx));
			cb(...table.unpack(row.values, 1, row.n));
			return true;
		});
	}

	size(): number {
		let count = 0;
		this.each(() => {
			count += 1;
			return true;
		});
		return count;
	}

	/** First row as a LuaTuple, or undefined when empty. */
	first(): LuaTuple<Array<unknown>> | undefined {
		const q = this.buildJecsQuery();
		for (const arch of q.archetypes()) {
			const ents = arch.entities as unknown as Array<Entity>;
			if (ents.size() > 0) {
				const entity = ents[0];
				const row = this.assemble(entity, this.requiredValues(arch, 1));
				// returned directly so the LuaTuple isn't collapsed by a temp var
				return table.unpack(row.values, 1, row.n);
			}
		}
		return undefined;
	}

	/** Pair-target narrowing — Phase 10. */
	withTarget(_target: Entity): this {
		return error("[rovy] query.withTarget (Pair) not implemented until Phase 10");
	}

	iter(): IterableFunction<LuaTuple<Array<unknown>>> {
		const rows: Array<Row> = [];
		this.each((entity, arch, rowIdx) => {
			rows.push(this.assemble(entity, this.requiredValues(arch, rowIdx)));
			return true;
		});
		let i = 0;
		return (() => {
			i += 1;
			if (i > rows.size()) return undefined;
			const r = rows[i - 1];
			return table.unpack(r.values, 1, r.n);
		}) as unknown as IterableFunction<LuaTuple<Array<unknown>>>;
	}
}

export function buildQueryHandle(world: RovyWorld, descriptor: QueryDescriptor): QueryHandle {
	return new QueryHandle(world, descriptor);
}

/**
 * Per-consumer tick-filtered view over a base QueryHandle. Built fresh each
 * param resolution because `Changed/Added/Removed` are relative to the
 * consuming system's `lastRunTick`. `Removed<C>` ignores the live query
 * (component is gone) and drains the removed buffer; the row binds Entity only.
 */
export class FilteredQueryHandle {
	private changedIds: Array<Entity> = [];
	private addedIds: Array<Entity> = [];
	private removedId?: Entity;

	constructor(
		private base: QueryHandle,
		private world: RovyWorld,
		private descriptor: QueryDescriptor,
		private lastRunTick: number,
	) {
		const f = descriptor.filters;
		const idOf = (c: Ctor): Entity => {
			const id = world.componentMap.get(c);
			assert(id !== undefined, `[rovy] tick filter on unregistered component: ${tostring(c)}`);
			return id;
		};
		for (const c of f.changed ?? []) this.changedIds.push(idOf(c));
		for (const c of f.added ?? []) this.addedIds.push(idOf(c));
		const rem = f.removed ?? [];
		if (rem.size() > 0) {
			assert(rem.size() === 1, "[rovy] only one Removed<C> per query");
			this.removedId = idOf(rem[0]);
		}
	}

	private tickPass(entity: Entity): boolean {
		for (const id of this.changedIds) {
			const tk = this.world.changedTickOf(id, entity);
			if (tk === undefined || tk <= this.lastRunTick) return false;
		}
		for (const id of this.addedIds) {
			const tk = this.world.addedTickOf(id, entity);
			if (tk === undefined || tk <= this.lastRunTick) return false;
		}
		return true;
	}

	/** Removed row = Entity only, in declared term order. */
	private removedRow(entity: Entity): { values: { [k: number]: unknown }; n: number } {
		const values: { [k: number]: unknown } = {};
		let n = 0;
		for (const term of this.descriptor.terms) {
			n += 1;
			assert(term.t === "entity", "[rovy] Removed<C> query may only bind Entity");
			values[n] = entity;
		}
		if (n === 0) {
			n = 1;
			values[1] = entity;
		}
		return { values, n };
	}

	forEach(cb: (...row: Array<unknown>) => void): void {
		if (this.removedId !== undefined) {
			for (const e of this.world.removedSince(this.removedId, this.lastRunTick)) {
				const r = this.removedRow(e);
				cb(...table.unpack(r.values, 1, r.n));
			}
			return;
		}
		this.base.iterate((entity, arch, rowIdx) => {
			if (this.tickPass(entity)) {
				const r = this.base.buildRow(entity, arch, rowIdx);
				cb(...table.unpack(r.values, 1, r.n));
			}
			return true;
		});
	}

	size(): number {
		let count = 0;
		this.forEach(() => {
			count += 1;
		});
		return count;
	}

	first(): LuaTuple<Array<unknown>> | undefined {
		if (this.removedId !== undefined) {
			const list = this.world.removedSince(this.removedId, this.lastRunTick);
			if (list.size() > 0) {
				const r = this.removedRow(list[0]);
				return table.unpack(r.values, 1, r.n);
			}
			return undefined;
		}
		let found: { values: { [k: number]: unknown }; n: number } | undefined;
		this.base.iterate((entity, arch, rowIdx) => {
			if (this.tickPass(entity)) {
				found = this.base.buildRow(entity, arch, rowIdx);
				return false;
			}
			return true;
		});
		if (found === undefined) return undefined;
		return table.unpack(found.values, 1, found.n);
	}

	withTarget(_t: Entity): this {
		return error("[rovy] withTarget on a filtered query — Phase 10");
	}

	iter(): IterableFunction<LuaTuple<Array<unknown>>> {
		const rows: Array<{ values: { [k: number]: unknown }; n: number }> = [];
		if (this.removedId !== undefined) {
			for (const e of this.world.removedSince(this.removedId, this.lastRunTick)) {
				rows.push(this.removedRow(e));
			}
		} else {
			this.base.iterate((entity, arch, rowIdx) => {
				if (this.tickPass(entity)) rows.push(this.base.buildRow(entity, arch, rowIdx));
				return true;
			});
		}
		let i = 0;
		return (() => {
			i += 1;
			if (i > rows.size()) return undefined;
			const r = rows[i - 1];
			return table.unpack(r.values, 1, r.n);
		}) as unknown as IterableFunction<LuaTuple<Array<unknown>>>;
	}
}

export function hasTickFilters(d: QueryDescriptor): boolean {
	const f = d.filters;
	return (f.changed ?? []).size() + (f.added ?? []).size() + (f.removed ?? []).size() > 0;
}
