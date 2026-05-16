/**
 * Scheduler — the injection spine. Builds schedule → set → system structure
 * from the registry, runs systems in `configureSets` order with intra-set
 * after/before topological ordering, flushes at set boundaries, and bumps
 * `world.changeTick` once per (outer) schedule run. `commands.runSchedule`
 * re-entrancy reuses the same flush loop and defers the tick bump to the
 * outermost run.
 */

import type { Ctor, RovyRegistry, SystemReg } from "../contract";
import type { CommandsImpl } from "./commands";
import type { EventReaderHandle, EventRegistry, EventWriterHandle } from "./events";
import { flush } from "./flush";
import type { QueryLike } from "./query";
import type { LocalStore } from "./resolve-param";
import { resolveParams } from "./resolve-param";
import type { RovyWorld } from "./world";

type SystemInstance = { run: (self: unknown, ...args: Array<unknown>) => void };

interface SystemRun {
	reg: SystemReg;
	instance: SystemInstance;
	locals: LocalStore;
	regIndex: number;
}

interface ScheduleDef {
	runOnStart: boolean;
	/** Configured set order; ungrouped systems run last in an implicit bucket. */
	setOrder: Array<Ctor>;
	/** set ctor (or UNGROUPED) → systems */
	bySet: Map<Ctor, Array<SystemRun>>;
}

const UNGROUPED = {} as unknown as Ctor;

export class Scheduler {
	private schedules = new Map<Ctor, ScheduleDef>();
	private pendingSetOrder = new Map<Ctor, Array<Ctor>>();
	private instances = new Map<Ctor, SystemInstance>();
	private lastRunTick = new Map<Ctor, number>();
	private depth = 0;
	/** Hoisted query handles (set by App after finalize). */
	queries = new Map<string, QueryLike>();
	/** Event registry + handle factories (set by App after finalize). */
	events!: EventRegistry;
	makeReader!: (registry: EventRegistry, event: Ctor) => EventReaderHandle;
	makeWriter!: (registry: EventRegistry, event: Ctor) => EventWriterHandle;
	/** Monitor reconcile, run after every set-boundary flush (set by App). */
	onFlush?: () => void;

	constructor(
		private world: RovyWorld,
		private commands: CommandsImpl,
	) {}

	/** Declared via app.configureSets before start(). */
	configureSets(schedule: Ctor, order: ReadonlyArray<Ctor>): void {
		this.pendingSetOrder.set(schedule, [...order]);
	}

	/** Finalize: group registry systems by schedule/set. */
	build(registry: RovyRegistry): void {
		for (const entry of registry.schedules) {
			this.schedules.set(entry.ctor, {
				runOnStart: entry.runOnStart,
				setOrder: this.pendingSetOrder.get(entry.ctor) ?? [],
				bySet: new Map<Ctor, Array<SystemRun>>(),
			});
		}

		registry.systems.forEach((reg, i) => {
			const def = this.schedules.get(reg.schedule);
			assert(
				def !== undefined,
				`[rovy] system registered for unknown @schedule: ${tostring(reg.schedule)}`,
			);
			const setKey = reg.set ?? UNGROUPED;
			let bucket = def.bySet.get(setKey);
			if (bucket === undefined) {
				bucket = [];
				def.bySet.set(setKey, bucket);
			}
			const factory = reg.ctor as unknown as new () => SystemInstance;
			let instance = this.instances.get(reg.ctor);
			if (instance === undefined) {
				instance = new factory();
				this.instances.set(reg.ctor, instance);
				this.lastRunTick.set(reg.ctor, -1);
			}
			bucket.push({ reg, instance, locals: new Map(), regIndex: i });
		});
	}

	hasSchedule(schedule: Ctor): boolean {
		return this.schedules.has(schedule);
	}

	runOnStartList(): Array<Ctor> {
		const out: Array<Ctor> = [];
		for (const [ctor, def] of this.schedules) {
			if (def.runOnStart) out.push(ctor);
		}
		return out;
	}

	run(schedule: Ctor): void {
		const def = this.schedules.get(schedule);
		assert(def !== undefined, `[rovy] unknown schedule: ${tostring(schedule)}`);

		this.depth += 1;

		// configured sets in order, then the implicit ungrouped bucket
		const order: Array<Ctor> = [...def.setOrder];
		if (def.bySet.has(UNGROUPED)) order.push(UNGROUPED);

		for (const setKey of order) {
			const bucket = def.bySet.get(setKey);
			if (bucket === undefined || bucket.size() === 0) continue;
			for (const sr of this.topoSort(bucket)) {
				if (sr.reg.runIf !== undefined && !sr.reg.runIf()) continue;
				const args = resolveParams(sr.reg.params, {
					world: this.world,
					commands: this.commands,
					locals: sr.locals,
					queries: this.queries,
					events: this.events,
					makeReader: this.makeReader,
					makeWriter: this.makeWriter,
					lastRunTick: this.lastRunTick.get(sr.reg.ctor) ?? -1,
				});
				sr.instance.run(sr.instance, ...args);
				this.lastRunTick.set(sr.reg.ctor, this.world.changeTick);
			}
			flush(this.commands); // set boundary
			if (this.onFlush !== undefined) this.onFlush(); // monitor reconcile
		}

		this.depth -= 1;
		if (this.depth === 0) {
			this.world.changeTick += 1;
			this.events.clearAll(); // event buffers live for one schedule run
			this.world.clearRemoved(); // removed buffers drained per run
		}
	}

	/** Stable topological sort by after/before within a set. */
	private topoSort(bucket: Array<SystemRun>): Array<SystemRun> {
		const present = new Map<Ctor, SystemRun>();
		for (const sr of bucket) present.set(sr.reg.ctor, sr);

		const indeg = new Map<SystemRun, number>();
		const edges = new Map<SystemRun, Array<SystemRun>>();
		for (const sr of bucket) {
			indeg.set(sr, 0);
			edges.set(sr, []);
		}
		const addEdge = (a: SystemRun, b: SystemRun) => {
			// a runs before b
			edges.get(a)!.push(b);
			indeg.set(b, indeg.get(b)! + 1);
		};
		for (const sr of bucket) {
			for (const afterCtor of sr.reg.after ?? []) {
				const dep = present.get(afterCtor);
				if (dep !== undefined) addEdge(dep, sr);
			}
			for (const beforeCtor of sr.reg.before ?? []) {
				const dep = present.get(beforeCtor);
				if (dep !== undefined) addEdge(sr, dep);
			}
		}

		// Kahn, ties broken by registration index for determinism
		const ready: Array<SystemRun> = [];
		for (const sr of bucket) if (indeg.get(sr) === 0) ready.push(sr);
		ready.sort((x, y) => x.regIndex < y.regIndex);

		const out: Array<SystemRun> = [];
		while (ready.size() > 0) {
			const node = ready.shift()!;
			out.push(node);
			for (const nxt of edges.get(node)!) {
				indeg.set(nxt, indeg.get(nxt)! - 1);
				if (indeg.get(nxt) === 0) {
					ready.push(nxt);
					ready.sort((x, y) => x.regIndex < y.regIndex);
				}
			}
		}
		assert(
			out.size() === bucket.size(),
			"[rovy] cyclic after/before constraints in a system set",
		);
		return out;
	}
}
