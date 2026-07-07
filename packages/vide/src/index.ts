import Vide from "@rbxts/vide";
import {
	EventWriterHandle,
	type App,
	type Commands,
	type Ctor,
	type Entity,
	type EventReader,
	type EventWriter,
	type LifecycleUnsubscribe,
	type OptRes,
	type ParamDescriptor,
	type Query,
	type QueryDescriptor,
	type Res,
	type ResMut,
	type ResolveTerms,
	type World,
} from "@rovy/core";

type Cleanup = () => void;
type Row = { values: { [k: number]: unknown }; n: number };
type QueryLike = {
	forEach(cb: (...row: Array<unknown>) => void): void;
	size(): number;
	first(): LuaTuple<Array<unknown>> | undefined;
	iter(): IterableFunction<LuaTuple<Array<unknown>>>;
	withTarget(target: Entity): QueryLike;
	has(entity: Entity): boolean;
	members(): Array<Entity>;
	rowFor?(entity: Entity): Row | undefined;
	getDescriptor(): QueryDescriptor;
};

declare const table: {
	unpack: <T>(list: { [k: number]: T } | Array<T>, i: number, j: number) => LuaTuple<Array<T>>;
};

export interface ViewOptions {}

export function view(_options?: ViewOptions): (ctor: Ctor) => void {
	return () => {};
}

export interface ViewRow<Terms extends ReadonlyArray<unknown> = ReadonlyArray<unknown>> {
	readonly entity: Entity;
	readonly values: ResolveTerms<Terms>;
}

export interface ViewMonitor<
	Terms extends ReadonlyArray<unknown>,
	_F1 = void,
	_F2 = void,
	_F3 = void,
	_F4 = void,
	_F5 = void,
> {
	current(): Vide.Source<ReadonlyArray<ViewRow<Terms>>>;
	entered(): Vide.Source<ReadonlyArray<ViewRow<Terms>>>;
	changed(): Vide.Source<ReadonlyArray<ViewRow<Terms>>>;
	exited(): Vide.Source<ReadonlyArray<ViewRow<Terms>>>;
}

declare module "@rovy/core" {
	interface Query<
		Terms extends ReadonlyArray<unknown>,
		_F1 = void,
		_F2 = void,
		_F3 = void,
		_F4 = void,
		_F5 = void,
	> {
		rows(): Vide.Source<ReadonlyArray<ViewRow<Terms>>>;
		members(): Array<Entity>;
		has(entity: Entity): boolean;
	}

	interface EventReader<E extends object> {
		events(): Vide.Source<ReadonlyArray<E>>;
	}
}

type ViewParamDescriptor = ParamDescriptor | { readonly kind: "context" } | { readonly kind: "viewMonitor"; readonly handle: string };

export interface ViewReg {
	readonly ctor: Ctor;
	readonly id: string;
	readonly methods: ReadonlyArray<string>;
	readonly params?: ReadonlyArray<ViewParamDescriptor>;
}

export interface MountedViewOptions {
	readonly target?: Instance;
	readonly name?: string;
}

export interface ViewHandle {
	readonly destroy: Cleanup;
}

export interface ViewEventsOptions {
	readonly limit?: number;
}

export interface ViewContext {
	readonly app: App;
	readonly target?: Instance;
	query<T extends ReadonlyArray<unknown> = ReadonlyArray<unknown>>(handle: string): Vide.Source<ReadonlyArray<T>>;
	events<T extends object>(eventCtor: Ctor<T>, options?: ViewEventsOptions): Vide.Source<ReadonlyArray<T>>;
	mount(viewCtor: Ctor, options?: MountedViewOptions): ViewHandle;
}

interface QuerySourceState {
	readonly handle: string;
	readonly query: QueryLike;
	readonly source: Vide.Source<ReadonlyArray<ViewRow>>;
	readonly rowCache: Map<Entity, InternalViewRow>;
	dirty: boolean;
}

interface EventSourceState {
	readonly ctor: Ctor;
	readonly limit?: number;
	readonly source: Vide.Source<ReadonlyArray<object>>;
	dirty: boolean;
}

interface ResourceSourceState {
	readonly ctor: Ctor;
	readonly optional: boolean;
	readonly source: Vide.Source<object | undefined>;
	dirty: boolean;
}

