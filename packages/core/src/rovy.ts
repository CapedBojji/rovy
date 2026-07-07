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
	InspectReg,
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

export interface RovyPluginLoadRoot {
	readonly __rovyPluginRoot: true;
	readonly root: Instance;
}

/**
 * Forces module side effects to run so injected `rovy.__*` calls execute.
 * Authored TS passes string paths; the transformer lowers them to Roblox
 * Instance roots. Plugin roots are tagged so the default provider can load only
 * shared plus the active runtime side.
 */
export type ModuleProvider = (roots: ReadonlyArray<unknown>) => void;

function createRegistry(): RovyRegistry {
	return {
		plugins: [],
		components: [],
		collectors: [],
		resources: [],
		inspects: [],
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

const PLUGIN_MARKER_NAME = ".rovy.plugin.json";

function isInstanceLike(value: unknown): value is Instance {
	const candidate = value as { GetDescendants?: unknown };
	return value !== undefined && candidate.GetDescendants !== undefined;
}

function isPluginLoadRoot(value: unknown): value is RovyPluginLoadRoot {
	const candidate = value as Partial<RovyPluginLoadRoot>;
	return candidate.__rovyPluginRoot === true && isInstanceLike(candidate.root);
}

function activeRuntimeFolderName(): "client" | "server" | undefined {
	const runService = game.GetService("RunService");
	if (runService.IsClient()) return "client";
	if (runService.IsServer()) return "server";
	return undefined;
}

function hasPluginMarker(root: Instance): boolean {
	return root.FindFirstChild(PLUGIN_MARKER_NAME) !== undefined;
}

function defaultModuleProvider(roots: ReadonlyArray<unknown>): void {
	const isAutoLoadedBlinkBoundaryModule = (module: Instance): boolean => {
		if (!module.IsA("ModuleScript")) return false;
		const parent = module.Parent;
		if (parent === undefined || !parent.IsA("Folder") || parent.Name !== "generated") return false;
		return module.Name === "RovyBlinkClient" || module.Name === "RovyBlinkServer";
	};

	const requireModule = (module: Instance): void => {
		if (
			module.IsA("ModuleScript") &&
			module.Name !== PLUGIN_MARKER_NAME &&
			!isAutoLoadedBlinkBoundaryModule(module)
		) {
			require(module);
		}
	};

	const requireTree = (root: Instance, detectPluginRoots = true): void => {
		requireModule(root);
		for (const child of root.GetChildren()) {
			if (detectPluginRoots && hasPluginMarker(child)) {
				requirePluginTree(child);
			} else {
				requireTree(child, detectPluginRoots);
			}
		}
	};

	const requirePluginTree = (root: Instance): void => {
		const shared = root.FindFirstChild("shared");
		if (shared !== undefined) requireTree(shared, false);
		const runtimeFolder = activeRuntimeFolderName();
		if (runtimeFolder === undefined) return;
		const side = root.FindFirstChild(runtimeFolder);
		if (side !== undefined) requireTree(side, false);
	};

	// Default: treat each root as a Roblox Instance and require every
	// descendant ModuleScript so its injected rovy.__* side effects run.
	// Blink-generated boundary modules live under shared output, but they must
	// only load when the networking plugin has already chosen a runtime side.
	for (const root of roots) {
		if (isPluginLoadRoot(root)) {
			requirePluginTree(root.root);
		} else if (isInstanceLike(root)) {
			if (hasPluginMarker(root)) requirePluginTree(root);
			else requireTree(root);
		}
	}
}

let moduleProvider: ModuleProvider = defaultModuleProvider;

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
	__resource(ctor: Ctor, id: StableId, meta?: { plugin?: Ctor; collectorRefs?: ReadonlyArray<CollectorRefReg>; inspect?: ResourceReg["inspect"] }): void {
		registry.resources.push({
			ctor,
			id,
			plugin: meta?.plugin,
			collectorRefs: meta?.collectorRefs,
			inspect: meta?.inspect,
		} satisfies ResourceReg);
	},
	__inspect(ctor: Ctor, meta?: { plugin?: Ctor; depth?: number; exclude?: ReadonlyArray<string> }): void {
		registry.inspects.push({
			ctor,
			plugin: meta?.plugin,
			depth: meta?.depth,
			exclude: meta?.exclude,
		} satisfies InspectReg);
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
	loadPaths(...paths: ReadonlyArray<string | Instance | RovyPluginLoadRoot>): void {
		moduleProvider(paths);
	},

	/** Transformer helper: mark a lowered load path as a Rovy plugin root. */
	pluginRoot(root: Instance): RovyPluginLoadRoot {
		return { __rovyPluginRoot: true, root };
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
		empty(registry.inspects);
		empty(registry.events);
		empty(registry.systems);
		empty(registry.observers);
		empty(registry.monitors);
		empty(registry.relations);
		empty(registry.schedules);
		empty(registry.prefabs);
		registry.traits.clear();
		registry.queries.clear();
		moduleProvider = defaultModuleProvider;
	},
};
