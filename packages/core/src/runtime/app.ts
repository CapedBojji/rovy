/**
 * `App` — boot + finalize. Phase 2 scope: finalize steps 1–2 (components →
 * jecs ids; resources → ids + auto-instantiate default ctor; insertResource
 * override). Scheduler / events / monitors / plugins land in later phases.
 */

import { rovy } from "../rovy";
import type { Ctor, ParamDescriptor } from "../contract";
import type { Entity } from "../types";
import { resolveParams } from "./resolve-param";
import type { ResolveCtx } from "./resolve-param";
import { CommandsImpl } from "./commands";
import { EventReaderHandle, EventRegistry, EventWriterHandle, wireEvents } from "./events";
import { flush } from "./flush";
import { runAppExtensions } from "./extensions";
import type { Plugin } from "./plugin";
import { logRegistry, resolvePluginName } from "./log-registry";
import { MonitorRegistry } from "./monitors";
import { buildQueryHandle } from "./query";
import { TraitQueryHandle, descriptorUsesTraits } from "./traits";
import type { ResolvedTraits } from "./traits";
import { RelationQueryHandle, descriptorUsesRelations } from "./relations";
import { ScheduleContext } from "./schedule-context";
import { Scheduler } from "./schedule";
import { RovyWorld } from "./world";
import { LifecycleHub, type LifecycleCallback, type LifecycleKind, type LifecycleUnsubscribe } from "./lifecycle";
import { markResourceCloneByReference } from "./resource-clone";

export class App {
	readonly world = new RovyWorld();
	readonly lifecycle = new LifecycleHub(this.world);
	readonly commands: CommandsImpl;
	readonly scheduler: Scheduler;
	readonly eventRegistry = new EventRegistry();
	private readonly collectors = new Map<Ctor, object>();
	private readonly prefabs = new Map<Ctor, { instance: object; params: ReadonlyArray<ParamDescriptor>; id: string }>();
	private readonly externalParams = new Map<string, unknown>();
	private monitors?: MonitorRegistry;
	private scheduleContext!: ScheduleContext;
	private started = false;
	/** Overrides supplied before start(); applied after resource registration. */
	private resourceOverrides = new Map<Ctor, object>();
	private readonly makeReader = (registry: EventRegistry, event: Ctor): EventReaderHandle =>
		new EventReaderHandle(registry, event);
	private readonly makeWriter = (registry: EventRegistry, event: Ctor): EventWriterHandle =>
		new EventWriterHandle(registry, event);

	private plugins: Array<Plugin> = [];
	private pluginNames: Array<string> = [];
	private activePluginOwners = new Map<object, true>();
	logRegistryAtStart = false;

	constructor() {
		this.lifecycle.setApp(this);
		this.world.lifecycle = this.lifecycle;
		this.commands = new CommandsImpl(this.world);
		this.scheduler = new Scheduler(this.world, this.commands);
		// wire deferred command → scheduler / world hooks
		this.commands.deferredRunSchedule = (s) => this.scheduler.run(s);
		this.commands.deferredRelate = (s, r, t, d) => this.world.relate(s, r, t, d);
		this.commands.deferredUnrelate = (s, r, t) => this.world.unrelate(s, r, t);
		this.world.runScheduleImpl = (s, dt) => this.scheduler.run(s, dt);
		this.world.flushImpl = () => {
			this.flushCommands();
			this.monitors?.reconcileAll();
		};
	}

	/** Apply queued commands to convergence (escape hatch; scheduler flushes at set boundaries). */
	flush(): this {
		this.flushCommands();
		this.monitors?.reconcileAll();
		return this;
	}

	/** Declare set order within a schedule. Call before start() (e.g. in a plugin). */
	configureSets(schedule: Ctor, order: ReadonlyArray<Ctor>): this {
		this.scheduler.configureSets(schedule, order);
		return this;
	}

	/** Run a schedule now (drives the game loop). */
	runSchedule(schedule: Ctor, dt?: number): this {
		this.scheduler.run(schedule, dt);
		return this;
	}

