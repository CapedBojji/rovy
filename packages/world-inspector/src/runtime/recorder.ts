import { rovy, RovyWorld, ScheduleContext, type App, type Ctor, type Entity, type LifecycleRecord, type StableId, type World } from "@rovy/core";
import { StartFrameRecording, StopFrameRecording } from "../events";
import { buildValueTree, type WorldInspectorValueNodeDto } from "./value-tree";
import { countByKind, type ChangeEntry, type FrameRecord } from "./recorder-snapshot";

export type RecorderPhase = "idle" | "recording" | "stopped";

export interface RecorderConfig {
	maxFrames: number;
}

const DEFAULT_MAX_FRAMES = 3600;
const MIN_MAX_FRAMES = 1;
const MAX_MAX_FRAMES = 60000;

export class WorldInspectorRecorderState {
	phase: RecorderPhase = "idle";
	config: RecorderConfig = { maxFrames: DEFAULT_MAX_FRAMES };
	frames: Array<FrameRecord | undefined> = new Array<FrameRecord | undefined>(DEFAULT_MAX_FRAMES, undefined);
	head = 0;
	count = 0;
	startFrame = 0;
	/** change entries appended by lifecycle listeners since the last drain */
	pending = new Array<ChangeEntry>();
	/** target key → last seen value tree, so changes can report an old value */
	shadow = new Map<string, WorldInspectorValueNodeDto>();
	pendingCommand?: "start" | "stop";
	resultWindowOpen = false;
	page = 0;
	pageSize = 60;
	searchQuery = "";
	maxFramesDraft = tostring(DEFAULT_MAX_FRAMES);
	openDetailFrames = new Set<number>();

	queueStart(): void {
		this.pendingCommand = "start";
	}

	queueStop(): void {
		this.pendingCommand = "stop";
	}

	clearBuffer(): void {
		this.frames = new Array<FrameRecord | undefined>(this.config.maxFrames, undefined);
		this.head = 0;
		this.count = 0;
		this.startFrame = 0;
		this.page = 0;
		this.searchQuery = "";
		this.openDetailFrames.clear();
	}

	pushFrame(record: FrameRecord): void {
		const cap = this.config.maxFrames;
		this.frames[this.head] = record;
		this.head = (this.head + 1) % cap;
		if (this.count < cap) this.count += 1;
	}

	getFrameAt(uiIndex: number): FrameRecord | undefined {
		if (uiIndex < 0 || uiIndex >= this.count) return undefined;
		const cap = this.config.maxFrames;
		const slot = (this.head - this.count + uiIndex + cap) % cap;
		return this.frames[slot];
	}

	applyMaxFramesDraft(): void {
		const parsed = tonumber(this.maxFramesDraft);
		if (parsed === undefined) return;
		const clamped = math.clamp(math.floor(parsed), MIN_MAX_FRAMES, MAX_MAX_FRAMES);
		if (clamped === this.config.maxFrames) return;
		this.config.maxFrames = clamped;
		this.clearBuffer();
		this.maxFramesDraft = tostring(clamped);
	}

	/** Append a normalized change; called by lifecycle listeners while recording. */
	append(entry: ChangeEntry): void {
		this.pending.push(entry);
	}
}

function componentKey(id: StableId, entity: Entity): string {
	return `c:${id}#${tostring(entity)}`;
}

function resourceKey(id: StableId): string {
	return `r:${id}`;
}

function relationKey(name: string, source: Entity, target: Entity): string {
	return `p:${name}#${tostring(source)}->${tostring(target)}`;
}

function relationDisplayName(ctor: Ctor): string {
	for (const reg of rovy.registry.components) {
		if (reg.ctor === ctor) {
			const parts = reg.id.split("/");
			return parts[parts.size() - 1] ?? reg.id;
		}
	}
	return tostring(ctor);
}

function joinPaths(paths: ReadonlyArray<ReadonlyArray<string>> | undefined): string {
	if (paths === undefined || paths.size() === 0) return "";
	const dotted = new Array<string>();
	for (const path of paths) dotted.push(path.join("."));
	return dotted.join(", ");
}

/**
 * Register lifecycle listeners that feed the recorder's pending buffer.
 * Listeners stay live for the app, but only append while phase === "recording".
 * Old values come from an incremental per-target shadow (no world polling).
 */