interface MonitorSourceState {
	readonly handle: string;
	readonly query: QueryLike;
	readonly current: Vide.Source<ReadonlyArray<ViewRow>>;
	readonly entered: Vide.Source<ReadonlyArray<ViewRow>>;
	readonly changed: Vide.Source<ReadonlyArray<ViewRow>>;
	readonly exited: Vide.Source<ReadonlyArray<ViewRow>>;
	readonly previous: Map<Entity, ViewRow>;
	dirty: boolean;
}

interface MountedViewState {
	readonly app: App;
	readonly target?: Instance;
	readonly cleanups: Array<Cleanup>;
	readonly children: Array<ViewHandle>;
	readonly instances: Array<Record<string, unknown>>;
	readonly locals: Map<number, unknown>;
	readonly querySources: Map<string, QuerySourceState>;
	readonly resourceSources: Array<ResourceSourceState>;
	readonly eventSources: Array<EventSourceState>;
	readonly monitors: Map<string, MonitorSourceState>;
	destroyed: boolean;
}

interface InternalViewRow extends ViewRow {
	readonly __values: Vide.Source<Array<unknown>>;
}

function createRegistry() {
	return new Array<ViewReg>();
}

const registry = createRegistry();

export const rovyVide = {
	registry,

	__view(ctor: Ctor, meta: Omit<ViewReg, "ctor">): void {
		registry.push({ ctor, ...meta });
	},

	__reset(): void {
		while (registry.size() > 0) registry.pop();
	},
};

export function mountView(app: App, viewCtor: Ctor, options: MountedViewOptions = {}): ViewHandle {
	const reg = findViewReg(viewCtor);
	const [target, cleanupTarget] = resolveTarget(reg, options);
	const state: MountedViewState = {
		app,
		target,
		cleanups: [],
		children: [],
		instances: [],
		locals: new Map(),
		querySources: new Map(),
		resourceSources: [],
		eventSources: [],
		monitors: new Map(),
		destroyed: false,
	};
	const ctx = createViewContext(state);
	track(
		state,
		app.on_post_flush(() => {
			for (const eventSource of state.eventSources) eventSource.dirty = true;
			publishDirty(state);
		}),
	);
	trackLifecycleDirtying(state);
	mountRootView(state, reg, ctx);
	if (cleanupTarget !== undefined) track(state, cleanupTarget);

	return {
		destroy: () => destroyMountedState(state),
	};
}

export function unmountView(handle: ViewHandle): void {
	handle.destroy();
}

function mountRootView(state: MountedViewState, reg: ViewReg, ctx: ViewContext): void {
	const instance = createViewInstance(reg);
	state.instances.push(instance);
	const render = readMethod(instance, "render");
	assert(render !== undefined, `[rovy/vide] @view '${reg.id}' requires render(...)`);
	const args = reg.params !== undefined ? resolveViewParams(state, reg.params, ctx) : [ctx];
	const destroy = Vide.mount(() => render(instance, ...args), state.target);
	track(state, destroy);
}

function resolveViewParams(state: MountedViewState, params: ReadonlyArray<ViewParamDescriptor>, ctx: ViewContext): Array<unknown> {
	const out = new Array<defined>();
	for (const param of params) out.push(resolveViewParam(state, param, ctx) as defined);
	return out as unknown as Array<unknown>;
}

function resolveViewParam(state: MountedViewState, param: ViewParamDescriptor, ctx: ViewContext): unknown {
	switch (param.kind) {
		case "context":
			return ctx;
		case "viewMonitor":
			return createViewMonitor(state, param.handle);
		case "query":
			return createViewQuery(state, param.handle);
		case "res":
			return createResourceProxy(state, param.ctor, false, false);
		case "resMut":
			return createResourceProxy(state, param.ctor, false, true);
		case "optRes":
			return createResourceProxy(state, param.ctor, true, false);
		case "eventReader":
			return createViewEventReader(state, param.ctor);
		case "eventWriter":
			return new EventWriterHandle(state.app.eventRegistry, param.ctor) as EventWriter<object>;
		case "commands":
			return state.app.commands as Commands;
		case "world":
			return state.app.world as World;
		case "local": {
			let value = state.locals.get(param.index);
			if (value === undefined) {
				value = param.init !== undefined ? param.init() : {};
				state.locals.set(param.index, value);
			}
			return value;
		}
		case "external": {
			const external = state.app.scheduler.externalParams.get(param.id);
			assert(external !== undefined, `[rovy/vide] missing external injected param '${param.id}'`);
			return external;
		}
		case "collect": {
			const collect = state.app.scheduler.collectors.get(param.ctor);
			assert(collect !== undefined, `[rovy/vide] missing @collect instance for ${tostring(param.ctor)}`);
			return collect;
		}
		case "entity":
		case "term":
		case "event":
			error(`[rovy/vide] '${param.kind}' render param is only valid in observer/monitor callbacks`);
	}
}

