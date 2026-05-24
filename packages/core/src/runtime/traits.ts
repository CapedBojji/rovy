/**
 * Trait queries. Traits are interfaces (erased); the registry maps a stable
 * trait id → implementer component classes. There is no `jecs.Or` (spike), so
 * `Trait<T>` / `AllTraits<T>` / `HasTrait<T>` are realised by unioning
 * per-implementer membership:
 *
 * - `Trait<T>`     → one row per *present implementer* (entity with two impls
 *                    yields two rows), the impl instance bound as `T`.
 * - `AllTraits<T>` → one row per entity, an array of all present impls.
 * - `HasTrait<T>`  → filter only (entity has ≥1 impl), no binding.
 *
 * Candidate entities = structural base (regular component terms + With/Without)
 * intersected with "has ≥1 implementer". Implemented on public jecs APIs only.
 */

import type { Ctor, QueryDescriptor, StableId } from "../contract";
import type { Entity } from "../types";
import type { QueryLike } from "./query";
import type { RovyWorld } from "./world";

export type ResolvedTraits = Map<StableId, Array<{ ctor: Ctor; jecsId: Entity }>>;

declare const table: {
	unpack: <T>(list: { [k: number]: T }, i: number, j: number) => LuaTuple<Array<T>>;
};

export class TraitQueryHandle implements QueryLike {
	private required: Array<Ctor> = [];
	private withCtors: Array<Ctor> = [];
	private withoutCtors: Array<Ctor> = [];
	private traitTermId?: StableId;
	private allTraitsTermId?: StableId;
	private hasTraitIds: Array<StableId> = [];

	constructor(
		private world: RovyWorld,
		private descriptor: QueryDescriptor,
		private traits: ResolvedTraits,
	) {
		for (const term of descriptor.terms) {
			if (term.t === "component") this.required.push(term.ctor);
			else if (term.t === "optional") {
				/* fetched per row */
			} else if (term.t === "entity") {
				/* implicit */
			} else if (term.t === "trait") {
				this.traitTermId = term.traitId;
			} else if (term.t === "allTraits") {
				this.allTraitsTermId = term.traitId;
			} else {
				error(`[rovy] TraitQueryHandle: term '${term.t}' unsupported (Pair = Phase 10)`);
			}
		}
		const f = descriptor.filters;
		for (const c of f.with ?? []) this.withCtors.push(c);
		for (const c of f.without ?? []) this.withoutCtors.push(c);
		for (const id of f.hasTrait ?? []) this.hasTraitIds.push(id);
		if ((f.hasPair ?? []).size() > 0) error("[rovy] HasPair = Phase 10");
	}

	getDescriptor(): QueryDescriptor {
		return this.descriptor;
	}

	private idOf(c: Ctor): Entity {
		return this.world.componentId(c);
	}

	private impls(traitId: StableId): Array<{ ctor: Ctor; jecsId: Entity }> {
		const list = this.traits.get(traitId);
		assert(list !== undefined, `[rovy] unknown trait id: ${traitId}`);
		return list;
	}

	/** Candidate entities: structural base ∩ (≥1 impl of the trait term/filter). */
	private candidates(): Array<Entity> {
		const seen = new Set<Entity>();
		const out: Array<Entity> = [];
		const add = (e: Entity) => {
			if (!seen.has(e)) {
				seen.add(e);
				out.push(e);
			}
		};

		// union of implementer-bearing entities for the binding/filter trait
		const unionIds: Array<Entity> = [];
		if (this.traitTermId !== undefined) for (const im of this.impls(this.traitTermId)) unionIds.push(im.jecsId);
		if (this.allTraitsTermId !== undefined)
			for (const im of this.impls(this.allTraitsTermId)) unionIds.push(im.jecsId);
		for (const id of this.hasTraitIds) for (const im of this.impls(id)) unionIds.push(im.jecsId);

		const passesStructural = (e: Entity): boolean => {
			for (const c of this.required) if (!this.world.jecs.has(e, this.idOf(c))) return false;
			for (const c of this.withCtors) if (!this.world.jecs.has(e, this.idOf(c))) return false;
			for (const c of this.withoutCtors) if (this.world.jecs.has(e, this.idOf(c))) return false;
			return true;
		};

		if (unionIds.size() > 0) {
			for (const implId of unionIds) {
				for (const e of this.world.jecs.each(implId as never)) {
					if (passesStructural(e)) add(e);
				}
			}
		} else if (this.required.size() > 0) {
			// no trait part (shouldn't route here) — fall back to first required
			for (const e of this.world.jecs.each(this.idOf(this.required[0]) as never)) {
				if (passesStructural(e)) add(e);
			}
		}
		return out;
	}