export function registerRecorderListeners(app: App, recorder: WorldInspectorRecorderState): void {
	app.on_entity_spawned((record: LifecycleRecord) => {
		if (recorder.phase !== "recording" || record.entity === undefined) return;
		recorder.append({ tick: record.tick, kind: "add", target: { kind: "entity", entity: record.entity } });
	});

	app.on_entity_despawned((record: LifecycleRecord) => {
		if (recorder.phase !== "recording" || record.entity === undefined) return;
		recorder.append({ tick: record.tick, kind: "remove", target: { kind: "entity", entity: record.entity } });
	});

	app.on_component_added((record: LifecycleRecord) => {
		if (recorder.phase !== "recording" || record.entity === undefined || record.id === undefined) return;
		const name = record.name ?? record.id;
		const newTree = buildValueTree(record.value, { rootKey: name });
		recorder.shadow.set(componentKey(record.id, record.entity), newTree);
		recorder.append({
			tick: record.tick,
			kind: "add",
			target: { kind: "component", entity: record.entity, componentId: record.id, componentName: name },
			newTree,
		});
	});

	app.on_component_changed((record: LifecycleRecord) => {
		if (recorder.phase !== "recording" || record.entity === undefined || record.id === undefined) return;
		const name = record.name ?? record.id;
		const key = componentKey(record.id, record.entity);
		const oldTree = recorder.shadow.get(key);
		const newTree = buildValueTree(record.value, { rootKey: name });
		recorder.shadow.set(key, newTree);
		recorder.append({
			tick: record.tick,
			kind: "change",
			target: { kind: "component", entity: record.entity, componentId: record.id, componentName: name },
			oldTree,
			newTree,
		});
	});

	app.on_component_removed((record: LifecycleRecord) => {
		if (recorder.phase !== "recording" || record.entity === undefined || record.id === undefined) return;
		const name = record.name ?? record.id;
		const key = componentKey(record.id, record.entity);
		const oldTree = recorder.shadow.get(key) ?? buildValueTree(record.oldValue, { rootKey: name });
		recorder.shadow.delete(key);
		recorder.append({
			tick: record.tick,
			kind: "remove",
			target: { kind: "component", entity: record.entity, componentId: record.id, componentName: name },
			oldTree,
		});
	});

	app.on_resource_changed((record: LifecycleRecord) => {
		if (recorder.phase !== "recording" || record.id === undefined) return;
		const name = record.name ?? record.id;
		const key = resourceKey(record.id);
		const oldTree = recorder.shadow.get(key);
		const newTree = buildValueTree(record.value, { rootKey: name });
		recorder.shadow.set(key, newTree);
		recorder.append({
			tick: record.tick,
			kind: "change",
			target: { kind: "resource", resourceId: record.id, resourceName: name, path: joinPaths(record.paths) },
			oldTree,
			newTree,
		});
	});

	app.on_relation_added((record: LifecycleRecord) => {
		if (recorder.phase !== "recording" || record.entity === undefined || record.target === undefined || record.relation === undefined) return;
		const name = relationDisplayName(record.relation);
		const newTree = record.data !== undefined ? buildValueTree(record.data, { rootKey: name }) : undefined;
		if (newTree !== undefined) recorder.shadow.set(relationKey(name, record.entity, record.target), newTree);
		recorder.append({
			tick: record.tick,
			kind: "add",
			target: { kind: "relation", entity: record.entity, target: record.target, relationName: name },
			newTree,
		});
	});

	app.on_relation_changed((record: LifecycleRecord) => {
		if (recorder.phase !== "recording" || record.entity === undefined || record.target === undefined || record.relation === undefined) return;
		const name = relationDisplayName(record.relation);
		const key = relationKey(name, record.entity, record.target);
		const oldTree = recorder.shadow.get(key);
		const newTree = record.data !== undefined ? buildValueTree(record.data, { rootKey: name }) : undefined;
		if (newTree !== undefined) recorder.shadow.set(key, newTree);
		recorder.append({
			tick: record.tick,
			kind: "change",
			target: { kind: "relation", entity: record.entity, target: record.target, relationName: name },
			oldTree,
			newTree,
		});
	});

	app.on_relation_removed((record: LifecycleRecord) => {
		if (recorder.phase !== "recording" || record.entity === undefined || record.target === undefined || record.relation === undefined) return;
		const name = relationDisplayName(record.relation);
		const key = relationKey(name, record.entity, record.target);
		const oldTree = recorder.shadow.get(key) ?? (record.oldValue !== undefined ? buildValueTree(record.oldValue, { rootKey: name }) : undefined);
		recorder.shadow.delete(key);
		recorder.append({
			tick: record.tick,
			kind: "remove",
			target: { kind: "relation", entity: record.entity, target: record.target, relationName: name },
			oldTree,
		});
	});
}

function drainCommand(state: WorldInspectorRecorderState, frame: number): void {
	const command = state.pendingCommand;
	state.pendingCommand = undefined;
	if (command === "start") {
		state.clearBuffer();
		state.applyMaxFramesDraft();
		state.shadow.clear();
		state.pending = [];
		state.startFrame = frame;
		state.phase = "recording";
	} else if (command === "stop") {
		state.phase = "stopped";
		state.resultWindowOpen = true;
		state.shadow.clear();
		state.pending = [];
	}
}

/** Drains pending lifecycle entries into one FrameRecord per render tick. */
export class WorldInspectorFrameRecorderSystem {
	run(worldArg: World, state: WorldInspectorRecorderState, ctx: ScheduleContext): void {
		const world = worldArg as unknown as RovyWorld;
		if (state.pendingCommand !== undefined) drainCommand(state, ctx.frame);
		if (state.phase !== "recording") {
			state.pending = [];
			return;
		}
		const entries = state.pending;
		state.pending = [];
		const counts = countByKind(entries);
		state.pushFrame({
			frame: ctx.frame,
			relativeIndex: ctx.frame - state.startFrame,
			tick: world.changeTick,
			entityChanges: counts.entity,
			componentChanges: counts.component,
			resourceChanges: counts.resource,
			relationChanges: counts.relation,
			entries,
		});
	}
}

export class StartFrameRecordingObserver {
	run(_event: StartFrameRecording, state: WorldInspectorRecorderState): void {
		state.queueStart();
	}
}

export class StopFrameRecordingObserver {
	run(_event: StopFrameRecording, state: WorldInspectorRecorderState): void {
		state.queueStop();
	}
}
