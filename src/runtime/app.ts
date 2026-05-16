/**
 * `App` — boot + finalize. Phase 2 scope: finalize steps 1–2 (components →
 * jecs ids; resources → ids + auto-instantiate default ctor; insertResource
 * override). Scheduler / events / monitors / plugins land in later phases.
 */

import { rovy } from "../rovy";
import type { Ctor } from "../contract";
import type { Entity } from "../types";
import { CommandsImpl } from "./commands";
import { EventReaderHandle, EventRegistry, EventWriterHandle, wireEvents } from "./events";
import { flush } from "./flush";
import { MonitorRegistry } from "./monitors";
import { buildQueryHandle } from "./query";
import { TraitQueryHandle, descriptorUsesTraits } from "./traits";
import type { ResolvedTraits } from "./traits";
import { RelationQueryHandle, descriptorUsesRelations } from "./relations";
import { Scheduler } from "./schedule";
import { RovyWorld } from "./world";

export class App {
	readonly world = new RovyWorld();
	readonly commands: CommandsImpl;
	readonly scheduler: Scheduler;
	readonly eventRegistry = new EventRegistry();
	private monitors?: MonitorRegistry;
	private started = false;
	/** Overrides supplied before start(); applied after resource registration. */
	private resourceOverrides = new Map<Ctor, object>();

	/** Plugin support is Phase 11 — accepted now, build() invoked at start. */
	private plugins: Array<{ build(app: App): void }> = [];

	constructor() {
		this.commands = new CommandsImpl(this.world);
		this.scheduler = new Scheduler(this.world, this.commands);
		// wire deferred command → scheduler / world hooks
		this.commands.deferredRunSchedule = (s) => this.scheduler.run(s);
		this.commands.deferredRelate = (s, r, t, d) => this.world.relate(s, r, t, d);
		this.commands.deferredUnrelate = (s, r, t) => this.world.unrelate(s, r, t);
		this.world.runScheduleImpl = (s) => this.scheduler.run(s);
		this.world.flushImpl = () => {
			flush(this.commands);
			this.monitors?.reconcileAll();
		};
	}

	/** Apply queued commands to convergence (escape hatch; scheduler flushes at set boundaries). */
	flush(): this {
		flush(this.commands);
		this.monitors?.reconcileAll();
		return this;
	}

	/** Declare set order within a schedule. Call before start() (e.g. in a plugin). */
	configureSets(schedule: Ctor, order: ReadonlyArray<Ctor>): this {
		this.scheduler.configureSets(schedule, order);
		return this;
	}

	/** Run a schedule now (drives the game loop). */
	runSchedule(schedule: Ctor): this {
		this.scheduler.run(schedule);
		return this;
	}

	addPlugin(plugin: { build(app: App): void }): this {
		this.plugins.push(plugin);
		return this;
	}

	/**
	 * Override an auto-registered resource's default. Before start(): queued.
	 * After start(): applied immediately.
	 */
	insertResource(instance: object): this {
		if (this.started) {
			this.world.insertResource(instance);
		} else {
			this.resourceOverrides.set(getmetatable(instance) as unknown as Ctor, instance);
		}
		return this;
	}

