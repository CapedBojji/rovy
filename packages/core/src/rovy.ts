/**
 * The `rovy` global registry — the runtime side of the frozen contract.
 *
 * Phase 1 scope: pure data push + `loadPaths` + `traitToken`. NO jecs, NO id
 * allocation, NO hooks. `app.start()` (Phase 2+) performs the finalize pass
 * that turns these registrations into a live world.
 *
 * The transformer injects calls to the `__*` functions after each decorated
 * class. They are public only so the transformer (and hand-written tests) can
 * call them — application code never does.
 */

import type {
	CollectReg,
	CollectorRefReg,
	ComponentReg,
	Ctor,
	EventReg,
	MonitorReg,
	ObserverReg,
	ParamDescriptor,
	PluginReg,
	PrefabReg,
	QueryDescriptor,
	RelationReg,
	ResourceReg,
	RovyRegistry,
	ScheduleReg,
	StableId,
	SystemReg,
} from "./contract";

/** Opaque value-position trait handle (result of the `trait<T>()` macro). */
export interface TraitToken {
	readonly __rovyTraitId: StableId;
}

/**
 * Forces module side effects to run so injected `rovy.__*` calls execute.
 * Authored TS passes string paths; the transformer lowers them to Roblox
 * Instance roots. Default provider walks those Instance trees; tests may swap
 * in any resolver they want.
 */
export type ModuleProvider = (roots: ReadonlyArray<unknown>) => void;

function createRegistry(): RovyRegistry {
	return {
		plugins: [],
		components: [],
		collectors: [],
		resources: [],
		events: [],
		systems: [],
		observers: [],
		monitors: [],
		relations: [],
		schedules: [],
		prefabs: [],
		traits: new Map<StableId, Array<Ctor>>(),
		queries: new Map<StableId, QueryDescriptor>(),
	};
}

const registry: RovyRegistry = createRegistry();

let moduleProvider: ModuleProvider = (roots) => {
	const isAutoLoadedBlinkBoundaryModule = (module: Instance): boolean => {
		if (!module.IsA("ModuleScript")) return false;
		const parent = module.Parent;
		if (parent === undefined || !parent.IsA("Folder") || parent.Name !== "generated") return false;
		return module.Name === "RovyBlinkClient" || module.Name === "RovyBlinkServer";
	};

	// Default: treat each root as a Roblox Instance and require every
	// descendant ModuleScript so its injected rovy.__* side effects run.
	// Blink-generated boundary modules live under shared output, but they must
	// only load when the networking plugin has already chosen a runtime side.
	for (const root of roots) {
		const inst = root as Instance;
		if (inst === undefined || (inst as unknown as { GetDescendants?: unknown }).GetDescendants === undefined) {
			continue;
		}
		for (const desc of inst.GetDescendants()) {
			if (desc.IsA("ModuleScript") && !isAutoLoadedBlinkBoundaryModule(desc)) {
				require(desc);
			}
		}
	}
};

export const rovy = {
	/** Live registry (read by `app.start()`; inspected by tests). */
	registry,

	// ── transformer-injected registration (pure data push) ──────────────────

	__plugin(ctor: Ctor, meta: Omit<PluginReg, "ctor">): void {
		registry.plugins.push({ ctor, ...meta } satisfies PluginReg);
	},
	__component(ctor: Ctor, id: StableId, meta?: { plugin?: Ctor; editor?: ComponentReg["editor"] }): void {
		registry.components.push({ ctor, id, plugin: meta?.plugin, editor: meta?.editor } satisfies ComponentReg);
	},
	__collect(ctor: Ctor, id: StableId, meta?: { plugin?: Ctor }): void {
		registry.collectors.push({ ctor, id, plugin: meta?.plugin } satisfies CollectReg);
	},
	__resource(ctor: Ctor, id: StableId, meta?: { plugin?: Ctor; collectorRefs?: ReadonlyArray<CollectorRefReg> }): void {
		registry.resources.push({
			ctor,
			id,
			plugin: meta?.plugin,
			collectorRefs: meta?.collectorRefs,
		} satisfies ResourceReg);
	},
	__event(ctor: Ctor, options?: { capacity?: number; label?: string; plugin?: Ctor }): void {
		registry.events.push({
			ctor,
			capacity: options?.capacity,
			label: options?.label,
			plugin: options?.plugin,
		} satisfies EventReg);
	},
	__system(ctor: Ctor, meta: Omit<SystemReg, "ctor">): void {
		registry.systems.push({ ctor, ...meta });
	},
	__observer(ctor: Ctor, meta: Omit<ObserverReg, "ctor">): void {
		registry.observers.push({ ctor, ...meta });
	},
	__monitor(ctor: Ctor, meta: Omit<MonitorReg, "ctor">): void {
		registry.monitors.push({ ctor, ...meta });
	},
	__relation(ctor: Ctor, meta: Omit<RelationReg, "ctor">): void {
		registry.relations.push({ ctor, ...meta });
	},
	__schedule(ctor: Ctor, meta: Omit<ScheduleReg, "ctor">): void {
		registry.schedules.push({ ctor, ...meta });
	},
	__prefab(ctor: Ctor, meta: { id: StableId; plugin?: Ctor; params: ReadonlyArray<ParamDescriptor> }): void {
		registry.prefabs.push({ ctor, ...meta } satisfies PrefabReg);
	},
	__traitImpl(traitId: StableId, impl: Ctor): void {
		let impls = registry.traits.get(traitId);
		if (impls === undefined) {
			impls = [];
			registry.traits.set(traitId, impls);
		}
		impls.push(impl);
	},
	__query(descriptor: QueryDescriptor): void {
		registry.queries.set(descriptor.id, descriptor);
	},

	// ── public API ──────────────────────────────────────────────────────────

	/** Value-position trait handle. The `trait<T>()` macro lowers to this. */
	traitToken(id: StableId): TraitToken {
		return { __rovyTraitId: id };
	},

	/**
	 * Force-require module trees so injected `rovy.__*` side effects run.
	 * TS authoring passes string paths like `"src/client/systems"`; the
	 * transformer lowers them to Roblox Instance roots before runtime.
	 */
	loadPaths(...paths: ReadonlyArray<string | Instance>): void {
		moduleProvider(paths);
	},

	/** Swap the module-loading strategy (tests inject an array-based provider). */
	setModuleProvider(provider: ModuleProvider): void {
		moduleProvider = provider;
	},

	/** Test helper: clear every registry table. */
	__reset(): void {
		const empty = (arr: Array<defined>): void => {
			while (arr.size() > 0) arr.pop();
		};
		empty(registry.plugins);
		empty(registry.components);
		empty(registry.collectors);
		empty(registry.resources);
		empty(registry.events);
		empty(registry.systems);
		empty(registry.observers);
		empty(registry.monitors);
		empty(registry.relations);
		empty(registry.schedules);
		empty(registry.prefabs);
		registry.traits.clear();
		registry.queries.clear();
	},
};
