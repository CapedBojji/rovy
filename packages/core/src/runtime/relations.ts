/**
 * Relationship queries. `Pair<R>` binds `{ target, data? }`; `HasPair<R>` is
 * filter-only; `q.withTarget(e)` narrows to a specific target. Built on jecs
 * pairs (`pair(Rel, target)` / `pair(Rel, Wildcard)`). One row per matching
 * entity using its first target (common case); `withTarget` pins the target.
 */

import type { Ctor, QueryDescriptor } from "../contract";
import type { Entity } from "../types";
import type { QueryLike } from "./query";
import type { RovyWorld } from "./world";

declare const table: {
	unpack: <T>(list: { [k: number]: T }, i: number, j: number) => LuaTuple<Array<T>>;
};

export class RelationQueryHandle implements QueryLike {
	private required: Array<Ctor> = [];
	private withCtors: Array<Ctor> = [];
	private withoutCtors: Array<Ctor> = [];
	private pairRelation?: Ctor;
	private hasPairRelations: Array<Ctor> = [];
	private target?: Entity;

	constructor(
		private world: RovyWorld,
		private descriptor: QueryDescriptor,
	) {
		for (const term of descriptor.terms) {
			if (term.t === "component") this.required.push(term.ctor);
			else if (term.t === "pair") this.pairRelation = term.relation;
			else if (term.t === "entity" || term.t === "optional") {
				/* implicit / per-row */
			} else {
				error(`[rovy] RelationQueryHandle: term '${term.t}' unsupported here`);
			}
		}
		const f = descriptor.filters;
		for (const c of f.with ?? []) this.withCtors.push(c);
		for (const c of f.without ?? []) this.withoutCtors.push(c);
		for (const r of f.hasPair ?? []) this.hasPairRelations.push(r);
	}

	getDescriptor(): QueryDescriptor {
		return this.descriptor;
	}

	private idOf(c: Ctor): Entity {
		return this.world.componentId(c);
	}

	private passesStructural(e: Entity): boolean {
		for (const c of this.required) if (!this.world.jecs.has(e, this.idOf(c))) return false;
		for (const c of this.withCtors) if (!this.world.jecs.has(e, this.idOf(c))) return false;
		for (const c of this.withoutCtors) if (this.world.jecs.has(e, this.idOf(c))) return false;
		for (const r of this.hasPairRelations) {
			if (!this.world.jecs.has(e, this.world.wildcardPairId(r) as never)) return false;
		}
		return true;
	}

	private candidates(): Array<Entity> {
		const seen = new Set<Entity>();
		const out: Array<Entity> = [];
		const add = (e: Entity) => {
			if (!seen.has(e)) {
				seen.add(e);
				out.push(e);
			}
		};
		const rel = this.pairRelation;
		if (rel !== undefined) {
			if (this.target !== undefined) {
				const pid = this.world.pairId(rel, this.target);
				for (const e of this.world.jecs.each(pid as never)) if (this.passesStructural(e)) add(e);
			} else {
				const wid = this.world.wildcardPairId(rel);
				for (const e of this.world.jecs.each(wid as never)) if (this.passesStructural(e)) add(e);
			}
		} else if (this.hasPairRelations.size() > 0) {
			const wid = this.world.wildcardPairId(this.hasPairRelations[0]);
			for (const e of this.world.jecs.each(wid as never)) if (this.passesStructural(e)) add(e);
		} else if (this.required.size() > 0) {
			for (const e of this.world.jecs.each(this.idOf(this.required[0]) as never))
				if (this.passesStructural(e)) add(e);
		}
		return out;
	}

	private row(entity: Entity): { values: { [k: number]: unknown }; n: number } {
		const values: { [k: number]: unknown } = {};
		let n = 0;
		for (const term of this.descriptor.terms) {
			n += 1;
			if (term.t === "entity") values[n] = entity;
			else if (term.t === "component" || term.t === "optional")
				values[n] = this.world.get(entity, term.ctor as Ctor<object>);
			else if (term.t === "pair") {
				const tgt = this.target ?? this.world.relationTarget(entity, term.relation);
				const data =
					tgt !== undefined ? this.world.getRelation(entity, term.relation as Ctor<object>, tgt) : undefined;
				values[n] = { target: tgt, data };
			}
		}
		return { values, n };
	}

	iterateRows(visit: (entity: Entity, row: { values: { [k: number]: unknown }; n: number }) => boolean): void {
		for (const e of this.candidates()) {
			if (!visit(e, this.row(e))) return;
		}
	}

	forEach(cb: (...row: Array<unknown>) => void): void {
		for (const e of this.candidates()) {
			const r = this.row(e);
			cb(...table.unpack(r.values, 1, r.n));
		}
	}
	size(): number {
		return this.candidates().size();
	}
	first(): LuaTuple<Array<unknown>> | undefined {
		const c = this.candidates();
		if (c.size() === 0) return undefined;
		const r = this.row(c[0]);
		return table.unpack(r.values, 1, r.n);
	}
	iter(): IterableFunction<LuaTuple<Array<unknown>>> {
		const rows: Array<{ values: { [k: number]: unknown }; n: number }> = [];
		for (const e of this.candidates()) rows.push(this.row(e));
		let i = 0;
		return (() => {
			i += 1;
			if (i > rows.size()) return undefined;
			const r = rows[i - 1];
			return table.unpack(r.values, 1, r.n);
		}) as unknown as IterableFunction<LuaTuple<Array<unknown>>>;
	}
	withTarget(target: Entity): QueryLike {
		const clone = new RelationQueryHandle(this.world, this.descriptor);
		clone.target = target;
		return clone;
	}
	has(entity: Entity): boolean {
		for (const e of this.candidates()) if (e === entity) return true;
		return false;
	}
	members(): Array<Entity> {
		return this.candidates();
	}
}

export function descriptorUsesRelations(d: QueryDescriptor): boolean {
	for (const term of d.terms) if (term.t === "pair") return true;
	return (d.filters.hasPair ?? []).size() > 0;
}