function createViewContext(state: MountedViewState): ViewContext {
	return {
		app: state.app,
		target: state.target,
		query<T extends ReadonlyArray<unknown> = ReadonlyArray<unknown>>(handle: string) {
			const query = createViewQuery(state, handle);
			const source = query.rows() as unknown as Vide.Source<ReadonlyArray<ViewRow<T>>>;
			return (() => {
				const out = new Array<T>();
				for (const row of source()) out.push(row.values as unknown as T);
				return out;
			}) as Vide.Source<ReadonlyArray<T>>;
		},
		events<T extends object>(eventCtor: Ctor<T>, options: ViewEventsOptions = {}) {
			const eventSource = eventSourceFor(state, eventCtor, options.limit);
			return eventSource.source as unknown as Vide.Source<ReadonlyArray<T>>;
		},
		mount(viewCtor, options = {}) {
			const handle = mountView(state.app, viewCtor, { target: options.target ?? state.target });
			state.children.push(handle);
			return handle;
		},
	};
}

function createViewQuery<Terms extends ReadonlyArray<unknown> = ReadonlyArray<unknown>>(
	state: MountedViewState,
	handle: string,
	queryOverride?: QueryLike,
): Query<Terms> {
	const sourceState = querySourceFor(state, handle, queryOverride);
	const targetCache = new Map<Entity, Query<Terms>>();
	const facade = {
		rows() {
			return sourceState.source as Vide.Source<ReadonlyArray<ViewRow<Terms>>>;
		},
		forEach(cb: (...row: Array<unknown>) => void) {
			for (const row of sourceState.source()) cb(...rawRowValues(row));
		},
		size() {
			return sourceState.source().size();
		},
		first() {
			const row = sourceState.source()[0];
			if (row === undefined) return undefined;
			const values = rawRowValues(row);
			return table.unpack(values, 1, values.size()) as never;
		},
		iter() {
			let index = 0;
			return ((() => {
				index += 1;
				const row = sourceState.source()[index - 1];
				if (row === undefined) return undefined as never;
				const values = rawRowValues(row);
				return table.unpack(values, 1, values.size()) as never;
			}) as unknown) as IterableFunction<LuaTuple<Array<unknown>>>;
		},
		withTarget(target: Entity) {
			let child = targetCache.get(target);
			if (child === undefined) {
				child = createViewQuery(state, `${handle}:target:${tostring(target)}`, sourceState.query.withTarget(target));
				targetCache.set(target, child);
			}
			return child;
		},
		has(entity: Entity) {
			return sourceState.source().some((row) => row.entity === entity);
		},
		members() {
			return sourceState.source().map((row) => row.entity);
		},
	} as unknown as Query<Terms>;
	return facade;
}

function createViewMonitor<Terms extends ReadonlyArray<unknown> = ReadonlyArray<unknown>>(
	state: MountedViewState,
	handle: string,
): ViewMonitor<Terms> {
	const monitor = monitorSourceFor(state, handle);
	return {
		current() {
			return monitor.current as Vide.Source<ReadonlyArray<ViewRow<Terms>>>;
		},
		entered() {
			return monitor.entered as Vide.Source<ReadonlyArray<ViewRow<Terms>>>;
		},
		changed() {
			return monitor.changed as Vide.Source<ReadonlyArray<ViewRow<Terms>>>;
		},
		exited() {
			return monitor.exited as Vide.Source<ReadonlyArray<ViewRow<Terms>>>;
		},
	};
}

