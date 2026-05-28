import type { Ctor } from "../contract";
import type { Entity } from "../types";
import type { App } from "./app";
import type { RovyWorld } from "./world";

export type LifecycleKind =
	| "entity_spawned"
	| "entity_despawned"
	| "component_added"
	| "component_changed"
	| "component_removed"
	| "resource_changed"
	| "relation_added"
	| "relation_changed"
	| "relation_removed"
	| "schedule_started"
	| "schedule_finished"
	| "system_started"
	| "system_finished"
	| "observer_started"
	| "observer_finished"
	| "monitor_started"
	| "monitor_finished";

export interface LifecycleRecord {
	readonly app?: App;
	readonly world: RovyWorld;
	readonly tick: number;
	readonly kind: LifecycleKind;
	readonly ctor?: Ctor;
	readonly id?: string;
	readonly name?: string;
	readonly entity?: Entity;
	readonly value?: unknown;
	readonly oldValue?: unknown;
	readonly path?: ReadonlyArray<string>;
	readonly paths?: ReadonlyArray<ReadonlyArray<string>>;
	readonly schedule?: Ctor;
	readonly event?: object;
	readonly method?: string;
	readonly relation?: Ctor;
	readonly target?: Entity;
	readonly data?: unknown;
}

export type LifecycleCallback = (record: LifecycleRecord) => void;
export type LifecycleUnsubscribe = () => void;

interface Listener {
	kind: LifecycleKind;
	ctor?: Ctor;
	callback: LifecycleCallback;
	active: boolean;
	lastWarnAt: number;
}

const WARN_SUPPRESS_SECONDS = 10;

export class LifecycleHub {
	enabled = false;
	private app?: App;
	private readonly listeners = new Array<Listener>();
	private readonly queues = new Array<Array<LifecycleRecord>>();

	constructor(private readonly world: RovyWorld) {}

	setApp(app: App): void {
		this.app = app;
	}

	on(
		kind: LifecycleKind,
		first: Ctor | LifecycleCallback,
		second?: LifecycleCallback,
	): LifecycleUnsubscribe {
		const listener: Listener = {
			kind,
			ctor: second !== undefined ? first as Ctor : undefined,
			callback: (second ?? first) as LifecycleCallback,
			active: true,
			lastWarnAt: -math.huge,
		};
		this.listeners.push(listener);
		return () => {
			listener.active = false;
		};
	}

	emit(record: Omit<LifecycleRecord, "app" | "world" | "tick">): void {
		if (!this.enabled) return;
		this.push({
			...record,
			app: this.app,
			world: this.world,
			tick: this.world.changeTick,
		});
	}

	withMutation<T>(body: () => T): T {
		if (!this.enabled || this.queues.size() > 0) return body();
		this.begin();
		const [ok, result] = pcall(body);
		const records = this.end();
		this.dispatchAll(records);
		if (!ok) error(tostring(result), 0);
		return result as T;
	}

	withBatch(body: () => void): void {
		if (!this.enabled) {
			body();
			return;
		}
		this.begin();
		const [ok, err] = pcall(body);
		const records = this.end();
		this.dispatchAll(records);
		if (!ok) error(tostring(err), 0);
	}

	withRunScope(start: Omit<LifecycleRecord, "app" | "world" | "tick">, finish: Omit<LifecycleRecord, "app" | "world" | "tick">, body: () => void): void {
		if (!this.enabled) {
			body();
			return;
		}
		this.dispatch(this.complete(start));
		this.begin();
		const [ok, err] = pcall(body);
		const records = this.end();
		this.dispatch(this.complete(finish));
		this.dispatchAll(records);
		if (!ok) error(tostring(err), 0);
	}

	private begin(): void {
		this.queues.push([]);
	}

	private end(): Array<LifecycleRecord> {
		return this.queues.pop() ?? [];
	}

	private push(record: LifecycleRecord): void {
		const current = this.queues[this.queues.size() - 1];
		if (current !== undefined) current.push(record);
		else this.dispatch(record);
	}

	private complete(record: Omit<LifecycleRecord, "app" | "world" | "tick">): LifecycleRecord {
		return {
			...record,
			app: this.app,
			world: this.world,
			tick: this.world.changeTick,
		};
	}

	private dispatchAll(records: ReadonlyArray<LifecycleRecord>): void {
		for (const record of records) this.dispatch(record);
	}

	private dispatch(record: LifecycleRecord): void {
		for (const listener of this.listeners) {
			if (!listener.active || listener.kind !== record.kind) continue;
			if (listener.ctor !== undefined && listener.ctor !== record.ctor) continue;
			const [ok, err] = pcall(() => listener.callback(record));
			if (!ok) this.warnListener(listener, record.kind, err);
		}
	}