	on_entity_spawned(callback: LifecycleCallback): LifecycleUnsubscribe {
		return this.onLifecycle("entity_spawned", callback);
	}
	on_entity_despawned(callback: LifecycleCallback): LifecycleUnsubscribe {
		return this.onLifecycle("entity_despawned", callback);
	}
	on_component_added(callback: LifecycleCallback): LifecycleUnsubscribe;
	on_component_added(component: Ctor, callback: LifecycleCallback): LifecycleUnsubscribe;
	on_component_added(first: Ctor | LifecycleCallback, second?: LifecycleCallback): LifecycleUnsubscribe {
		return this.onLifecycle("component_added", first, second);
	}
	on_component_changed(callback: LifecycleCallback): LifecycleUnsubscribe;
	on_component_changed(component: Ctor, callback: LifecycleCallback): LifecycleUnsubscribe;
	on_component_changed(first: Ctor | LifecycleCallback, second?: LifecycleCallback): LifecycleUnsubscribe {
		return this.onLifecycle("component_changed", first, second);
	}
	on_component_removed(callback: LifecycleCallback): LifecycleUnsubscribe;
	on_component_removed(component: Ctor, callback: LifecycleCallback): LifecycleUnsubscribe;
	on_component_removed(first: Ctor | LifecycleCallback, second?: LifecycleCallback): LifecycleUnsubscribe {
		return this.onLifecycle("component_removed", first, second);
	}
	on_resource_changed(callback: LifecycleCallback): LifecycleUnsubscribe;
	on_resource_changed(resource: Ctor, callback: LifecycleCallback): LifecycleUnsubscribe;
	on_resource_changed(first: Ctor | LifecycleCallback, second?: LifecycleCallback): LifecycleUnsubscribe {
		return this.onLifecycle("resource_changed", first, second);
	}
	on_relation_added(callback: LifecycleCallback): LifecycleUnsubscribe;
	on_relation_added(relation: Ctor, callback: LifecycleCallback): LifecycleUnsubscribe;
	on_relation_added(first: Ctor | LifecycleCallback, second?: LifecycleCallback): LifecycleUnsubscribe {
		return this.onLifecycle("relation_added", first, second);
	}
	on_relation_changed(callback: LifecycleCallback): LifecycleUnsubscribe;
	on_relation_changed(relation: Ctor, callback: LifecycleCallback): LifecycleUnsubscribe;
	on_relation_changed(first: Ctor | LifecycleCallback, second?: LifecycleCallback): LifecycleUnsubscribe {
		return this.onLifecycle("relation_changed", first, second);
	}
	on_relation_removed(callback: LifecycleCallback): LifecycleUnsubscribe;
	on_relation_removed(relation: Ctor, callback: LifecycleCallback): LifecycleUnsubscribe;
	on_relation_removed(first: Ctor | LifecycleCallback, second?: LifecycleCallback): LifecycleUnsubscribe {
		return this.onLifecycle("relation_removed", first, second);
	}
	on_schedule_started(callback: LifecycleCallback): LifecycleUnsubscribe;
	on_schedule_started(schedule: Ctor, callback: LifecycleCallback): LifecycleUnsubscribe;
	on_schedule_started(first: Ctor | LifecycleCallback, second?: LifecycleCallback): LifecycleUnsubscribe {
		return this.onLifecycle("schedule_started", first, second);
	}
	on_schedule_finished(callback: LifecycleCallback): LifecycleUnsubscribe;
	on_schedule_finished(schedule: Ctor, callback: LifecycleCallback): LifecycleUnsubscribe;
	on_schedule_finished(first: Ctor | LifecycleCallback, second?: LifecycleCallback): LifecycleUnsubscribe {
		return this.onLifecycle("schedule_finished", first, second);
	}
	on_system_started(callback: LifecycleCallback): LifecycleUnsubscribe;
	on_system_started(system: Ctor, callback: LifecycleCallback): LifecycleUnsubscribe;
	on_system_started(first: Ctor | LifecycleCallback, second?: LifecycleCallback): LifecycleUnsubscribe {
		return this.onLifecycle("system_started", first, second);
	}
	on_system_finished(callback: LifecycleCallback): LifecycleUnsubscribe;
	on_system_finished(system: Ctor, callback: LifecycleCallback): LifecycleUnsubscribe;
	on_system_finished(first: Ctor | LifecycleCallback, second?: LifecycleCallback): LifecycleUnsubscribe {
		return this.onLifecycle("system_finished", first, second);
	}
	on_observer_started(callback: LifecycleCallback): LifecycleUnsubscribe;
	on_observer_started(observer: Ctor, callback: LifecycleCallback): LifecycleUnsubscribe;
	on_observer_started(first: Ctor | LifecycleCallback, second?: LifecycleCallback): LifecycleUnsubscribe {
		return this.onLifecycle("observer_started", first, second);
	}
	on_observer_finished(callback: LifecycleCallback): LifecycleUnsubscribe;
	on_observer_finished(observer: Ctor, callback: LifecycleCallback): LifecycleUnsubscribe;
	on_observer_finished(first: Ctor | LifecycleCallback, second?: LifecycleCallback): LifecycleUnsubscribe {
		return this.onLifecycle("observer_finished", first, second);
	}
	on_monitor_started(callback: LifecycleCallback): LifecycleUnsubscribe;
	on_monitor_started(monitor: Ctor, callback: LifecycleCallback): LifecycleUnsubscribe;
	on_monitor_started(first: Ctor | LifecycleCallback, second?: LifecycleCallback): LifecycleUnsubscribe {
		return this.onLifecycle("monitor_started", first, second);
	}
	on_monitor_finished(callback: LifecycleCallback): LifecycleUnsubscribe;
	on_monitor_finished(monitor: Ctor, callback: LifecycleCallback): LifecycleUnsubscribe;
	on_monitor_finished(first: Ctor | LifecycleCallback, second?: LifecycleCallback): LifecycleUnsubscribe {
		return this.onLifecycle("monitor_finished", first, second);
	}