	private presentImpls(entity: Entity, traitId: StableId): Array<defined> {
		const res: Array<defined> = [];
		for (const im of this.impls(traitId)) {
			const v = this.world.jecs.get(entity, im.jecsId as never);
			if (v !== undefined) res.push(v as defined);
		}
		return res;
	}

	/** Build declared-order rows for one entity (Trait term → may be many). */
	private rows(entity: Entity): Array<{ values: { [k: number]: unknown }; n: number }> {
		const result: Array<{ values: { [k: number]: unknown }; n: number }> = [];
		// One row per present implementer for a Trait term; else a single row.
		const variantCount =
			this.traitTermId !== undefined ? this.presentImpls(entity, this.traitTermId).size() : 1;
		const traitImpls =
			this.traitTermId !== undefined ? this.presentImpls(entity, this.traitTermId) : undefined;

		for (let vi = 1; vi <= variantCount; vi++) {
			const values: { [k: number]: unknown } = {};
			let n = 0;
			for (const term of this.descriptor.terms) {
				n += 1;
				if (term.t === "entity") values[n] = entity;
				else if (term.t === "component") values[n] = this.world.get(entity, term.ctor as Ctor<object>);
				else if (term.t === "optional") values[n] = this.world.get(entity, term.ctor as Ctor<object>);
				else if (term.t === "trait") values[n] = traitImpls !== undefined ? traitImpls[vi - 1] : undefined;
				else if (term.t === "allTraits") values[n] = this.presentImpls(entity, term.traitId);
			}
			result.push({ values, n });
		}
		return result;
	}

	forEach(cb: (...row: Array<unknown>) => void): void {
		for (const e of this.candidates()) {
			for (const r of this.rows(e)) cb(...table.unpack(r.values, 1, r.n));
		}
	}

	iterateRows(visit: (entity: Entity, row: { values: { [k: number]: unknown }; n: number }) => boolean): void {
		for (const e of this.candidates()) {
			for (const r of this.rows(e)) {
				if (!visit(e, r)) return;
			}
		}
	}

	size(): number {
		let c = 0;
		for (const e of this.candidates()) c += this.rows(e).size();
		return c;
	}

	first(): LuaTuple<Array<unknown>> | undefined {
		for (const e of this.candidates()) {
			const rs = this.rows(e);
			if (rs.size() > 0) return table.unpack(rs[0].values, 1, rs[0].n);
		}
		return undefined;
	}

	iter(): IterableFunction<LuaTuple<Array<unknown>>> {
		const rows: Array<{ values: { [k: number]: unknown }; n: number }> = [];
		for (const e of this.candidates()) for (const r of this.rows(e)) rows.push(r);
		let i = 0;
		return (() => {
			i += 1;
			if (i > rows.size()) return undefined;
			const r = rows[i - 1];
			return table.unpack(r.values, 1, r.n);
		}) as unknown as IterableFunction<LuaTuple<Array<unknown>>>;
	}

	withTarget(_t: Entity): QueryLike {
		return error("[rovy] withTarget on a trait query — Pair is Phase 10");
	}

	has(entity: Entity): boolean {
		for (const e of this.candidates()) if (e === entity) return true;
		return false;
	}

	members(): Array<Entity> {
		return this.candidates();
	}
}

/** True when a descriptor needs trait expansion (routes to TraitQueryHandle). */
export function descriptorUsesTraits(d: QueryDescriptor): boolean {
	for (const term of d.terms) {
		if (term.t === "trait" || term.t === "allTraits") return true;
	}
	return (d.filters.hasTrait ?? []).size() > 0;
}