	/** Finalize the registry into a live world. Must run after rovy.loadPaths. */
	start(): this {
		assert(!this.started, "[rovy] app.start called twice");
		const reg = rovy.registry;
		assert(
			reg.components.size() > 0 ||
				reg.systems.size() > 0 ||
				reg.resources.size() > 0 ||
				reg.events.size() > 0 ||
				reg.observers.size() > 0 ||
				reg.schedules.size() > 0,
			"[rovy] empty registry — call rovy.loadPaths(...) before app.start()",
		);

		for (const plugin of this.plugins) {
			plugin.build(this);
		}

		// 1. components → jecs ids + change-detection hooks
		for (const entry of reg.components) {
			const id = this.world.registerComponent(entry.ctor);
			this.world.registerChangeDetection(id);
		}

		// 2. resources → jecs ids + auto-instantiate default ctor (or override)
		for (const entry of reg.resources) {
			this.world.registerResource(entry.ctor);
			const override = this.resourceOverrides.get(entry.ctor);
			if (override !== undefined) {
				this.world.setResource(entry.ctor, override);
			} else {
				const factory = entry.ctor as unknown as new () => object;
				this.world.setResource(entry.ctor, new factory());
			}
		}

		// any overrides for resources NOT in the registry (manual-only)
		for (const [cls, instance] of this.resourceOverrides) {
			if (this.world.resourceMap.get(cls) === undefined) {
				this.world.insertResource(instance);
			}
		}

		// 2c. relations → jecs relation ids + cleanup/exclusive policies
		for (const r of reg.relations) {
			this.world.registerRelation(r.ctor, {
				exclusive: r.exclusive,
				onTargetDelete: r.onTargetDelete,
				onDelete: r.onDelete,
			});
		}

		// 3a. resolve trait registry (stable id → implementer ctors+jecs ids)
		const resolvedTraits: ResolvedTraits = new Map();
		for (const [traitId, impls] of reg.traits) {
			const list: Array<{ ctor: Ctor; jecsId: Entity }> = [];
			for (const implCtor of impls) {
				const jid = this.world.componentMap.get(implCtor);
				assert(jid !== undefined, `[rovy] trait ${traitId} impl not a registered @component: ${tostring(implCtor)}`);
				list.push({ ctor: implCtor, jecsId: jid });
			}
			resolvedTraits.set(traitId, list);
		}

		// 3b. hoisted query handles (trait-using → TraitQueryHandle)
		for (const [id, descriptor] of reg.queries) {
			let handle;
			if (descriptorUsesRelations(descriptor)) {
				handle = new RelationQueryHandle(this.world, descriptor);
			} else if (descriptorUsesTraits(descriptor)) {
				handle = new TraitQueryHandle(this.world, descriptor, resolvedTraits);
			} else {
				handle = buildQueryHandle(this.world, descriptor);
			}
			this.scheduler.queries.set(id, handle);
		}

		// 4. events + observers
		for (const e of reg.events) {
			this.eventRegistry.registerEvent(e.ctor, e.capacity);
		}
		for (const o of reg.observers) {
			this.eventRegistry.registerObserver(o);
		}
		const makeReader = (r: EventRegistry, ev: Ctor) => new EventReaderHandle(r, ev);
		const makeWriter = (r: EventRegistry, ev: Ctor) => new EventWriterHandle(r, ev);
		const baseCtx = () => ({
			world: this.world,
			commands: this.commands,
			queries: this.scheduler.queries,
			events: this.eventRegistry,
			makeReader,
			makeWriter,
			lastRunTick: -1,
		});
		this.eventRegistry.resolveBase = baseCtx;
		this.scheduler.events = this.eventRegistry;
		this.scheduler.makeReader = makeReader;
		this.scheduler.makeWriter = makeWriter;
		wireEvents(this.eventRegistry, this.commands, this.world);

		// 5. monitors (public cached-query reconcile; see monitors.ts)
		const monitors = new MonitorRegistry(this.world, baseCtx);
		for (const m of reg.monitors) {
			const base = this.scheduler.queries.get(m.match);
			assert(base !== undefined, `[rovy] @monitor match query not hoisted: ${m.match}`);
			monitors.register(m, base);
		}
		this.monitors = monitors;
		this.scheduler.onFlush = () => monitors.reconcileAll();

		// 6. build scheduler (schedules → sets → systems), then fire runOnStart
		this.scheduler.build(reg);
		this.started = true;
		monitors.reconcileAll(); // initial membership (pre-start spawns)
		for (const s of this.scheduler.runOnStartList()) {
			this.scheduler.run(s);
		}
		return this;
	}

	/** True once finalize has run. */
	isStarted(): boolean {
		return this.started;
	}
}