function createResourceProxy<T extends object>(state: MountedViewState, ctor: Ctor<T>, optional: boolean, mutable: boolean): Res<T> | ResMut<T> | OptRes<T> {
	const resourceState = resourceSourceFor(state, ctor, optional);
	return setmetatable({}, {
		__index: (_self: object, key: unknown) => {
			const value = resourceState.source() as Record<string, unknown> | undefined;
			return value !== undefined ? value[key as string] : undefined;
		},
		__newindex: (_self: object, key: unknown, value: unknown) => {
			assert(mutable, `[rovy/vide] cannot write to read-only resource ${tostring(ctor)}`);
			const current = resourceState.source() as Record<string, unknown> | undefined;
			assert(current !== undefined, `[rovy/vide] cannot write missing optional resource ${tostring(ctor)}`);
			current[key as string] = value;
			resourceState.source(current);
			resourceState.dirty = false;
		},
	}) as Res<T> | ResMut<T> | OptRes<T>;
}

function createViewEventReader<T extends object>(state: MountedViewState, ctor: Ctor<T>): EventReader<T> {
	const eventSource = eventSourceFor(state, ctor, undefined);
	return {
		forEach(cb: (event: T) => void) {
			for (const event of eventSource.source()) cb(event as T);
		},
		size() {
			return eventSource.source().size();
		},
		events() {
			return eventSource.source as unknown as Vide.Source<ReadonlyArray<T>>;
		},
	};
}

function querySourceFor(state: MountedViewState, handle: string, queryOverride?: QueryLike): QuerySourceState {
	const cached = state.querySources.get(handle);
	if (cached !== undefined) return cached;
	const query = queryOverride ?? getQuery(state.app, handle);
	const sourceState: QuerySourceState = {
		handle,
		query,
		rowCache: new Map(),
		source: Vide.source<ReadonlyArray<ViewRow>>([]),
		dirty: false,
	};
	sourceState.source(readViewRows(query, sourceState.rowCache));
	state.querySources.set(handle, sourceState);
	return sourceState;
}

function monitorSourceFor(state: MountedViewState, handle: string): MonitorSourceState {
	const cached = state.monitors.get(handle);
	if (cached !== undefined) return cached;
	const query = getQuery(state.app, handle);
	const current = readViewRows(query);
	const previous = new Map<Entity, ViewRow>();
	for (const row of current) previous.set(row.entity, row);
	const monitor: MonitorSourceState = {
		handle,
		query,
		current: Vide.source(current),
		entered: Vide.source<ReadonlyArray<ViewRow>>([]),
		changed: Vide.source<ReadonlyArray<ViewRow>>([]),
		exited: Vide.source<ReadonlyArray<ViewRow>>([]),
		previous,
		dirty: false,
	};
	state.monitors.set(handle, monitor);
	return monitor;
}

function resourceSourceFor<T extends object>(state: MountedViewState, ctor: Ctor<T>, optional: boolean): ResourceSourceState {
	for (const resource of state.resourceSources) {
		if (resource.ctor === ctor && resource.optional === optional) return resource;
	}
	const resource: ResourceSourceState = {
		ctor,
		optional,
		source: Vide.source(readResource(state, ctor, optional) as object | undefined),
		dirty: false,
	};
	state.resourceSources.push(resource);
	return resource;
}

function eventSourceFor(state: MountedViewState, ctor: Ctor, limit: number | undefined): EventSourceState {
	for (const eventSource of state.eventSources) {
		if (eventSource.ctor === ctor && eventSource.limit === limit) return eventSource;
	}
	const eventSource: EventSourceState = {
		ctor,
		limit,
		source: Vide.source<ReadonlyArray<object>>(readBufferedEvents(state.app, ctor, limit)),
		dirty: false,
	};
	state.eventSources.push(eventSource);
	track(
		state,
		state.app.eventRegistry.observe(ctor, (event) => {
			eventSource.source(appendEvent(eventSource.source(), event, limit));
			eventSource.dirty = false;
		}),
	);
	return eventSource;
}