	private warnListener(listener: Listener, kind: LifecycleKind, err: unknown): void {
		const now = os.clock();
		if (now - listener.lastWarnAt < WARN_SUPPRESS_SECONDS) return;
		listener.lastWarnAt = now;
		const message = "[rovy] lifecycle callback '" + kind + "' failed: " + tostring(err);
		const warnFn = warn as unknown;
		if (typeIs(warnFn, "function")) (warnFn as (message: string) => void)(message);
		else print(message);
	}
}

export interface LifecyclePrintPluginOptions {
	readonly hooks?: ReadonlyArray<LifecycleKind>;
	readonly components?: ReadonlyArray<Ctor>;
	readonly resources?: ReadonlyArray<Ctor>;
	readonly relations?: ReadonlyArray<Ctor>;
	readonly schedules?: ReadonlyArray<Ctor>;
	readonly systems?: ReadonlyArray<Ctor>;
	readonly observers?: ReadonlyArray<Ctor>;
	readonly monitors?: ReadonlyArray<Ctor>;
	readonly printer?: (line: string) => void;
}

interface PrintHook {
	readonly kind: LifecycleKind;
	readonly method: string;
	readonly filter?: keyof LifecyclePrintPluginOptions;
}

const PRINT_HOOKS: ReadonlyArray<PrintHook> = [
	{ kind: "entity_spawned", method: "on_entity_spawned" },
	{ kind: "entity_despawned", method: "on_entity_despawned" },
	{ kind: "component_added", method: "on_component_added", filter: "components" },
	{ kind: "component_changed", method: "on_component_changed", filter: "components" },
	{ kind: "component_removed", method: "on_component_removed", filter: "components" },
	{ kind: "resource_changed", method: "on_resource_changed", filter: "resources" },
	{ kind: "relation_added", method: "on_relation_added", filter: "relations" },
	{ kind: "relation_changed", method: "on_relation_changed", filter: "relations" },
	{ kind: "relation_removed", method: "on_relation_removed", filter: "relations" },
	{ kind: "schedule_started", method: "on_schedule_started", filter: "schedules" },
	{ kind: "schedule_finished", method: "on_schedule_finished", filter: "schedules" },
	{ kind: "system_started", method: "on_system_started", filter: "systems" },
	{ kind: "system_finished", method: "on_system_finished", filter: "systems" },
	{ kind: "observer_started", method: "on_observer_started", filter: "observers" },
	{ kind: "observer_finished", method: "on_observer_finished", filter: "observers" },
	{ kind: "monitor_started", method: "on_monitor_started", filter: "monitors" },
	{ kind: "monitor_finished", method: "on_monitor_finished", filter: "monitors" },
];

export class LifecyclePrintPlugin {
	constructor(private readonly options: LifecyclePrintPluginOptions = {}) {}

	build(app: App): void {
		const printer = this.options.printer ?? ((line: string) => print(line));
		for (const hook of PRINT_HOOKS) {
			if (!this.wantsHook(hook.kind)) continue;
			const subscribe = (app as unknown as Record<string, (...args: Array<unknown>) => LifecycleUnsubscribe>)[hook.method];
			const filters = hook.filter !== undefined ? this.options[hook.filter] as ReadonlyArray<Ctor> | undefined : undefined;
			if (filters !== undefined && filters.size() > 0) {
				for (const ctor of filters) subscribe(app, ctor, (record: LifecycleRecord) => printer(formatLifecycleRecord(record)));
			} else {
				subscribe(app, (record: LifecycleRecord) => printer(formatLifecycleRecord(record)));
			}
		}
	}

	private wantsHook(kind: LifecycleKind): boolean {
		const hooks = this.options.hooks;
		if (hooks === undefined || hooks.size() === 0) return true;
		for (const hook of hooks) if (hook === kind) return true;
		return false;
	}
}

function formatLifecycleRecord(record: LifecycleRecord): string {
	const parts = new Array<string>();
	parts.push(`[rovy:lifecycle] ${record.kind}`);
	if (record.name !== undefined) parts.push(record.name);
	else if (record.id !== undefined) parts.push(record.id);
	if (record.entity !== undefined) parts.push(`entity=${tostring(record.entity)}`);
	if (record.target !== undefined) parts.push(`target=${tostring(record.target)}`);
	if (record.method !== undefined) parts.push(`method=${record.method}`);
	if (record.paths !== undefined && record.paths.size() > 0) parts.push(`paths=${formatPaths(record.paths)}`);
	if (record.path !== undefined) parts.push(`path=${record.path.join(".")}`);
	if (record.data !== undefined) parts.push(`data=${shortValue(record.data)}`);
	return parts.join(" ");
}

function formatPaths(paths: ReadonlyArray<ReadonlyArray<string>>): string {
	const out = new Array<string>();
	for (const path of paths) out.push(path.join("."));
	return out.join(",");
}

function shortValue(value: unknown): string {
	const text = tostring(value);
	if (text.size() <= 80) return text;
	return `${text.sub(1, 77)}...`;
}
