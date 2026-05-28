/**
 * Events + observers. `@event` → a capacity-bounded buffer (for `send` /
 * `EventReader`) plus a priority-sorted observer list (for `trigger`).
 * `commands.trigger` is deferred (dispatched at flush, re-entering the
 * convergence loop); `world.trigger` is immediate. Buffers drain at the
 * schedule-run boundary.
 */

import type { Ctor, ObserverReg, ParamDescriptor } from "../contract";
import type { CommandsImpl } from "./commands";
import type { ResolveCtx } from "./resolve-param";
import { resolveParams } from "./resolve-param";
import type { RovyWorld } from "./world";

interface ObserverEntry {
	ctor: Ctor;
	instance: { run: (self: unknown, ...args: Array<unknown>) => void };
	priority: number;
	params: ReadonlyArray<ParamDescriptor>;
}

interface EventBuffer {
	capacity?: number;
	buffer: Array<object>;
	observers: Array<ObserverEntry>;
}

export class EventRegistry {
	private buffers = new Map<Ctor, EventBuffer>();
	/** Supplies world/commands/queries for observer param resolution. */
	resolveBase?: () => Omit<ResolveCtx, "event" | "locals">;

	registerEvent(ctor: Ctor, capacity?: number): void {
		if (!this.buffers.has(ctor)) {
			this.buffers.set(ctor, { capacity, buffer: [], observers: [] });
		}
	}

	hasEvent(ctor: Ctor): boolean {
		return this.buffers.has(ctor);
	}

	registerObserver(reg: ObserverReg): void {
		const buf = this.buffers.get(reg.event);
		assert(
			buf !== undefined,
			`[rovy] @observer for unregistered @event: ${tostring(reg.event)}`,
		);
		const factory = reg.ctor as unknown as new () => {
			run: (self: unknown, ...a: Array<unknown>) => void;
		};
		buf.observers.push({ ctor: reg.ctor, instance: new factory(), priority: reg.priority, params: reg.params });
		// higher priority first; stable
		buf.observers.sort((a, b) => a.priority > b.priority);
	}

	private bufferOf(event: object): EventBuffer | undefined {
		return this.buffers.get(getmetatable(event) as unknown as Ctor);
	}

	/** Buffered path (`commands.send` / `EventWriter`). */
	send(event: object): void {
		const buf = this.bufferOf(event);
		if (buf === undefined) return; // not an @event — silently ignore
		buf.buffer.push(event);
		if (buf.capacity !== undefined && buf.buffer.size() > buf.capacity) {
			buf.buffer.shift(); // drop oldest
		}
	}

	/** Observer path (`commands.trigger` deferred / `world.trigger` immediate). */
	dispatch(event: object): void {
		const buf = this.bufferOf(event);
		if (buf === undefined) return;
		const base = this.resolveBase;
		assert(base !== undefined, "[rovy] event registry not wired (App not started?)");
		for (const obs of buf.observers) {
			const resolvedBase = base();
			const runObserver = () => {
				const resourceScope = resolvedBase.world.beginResourceScope();
				const ctx: ResolveCtx = {
					...resolvedBase,
					event,
					locals: new Map(),
					resourceScope,
				};
				const args = resolveParams(obs.params, ctx);
				obs.instance.run(obs.instance, ...args);
				resolvedBase.world.commitResourceScope(resourceScope);
			};
			const lifecycle = resolvedBase.world.lifecycle;
			if (lifecycle !== undefined) {
				lifecycle.withRunScope(
					{ kind: "observer_started", ctor: obs.ctor, event },
					{ kind: "observer_finished", ctor: obs.ctor, event },
					runObserver,
				);
			} else {
				runObserver();
			}
		}
	}

	readerForEach(event: Ctor, cb: (e: object) => void): void {
		const buf = this.buffers.get(event);
		if (buf === undefined) return;
		for (const e of buf.buffer) cb(e);
	}

	readerSize(event: Ctor): number {
		const buf = this.buffers.get(event);
		return buf !== undefined ? buf.buffer.size() : 0;
	}

	/** Drain all buffers (called at the schedule-run boundary). */
	clearAll(): void {
		for (const [, buf] of this.buffers) {
			while (buf.buffer.size() > 0) buf.buffer.pop();
		}
	}
}

export class EventReaderHandle {
	constructor(
		private registry: EventRegistry,
		private event: Ctor,
	) {}
	forEach(cb: (e: object) => void): void {
		this.registry.readerForEach(this.event, cb);
	}
	size(): number {
		return this.registry.readerSize(this.event);
	}
}

export class EventWriterHandle {
	constructor(
		private registry: EventRegistry,
		private _event: Ctor,
	) {}
	send(event: object): void {
		this.registry.send(event);
	}
}

/** Wire commands/world deferred hooks into the registry. */
export function wireEvents(
	registry: EventRegistry,
	commands: CommandsImpl,
	world: RovyWorld,
): void {
	commands.deferredSend = (e) => registry.send(e);
	commands.deferredTrigger = (e) => registry.dispatch(e);
	world.triggerImpl = (e) => registry.dispatch(e);
}