	addPlugin(plugin: Plugin): this {
		this.pluginNames.push(resolvePluginName(plugin));
		this.plugins.push(plugin);
		const owner = this.pluginOwnerFor(plugin);
		if (owner !== undefined) this.activePluginOwners.set(owner, true);
		return this;
	}

	/** Register a package/plugin-owned injected param value. */
	insertParam(id: string, value: unknown): this {
		this.externalParams.set(id, value);
		if (this.started) this.scheduler.externalParams = this.externalParams;
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

	/** Build the same injection context systems use, for package-owned runtimes. */
	createResolveCtx(lastRunTick = -1): ResolveCtx {
		assert(this.started, "[rovy] App injection context is only available after app.start()");
		return this.createInternalResolveCtx(new Map(), lastRunTick);
	}

	/** Finalize the registry into a live world. Must run after rovy.loadPaths. */
	start(): this {
		assert(!this.started, "[rovy] app.start called twice");
		const reg = rovy.registry;

		for (const plugin of this.plugins) {
			plugin.build(this);
		}
		const activeReg = this.filterRegistry(reg);
		assert(
			activeReg.components.size() > 0 ||
				activeReg.collectors.size() > 0 ||
				activeReg.systems.size() > 0 ||
				activeReg.resources.size() > 0 ||
				activeReg.events.size() > 0 ||
				activeReg.observers.size() > 0 ||
				activeReg.schedules.size() > 0,
			"[rovy] empty active registry — call rovy.loadPaths(...) before app.start() and add required plugins",
		);
		runAppExtensions(this, activeReg);
		const finalReg = this.filterRegistry(reg);
		if (this.logRegistryAtStart) logRegistry(finalReg, this.pluginNames, this.externalParams);

		// 1. components → jecs ids + change-detection hooks
		for (const entry of finalReg.components) {
			const id = this.world.registerComponentEntry(entry);
			this.world.registerChangeDetection(id);
		}

		// 2. resources → jecs ids + auto-instantiate default ctor (or override)
		const installResource = (ctor: Ctor, entry?: import("../contract").ResourceReg): void => {
			if (entry !== undefined) this.world.registerResourceEntry(entry);
			else this.world.registerResource(ctor);
			const override = this.resourceOverrides.get(ctor);
			if (override !== undefined) {
				this.world.setResource(ctor, override);
			} else {
				const factory = ctor as unknown as new () => object;
				this.world.setResource(ctor, new factory());
			}
		};
		installResource(ScheduleContext);
		this.scheduleContext = this.world.resource(ScheduleContext);
		for (const entry of finalReg.resources) {
			installResource(entry.ctor, entry);
		}

		// 2b. collectors → singleton app-owned external ingress bridges
		for (const entry of finalReg.collectors) {
			const factory = entry.ctor as unknown as new () => object;
			const instance = new factory();
			assert(
				typeIs((instance as { drain?: unknown }).drain, "function"),
				`[rovy] @collect '${entry.id}' must define drain() or extend Collector`,
			);
			this.collectors.set(entry.ctor, markResourceCloneByReference(instance));
		}

		// 2c. prefabs → singleton app-owned entity builders
		for (const entry of finalReg.prefabs) {
			const factory = entry.ctor as unknown as new () => object;
			const instance = new factory();
			this.prefabs.set(entry.ctor, { instance, params: entry.params, id: entry.id });
		}

		// 2d. collector-backed resource fields → singleton collector instances
		for (const entry of finalReg.resources) {
			if (entry.collectorRefs === undefined || entry.collectorRefs.size() === 0) continue;
			const instance = this.world.resource(entry.ctor as never) as Record<string, unknown>;
			for (const ref of entry.collectorRefs) {
				const collector = this.collectors.get(ref.ctor);
				assert(
					collector !== undefined,
					`[rovy] @resource '${entry.id}' needs unregistered @collect field '${ref.key}': ${tostring(ref.ctor)}`,
				);
				instance[ref.key] = collector;
			}
		}

		// any overrides for resources NOT in the registry (manual-only)
		for (const [cls, instance] of this.resourceOverrides) {
			if (this.world.resourceMap.get(cls) === undefined) {
				this.world.insertResource(instance);
			}
		}

		// 2d. relations → jecs relation ids + cleanup/exclusive policies
		for (const r of finalReg.relations) {
			this.world.registerRelation(r.ctor, {
				exclusive: r.exclusive,
				onTargetDelete: r.onTargetDelete,
				onDelete: r.onDelete,
			});
		}

		// 3a. resolve trait registry (stable id → implementer ctors+jecs ids)
		const resolvedTraits: ResolvedTraits = new Map();
		for (const [traitId, impls] of finalReg.traits) {
			const list: Array<{ ctor: Ctor; jecsId: Entity }> = [];
			for (const implCtor of impls) {
				const jid = this.world.componentMap.get(implCtor);
				assert(jid !== undefined, `[rovy] trait ${traitId} impl not a registered @component: ${tostring(implCtor)}`);
				list.push({ ctor: implCtor, jecsId: jid });
			}
			resolvedTraits.set(traitId, list);
		}

		// 3b. hoisted query handles (trait-using → TraitQueryHandle)
		for (const [id, descriptor] of finalReg.queries) {
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
		for (const e of finalReg.events) {
			this.eventRegistry.registerEvent(e.ctor, e.capacity);
		}
		for (const o of finalReg.observers) {
			this.eventRegistry.registerObserver(o);
		}
		const baseCtx = () => ({
			world: this.world,
			commands: this.commands,
			collectors: this.collectors,
			externalParams: this.externalParams,
			queries: this.scheduler.queries,
			events: this.eventRegistry,
			makeReader: this.makeReader,
			makeWriter: this.makeWriter,
			lastRunTick: -1,
		});
		this.eventRegistry.resolveBase = baseCtx;

		// 4b. wire prefab invoker (needs baseCtx for param resolution)
		const prefabCtors = new Set<Ctor>();
		for (const [ctor] of this.prefabs) prefabCtors.add(ctor);
		this.world.prefabCtors = prefabCtors;
		const prefabs = this.prefabs;
		this.world.prefabInvoker = (prefabCtor: Ctor, entity: Entity) => {
			const pe = prefabs.get(prefabCtor);
			assert(pe !== undefined, `[rovy] no registered @prefab: ${tostring(prefabCtor)}`);
			const inst = pe.instance as { __rovyTarget: Entity };
			const savedTarget = inst.__rovyTarget;
			(inst as { __rovyTarget: Entity }).__rovyTarget = entity;
			const ctx = this.createInternalResolveCtx(new Map());
			const args = resolveParams(pe.params, ctx);
			const buildFn = (inst as unknown as Record<string, (self: object, ...a: unknown[]) => Entity>).build;
			const returned = buildFn(inst, ...args);
			(inst as { __rovyTarget: Entity }).__rovyTarget = savedTarget;
			assert(returned === entity, `[rovy] @prefab '${pe.id}' build() must return this.entity()`);
		};

		this.scheduler.collectors = this.collectors;
		this.scheduler.externalParams = this.externalParams;
		this.scheduler.events = this.eventRegistry;
		this.scheduler.makeReader = this.makeReader;
		this.scheduler.makeWriter = this.makeWriter;
		this.scheduler.scheduleContext = this.scheduleContext;
		wireEvents(this.eventRegistry, this.commands, this.world);

		// 5. monitors (public cached-query reconcile; see monitors.ts)
		const monitors = new MonitorRegistry(this.world, baseCtx);
		for (const m of finalReg.monitors) {
			const base = this.scheduler.queries.get(m.match);
			assert(base !== undefined, `[rovy] @monitor match query not hoisted: ${m.match}`);
			monitors.register(m, base);
		}
		this.monitors = monitors;
		this.scheduler.onFlush = () => monitors.reconcileAll();

		// 5b. dev validation — fail loudly + named for missing deps
		const checkParams = (
			kind: string,
			id: string,
			params: ReadonlyArray<import("../contract").ParamDescriptor>,
		) => {
			for (const p of params) {
				if (p.kind === "res" || p.kind === "resMut" || p.kind === "optRes") {
					if (p.kind !== "optRes") {
						assert(
							this.world.resourceMap.get(p.ctor) !== undefined,
							`[rovy] ${kind} '${id}' needs unregistered @resource: ${tostring(p.ctor)} — is it decorated + under rovy.loadPaths?`,
						);
					}
				} else if (p.kind === "eventReader" || p.kind === "eventWriter") {
					assert(
						this.eventRegistry.hasEvent(p.ctor),
						`[rovy] ${kind} '${id}' needs unregistered @event: ${tostring(p.ctor)}`,
					);
				} else if (p.kind === "collect") {
					assert(
						this.collectors.get(p.ctor) !== undefined,
						`[rovy] ${kind} '${id}' needs unregistered @collect: ${tostring(p.ctor)}`,
					);
				}
			}
		};
		for (const s of finalReg.systems) checkParams("system", s.id, s.params);
		for (const o of finalReg.observers) checkParams("observer", tostring(o.ctor), o.params);
		for (const m of finalReg.monitors) checkParams("monitor", tostring(m.ctor), m.params);
		for (const p of finalReg.prefabs) checkParams("prefab", p.id, p.params);

		// 6. build scheduler (schedules → sets → systems), then fire runOnStart
		this.scheduler.build(finalReg);
		this.started = true;
		this.lifecycle.enabled = true;
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

	private createInternalResolveCtx(locals: Map<number, unknown>, lastRunTick = -1): ResolveCtx {
		return {
			world: this.world,
			commands: this.commands,
			collectors: this.collectors,
			externalParams: this.externalParams,
			locals,
			queries: this.scheduler.queries,
			events: this.eventRegistry,
			makeReader: this.makeReader,
			makeWriter: this.makeWriter,
			lastRunTick,
		};
	}

	private flushCommands(): void {
		this.lifecycle.withBatch(() => {
			flush(this.commands);
		});
	}

	private onLifecycle(
		kind: LifecycleKind,
		first: Ctor | LifecycleCallback,
		second?: LifecycleCallback,
	): LifecycleUnsubscribe {
		return this.lifecycle.on(kind, first, second);
	}

	private pluginOwnerFor(plugin: Plugin): object | undefined {
		const mt = getmetatable(plugin) as object | undefined;
		if (mt !== undefined) return mt;
		return typeIs(plugin, "table") ? (plugin as object) : undefined;
	}

	private isActivePluginOwner(plugin: Ctor | undefined): boolean {
		return plugin === undefined || this.activePluginOwners.has(plugin as unknown as object);
	}

	private filterRegistry(reg: import("../contract").RovyRegistry): import("../contract").RovyRegistry {
		const keep = <T extends { plugin?: Ctor }>(entries: ReadonlyArray<T>): Array<T> =>
			entries.filter((entry) => this.isActivePluginOwner(entry.plugin));
		const components = keep(reg.components);
		const componentSet = new Set<Ctor>();
		for (const entry of components) componentSet.add(entry.ctor);
		const traits = new Map<import("../contract").StableId, Array<Ctor>>();
		for (const [traitId, impls] of reg.traits) {
			const activeImpls = impls.filter((impl) => componentSet.has(impl));
			if (activeImpls.size() > 0) traits.set(traitId, activeImpls);
		}
		return {
			plugins: reg.plugins.filter((entry) => this.isActivePluginOwner(entry.ctor)),
			components,
			collectors: keep(reg.collectors),
			resources: keep(reg.resources),
			inspects: keep(reg.inspects),
			events: keep(reg.events),
			systems: keep(reg.systems),
			observers: keep(reg.observers),
			monitors: keep(reg.monitors),
			relations: keep(reg.relations),
			schedules: keep(reg.schedules),
			prefabs: keep(reg.prefabs),
			traits,
			queries: reg.queries,
		};
	}
}
