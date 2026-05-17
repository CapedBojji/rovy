/**
 * Positional param resolution. The transformer emits an ordered
 * `ParamDescriptor[]`; the runtime maps each to a concrete value at call time.
 * Phase 4 covers the kinds systems need now; query/event channels arrive in
 * phases 5/6 and currently throw a clear "not until phase N" error so wiring
 * gaps surface loudly instead of as nil.
 */

import type { Ctor, ParamDescriptor } from "../contract";
import type { CommandsImpl } from "./commands";
import type { EventReaderHandle, EventRegistry, EventWriterHandle } from "./events";
import { FilteredQueryHandle, hasTickFilters, QueryHandle } from "./query";
import type { QueryLike } from "./query";
import type { RovyWorld } from "./world";

/** Per-instance Local<T> slots, keyed by the descriptor's index. */
export type LocalStore = Map<number, unknown>;

export interface ResolveCtx {
	world: RovyWorld;
	commands: CommandsImpl;
	/** App-scoped collector singletons keyed by ctor. */
	collectors: Map<Ctor, object>;
	/** Local slots for the system/observer/monitor instance being invoked. */
	locals: LocalStore;
	/** Monitor-only: the matched entity + bound term values (Phase 8). */
	entity?: unknown;
	terms?: ReadonlyArray<unknown>;
	/** Observer-only: the triggering event instance (Phase 6). */
	event?: unknown;
	/** Hoisted query handles by descriptor id. */
	queries: Map<string, QueryLike>;
	/** Consuming system's last-run tick (drives Changed/Added/Removed). -1 first run. */
	lastRunTick: number;
	/** Event buffers/observers registry. */
	events: EventRegistry;
	/** Factories so each resolve builds a fresh handle bound to the ctx event ctor. */
	makeReader: (registry: EventRegistry, event: Ctor) => EventReaderHandle;
	makeWriter: (registry: EventRegistry, event: Ctor) => EventWriterHandle;
}

export function resolveParam(p: ParamDescriptor, ctx: ResolveCtx): unknown {
	switch (p.kind) {
		case "commands":
			return ctx.commands;
		case "world":
			return ctx.world;
		case "collect": {
			const collect = ctx.collectors.get(p.ctor);
			assert(collect !== undefined, `[rovy] missing @collect instance for ${tostring(p.ctor)}`);
			return collect;
		}
		case "res":
		case "resMut":
			return ctx.world.resource(p.ctor as unknown as new () => object);
		case "optRes":
			return ctx.world.optResource(p.ctor as unknown as new () => object);
		case "local": {
			let v = ctx.locals.get(p.index);
			if (v === undefined) {
				v = p.init !== undefined ? p.init() : {};
				ctx.locals.set(p.index, v);
			}
			return v;
		}
		case "entity":
			assert(ctx.entity !== undefined, "[rovy] 'entity' param outside a monitor context");
			return ctx.entity;
		case "term": {
			assert(ctx.terms !== undefined, "[rovy] 'term' param outside a monitor context");
			return ctx.terms[p.index];
		}
		case "event":
			assert(ctx.event !== undefined, "[rovy] 'event' param outside an observer context");
			return ctx.event;
		case "query": {
			const h = ctx.queries.get(p.handle);
			assert(h !== undefined, `[rovy] no hoisted query for handle '${p.handle}'`);
			const d = h.getDescriptor();
			if (hasTickFilters(d)) {
				assert(
					h instanceof QueryHandle,
					"[rovy] tick filters (Changed/Added/Removed) on a trait query unsupported",
				);
				return new FilteredQueryHandle(h, ctx.world, d, ctx.lastRunTick);
			}
			return h;
		}
		case "eventReader":
			return ctx.makeReader(ctx.events, p.ctor);
		case "eventWriter":
			return ctx.makeWriter(ctx.events, p.ctor);
	}
}

export function resolveParams(params: ReadonlyArray<ParamDescriptor>, ctx: ResolveCtx): Array<unknown> {
	const out = new Array<unknown>(params.size());
	for (let i = 0; i < params.size(); i++) {
		out[i] = resolveParam(params[i], ctx);
	}
	return out;
}