function publishDirty(state: MountedViewState): void {
	if (state.destroyed) return;
	for (const query of state.querySources) {
		if (query[1].dirty) refreshQuerySource(query[1]);
	}
	for (const monitor of state.monitors) {
		if (monitor[1].dirty) refreshMonitorSource(monitor[1]);
	}
	for (const resource of state.resourceSources) {
		if (resource.dirty) {
			resource.source(readResource(state, resource.ctor as never, resource.optional) as object | undefined);
			resource.dirty = false;
		}
	}
	for (const eventSource of state.eventSources) {
		if (eventSource.dirty) {
			eventSource.source(readBufferedEvents(state.app, eventSource.ctor, eventSource.limit));
			eventSource.dirty = false;
		}
	}
}

function trackLifecycleDirtying(state: MountedViewState): void {
	const dirtyQueries = () => {
		for (const query of state.querySources) query[1].dirty = true;
		for (const monitor of state.monitors) monitor[1].dirty = true;
		publishDirty(state);
	};
	track(state, state.app.on_entity_spawned(dirtyQueries));
	track(state, state.app.on_entity_despawned(dirtyQueries));
	track(state, state.app.on_component_added(dirtyQueries));
	track(state, state.app.on_component_changed(dirtyQueries));
	track(state, state.app.on_component_removed(dirtyQueries));
	track(state, state.app.on_relation_added(dirtyQueries));
	track(state, state.app.on_relation_changed(dirtyQueries));
	track(state, state.app.on_relation_removed(dirtyQueries));
	track(
		state,
		state.app.on_resource_changed((record) => {
			for (const resource of state.resourceSources) {
				if (resource.ctor === record.ctor) resource.dirty = true;
			}
			publishDirty(state);
		}),
	);
}

function refreshQuerySource(query: QuerySourceState): void {
	query.source(readViewRows(query.query, query.rowCache));
	query.dirty = false;
}

function refreshMonitorSource(monitor: MonitorSourceState): void {
	const current = readViewRows(monitor.query);
	const currentByEntity = new Map<Entity, ViewRow>();
	const entered = new Array<ViewRow>();
	const changed = new Array<ViewRow>();
	const exited = new Array<ViewRow>();

	for (const row of current) {
		currentByEntity.set(row.entity, row);
		const previous = monitor.previous.get(row.entity);
		if (previous === undefined) entered.push(row);
		else if (!rowValuesEqual(previous, row)) changed.push(row);
	}
	for (const previous of monitor.previous) {
		if (!currentByEntity.has(previous[0])) exited.push(previous[1]);
	}

	monitor.previous.clear();
	for (const row of current) monitor.previous.set(row.entity, row);
	monitor.current(current);
	if (entered.size() > 0 || changed.size() > 0 || exited.size() > 0) {
		monitor.entered(entered);
		monitor.changed(changed);
		monitor.exited(exited);
	}
	monitor.dirty = false;
}

function readViewRows(query: QueryLike, cache?: Map<Entity, InternalViewRow>): ReadonlyArray<ViewRow> {
	const out = new Array<ViewRow>();
	const seen = new Set<Entity>();
	for (const entity of query.members()) {
		const values = rowValues(query, entity);
		if (cache !== undefined) {
			seen.add(entity);
			let row = cache.get(entity);
			if (row === undefined) {
				row = createInternalViewRow(entity, values);
				cache.set(entity, row);
			} else {
				row.__values(values);
			}
			out.push(row);
		} else {
			out.push({ entity, values: values as ResolveTerms<ReadonlyArray<unknown>> });
		}
	}
	if (cache !== undefined) {
		const stale = new Array<Entity>();
		for (const entry of cache) {
			if (!seen.has(entry[0])) stale.push(entry[0]);
		}
		for (const entity of stale) cache.delete(entity);
	}
	return out;
}

function createInternalViewRow(entity: Entity, values: Array<unknown>): InternalViewRow {
	const source = Vide.source(values);
	const valueProxy = setmetatable({}, {
		__index: (_self: object, key: unknown) => {
			const current = source() as unknown as Record<string, unknown>;
			return current[key as string];
		},
	}) as ResolveTerms<ReadonlyArray<unknown>>;
	return {
		entity,
		values: valueProxy,
		__values: source,
	};
}

function rawRowValues(row: ViewRow): Array<unknown> {
	const internal = row as InternalViewRow;
	if (internal.__values !== undefined) return internal.__values();
	return row.values as Array<unknown>;
}

