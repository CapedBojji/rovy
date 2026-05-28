/**
 * Monitors — query-level lifecycle (`onEnter`/`onExit`/`onChange`).
 *
 * Spike outcome (test/spike-report.md): jecs `archetype_traverse_remove` /
 * `EcsOnArchetypeCreate` are unexported internals. So enter/exit use the
 * PUBLIC cached query: a per-monitor `wasMember` set reconciled against
 * `QueryHandle.members()` at flush + schedule-run boundaries. `onChange` is
 * immediate via the jecs `changed` hook on each term component (only while the
 * entity matches). This is the spike's chosen mitigation (per-run reconcile),
 * strictly on public API.
 */

import type { Ctor, MonitorReg, QueryDescriptor } from "../contract";
import type { ResolveCtx } from "./resolve-param";
import { resolveParams } from "./resolve-param";
import type { QueryLike } from "./query";
import type { Entity } from "../types";
import type { RovyWorld } from "./world";

interface MonitorState {
	ctor: Ctor;
	instance: { [m: string]: ((self: unknown, ...a: Array<unknown>) => void) | undefined };
	base: QueryLike;
	descriptor: QueryDescriptor;
	methods: Set<string>;
	params: MonitorReg["params"];
	was: Set<Entity>;
}

export class MonitorRegistry {
	private monitors: Array<MonitorState> = [];

	constructor(
		private world: RovyWorld,
		/** Supplies world/commands/queries/events for param resolution. */
		private resolveBase: () => Omit<ResolveCtx, "event" | "locals" | "entity" | "terms">,
	) {}

	register(reg: MonitorReg, base: QueryLike): void {
		const factory = reg.ctor as unknown as new () => MonitorState["instance"];
		const state: MonitorState = {
			ctor: reg.ctor,
			instance: new factory(),
			base,
			descriptor: base.getDescriptor(),
			methods: new Set(reg.methods),
			params: reg.params,
			was: new Set<Entity>(),
		};
		this.monitors.push(state);

		// onChange: immediate, per term component, only while matching
		if (state.methods.has("onChange")) {
			for (const term of state.descriptor.terms) {
				if (term.t === "component" || term.t === "optional") {
					const id = this.world.componentMap.get(term.ctor as Ctor);
					if (id !== undefined) {
						this.world.jecs.changed(id as never, (e: Entity) => {
							if (state.was.has(e) && state.base.has(e)) {
								this.call(state, "onChange", e);
							}
						});
					}
				}
			}
		}
	}

	/** Bound term values in declared order (entity / component / optional). */
	private terms(state: MonitorState, entity: Entity): Array<unknown> {
		// Lua-table with holes so an absent Optional stays `undefined` at its
		// index (roblox-ts arrays reject undefined elements).
		// 1-based to match roblox-ts Array indexing used by resolveParam
		// (`ctx.terms[p.index]` → Lua `terms[p.index + 1]`).
		const out: { [i: number]: unknown } = {};
		let i = 0;
		for (const term of state.descriptor.terms) {
			i += 1;
			if (term.t === "entity") {
				out[i] = entity;
			} else if (term.t === "component" || term.t === "optional") {
				out[i] = this.world.get(entity, term.ctor as Ctor<object>);
			}
			// trait/pair → left as nil (later phases)
		}
		return out as unknown as Array<unknown>;
	}

	private call(state: MonitorState, method: string, entity: Entity): void {
		const fn = state.instance[method];
		if (fn === undefined) return;
		const runMonitor = () => {
			const resourceScope = this.world.beginResourceScope();
			const ctx: ResolveCtx = {
				...this.resolveBase(),
				entity,
				terms: this.terms(state, entity),
				locals: new Map(),
				resourceScope,
			};
			const args = resolveParams(state.params, ctx);
			fn(state.instance, ...args);
			this.world.commitResourceScope(resourceScope);
		};
		const lifecycle = this.world.lifecycle;
		if (lifecycle !== undefined) {
			lifecycle.withRunScope(
				{ kind: "monitor_started", ctor: state.ctor, method, entity },
				{ kind: "monitor_finished", ctor: state.ctor, method, entity },
				runMonitor,
			);
		} else {
			runMonitor();
		}
	}

	/**
	 * Diff live membership vs `wasMember`. Covers enter/exit including the
	 * lost-excluded-term enter the hook path can't see pre-move. Called at
	 * flush + schedule-run boundaries and once after start().
	 */
	reconcileAll(): void {
		for (const state of this.monitors) {
			const current = new Set<Entity>();
			for (const e of state.base.members()) current.add(e);

			// entered
			for (const e of current) {
				if (!state.was.has(e)) {
					state.was.add(e);
					if (state.methods.has("onEnter")) this.call(state, "onEnter", e);
				}
			}
			// exited (read term values BEFORE this point is impossible — the
			// component may be gone; onExit binds what world.get still returns,
			// which for a removed component is undefined. Matches "Entity-only"
			// expectation for exit in the public-API design.)
			const gone: Array<Entity> = [];
			for (const e of state.was) {
				if (!current.has(e)) gone.push(e);
			}
			for (const e of gone) {
				state.was.delete(e);
				if (state.methods.has("onExit")) this.call(state, "onExit", e);
			}
		}
	}
}