function rowValues(query: QueryLike, entity: Entity): Array<unknown> {
	const row = query.rowFor?.(entity);
	if (row === undefined) return [];
	const out = new Array<defined>();
	for (let i = 1; i <= row.n; i++) out.push(row.values[i] as defined);
	return out as unknown as Array<unknown>;
}

function rowValuesEqual(a: ViewRow, b: ViewRow): boolean {
	const av = rawRowValues(a);
	const bv = rawRowValues(b);
	if (av.size() !== bv.size()) return false;
	for (let i = 0; i < av.size(); i++) {
		if (av[i] !== bv[i]) return false;
	}
	return true;
}

function readResource<T extends object>(state: MountedViewState, ctor: Ctor<T>, optional: boolean): T | undefined {
	return state.app.world.resolveResourceForInjection(ctor, optional);
}

function readBufferedEvents(app: App, ctor: Ctor, limit: number | undefined): ReadonlyArray<object> {
	const out = new Array<object>();
	app.eventRegistry.readerForEach(ctor, (event) => out.push(event));
	return trimEvents(out, limit);
}

function appendEvent(events: ReadonlyArray<object>, event: object, limit: number | undefined): ReadonlyArray<object> {
	return trimEvents([...events, event], limit);
}

function trimEvents(events: ReadonlyArray<object>, limit: number | undefined): ReadonlyArray<object> {
	if (limit === undefined || limit < 0 || events.size() <= limit) return events;
	const trimmed = new Array<object>();
	const start = events.size() - limit;
	for (let i = start; i < events.size(); i++) trimmed.push(events[i]);
	return trimmed;
}

function getQuery(app: App, handle: string): QueryLike {
	const query = app.scheduler.queries.get(handle) as QueryLike | undefined;
	assert(query !== undefined, `[rovy/vide] query handle not found: ${handle}`);
	return query;
}

function findViewReg(ctor: Ctor): ViewReg {
	for (const reg of registry) {
		if (reg.ctor === ctor) return reg;
	}
	error(`[rovy/vide] view is not registered: ${tostring(ctor)}`);
}

function resolveTarget(reg: ViewReg, options: MountedViewOptions): LuaTuple<[Instance | undefined, Cleanup | undefined]> {
	if (options.target !== undefined) return $tuple(options.target, undefined);
	const gui = new Instance("ScreenGui");
	gui.Name = options.name ?? defaultGuiName(reg);
	gui.ResetOnSpawn = false;
	gui.IgnoreGuiInset = true;
	const playerGui = getPlayerGui();
	if (playerGui !== undefined) gui.Parent = playerGui;
	return $tuple(gui, () => gui.Destroy());
}

function defaultGuiName(reg: ViewReg): string {
	const cleaned = reg.id.gsub("[^%w_]+", "_")[0];
	return cleaned.size() > 0 ? cleaned : "RovyVideRoot";
}

function getPlayerGui(): PlayerGui | undefined {
	const [ok, players] = pcall(() => game.GetService("Players"));
	if (!ok || players === undefined) return undefined;
	const localPlayer = (players as Players).LocalPlayer;
	if (localPlayer === undefined) return undefined;
	const [findOk, direct] = pcall(() => localPlayer.FindFirstChildOfClass("PlayerGui"));
	if (findOk && direct !== undefined) return direct as PlayerGui;
	const [waitOk, waited] = pcall(() => localPlayer.WaitForChild("PlayerGui", 5));
	return waitOk ? waited as PlayerGui : undefined;
}

function createViewInstance(reg: ViewReg): Record<string, unknown> {
	const factory = reg.ctor as unknown as new () => Record<string, unknown>;
	return new factory();
}

function readMethod(instance: Record<string, unknown>, name: string): ((self: unknown, ...args: Array<unknown>) => unknown) | undefined {
	const value = instance[name];
	return typeIs(value, "function") ? value as (self: unknown, ...args: Array<unknown>) => unknown : undefined;
}

function track(state: MountedViewState, cleanup: Cleanup | LifecycleUnsubscribe): void {
	state.cleanups.push(cleanup as Cleanup);
}

function destroyMountedState(state: MountedViewState): void {
	if (state.destroyed) return;
	state.destroyed = true;
	for (const child of state.children) child.destroy();
	while (state.cleanups.size() > 0) {
		const cleanup = state.cleanups.pop();
		if (cleanup !== undefined) cleanup();
	}
}
