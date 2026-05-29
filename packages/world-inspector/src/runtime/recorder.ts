import { rovy, RovyWorld, ScheduleContext, type App, type Ctor, type Entity, type LifecycleRecord, type StableId, type World } from "@rovy/core";
import { StartFrameRecording, StopFrameRecording } from "../events";
import { buildValueTree, type WorldInspectorValueNodeDto } from "./value-tree";
import { countByKind, type ChangeEntry, type FrameRecord, type RecordingControlCommand } from "./recorder-snapshot";

export type RecorderPhase = "idle" | "recording" | "stopped";

export interface RecorderConfig {
	maxFrames: number;
}

const DEFAULT_MAX_FRAMES = 3600;
const MIN_MAX_FRAMES = 1;
const MAX_MAX_FRAMES = 60000;

export interface RecordingControlQueueItem {
	readonly requestId: string;
	readonly sessionId: string;
	readonly targetKey: string;
	readonly command: RecordingControlCommand;
	readonly maxFrames: number;
}

export interface WorldInspectorRecorderCollection {
	forEachRecordingRecorder(callback: (recorder: WorldInspectorRecorderState) => void): void;
}

export class WorldInspectorRecorderState {
	phase: RecorderPhase = "idle";
	config: RecorderConfig = { maxFrames: DEFAULT_MAX_FRAMES };
	frames: Array<FrameRecord | undefined> = new Array<FrameRecord | undefined>(DEFAULT_MAX_FRAMES, undefined);
	head = 0;
	count = 0;
	startFrame = 0;
	targetKey = "local";
	sessionId = "";
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
	statusMessage?: string;
	private nextRemoteRequest = 0;
	private nextSession = 0;
	private readonly remoteControlQueue = new Array<RecordingControlQueueItem>();

	selectTarget(targetKey: string): void {
		if (targetKey === this.targetKey) return;
		if (this.phase === "recording" && this.targetKey !== "local" && this.sessionId.size() > 0) {
			this.enqueueRemoteControl("stop", this.targetKey, this.sessionId);
		}
		this.targetKey = targetKey;
		this.sessionId = "";
		this.pendingCommand = undefined;
		this.pending = [];
		this.shadow.clear();
		this.statusMessage = undefined;
		this.phase = "idle";
		this.clearBuffer();
	}

	queueStart(targetKey = this.targetKey): void {
		this.selectTarget(targetKey);
		this.applyMaxFramesDraft();
		this.clearBuffer();
		this.shadow.clear();
		this.pending = [];
		this.statusMessage = undefined;
		if (this.targetKey === "local") {
			this.pendingCommand = "start";
			return;
		}
		this.sessionId = this.makeSessionId(this.targetKey);
		this.phase = "recording";
		this.enqueueRemoteControl("start", this.targetKey, this.sessionId);
	}

	queueStop(targetKey = this.targetKey): void {
		if (targetKey !== this.targetKey) this.selectTarget(targetKey);
		if (this.targetKey === "local") {
			this.pendingCommand = "stop";
			return;
		}
		if (this.sessionId.size() > 0) this.enqueueRemoteControl("stop", this.targetKey, this.sessionId);
		this.phase = "stopped";
		this.shadow.clear();
		this.pending = [];
	}

	queueClear(targetKey = this.targetKey): void {
		this.selectTarget(targetKey);
		this.clearBuffer();
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
		this.setMaxFrames(parsed);
	}

	setMaxFrames(maxFrames: number): void {
		const clamped = math.clamp(math.floor(maxFrames), MIN_MAX_FRAMES, MAX_MAX_FRAMES);
		if (clamped !== this.config.maxFrames) {
			this.config.maxFrames = clamped;
			this.clearBuffer();
		}
		this.maxFramesDraft = tostring(clamped);
	}

	/** Append a normalized change; called by lifecycle listeners while recording. */
	append(entry: ChangeEntry): void {
		this.pending.push(entry);
	}

	forEachRecordingRecorder(callback: (recorder: WorldInspectorRecorderState) => void): void {
		if (this.phase === "recording" && this.targetKey === "local") callback(this);
	}

	startHostRecording(targetKey: string, sessionId: string, maxFrames: number, frame: number): void {
		this.targetKey = targetKey;
		this.sessionId = sessionId;
		this.setMaxFrames(maxFrames);
		this.clearBuffer();
		this.shadow.clear();
		this.pending = [];
		this.pendingCommand = undefined;
		this.startFrame = frame;
		this.phase = "recording";
		this.statusMessage = undefined;
	}

	stopHostRecording(): void {
		this.pendingCommand = undefined;
		this.phase = "stopped";
		this.shadow.clear();
		this.pending = [];
	}

	consumeRemoteControlRequests(): RecordingControlQueueItem[] {
		const out = [...this.remoteControlQueue];
		this.remoteControlQueue.clear();
		return out;
	}

	receiveRemoteControlResponse(sessionId: string, targetKey: string, ok: boolean, command: RecordingControlCommand, message?: string): void {
		if (sessionId !== this.sessionId || targetKey !== this.targetKey) return;
		this.statusMessage = message;
		if (!ok) {
			this.phase = "stopped";
			this.shadow.clear();
			this.pending = [];
			return;
		}
		if (command === "start") this.phase = "recording";
		else if (command === "stop") this.phase = "stopped";
	}

	receiveRemoteFrame(sessionId: string, targetKey: string, frame: FrameRecord): void {
		if (sessionId !== this.sessionId || targetKey !== this.targetKey) return;
		if (this.phase !== "recording") return;
		this.pushFrame(frame);
	}

	private enqueueRemoteControl(command: RecordingControlCommand, targetKey: string, sessionId: string): void {
		this.nextRemoteRequest += 1;
		this.remoteControlQueue.push({
			requestId: `wi-rec-${this.nextRemoteRequest}`,
			sessionId,
			targetKey,
			command,
			maxFrames: this.config.maxFrames,
		});
	}

	private makeSessionId(targetKey: string): string {
		this.nextSession += 1;
		return `${targetKey}:${this.nextSession}`;
	}
}

export interface PeerRecorderSession {
	readonly sessionId: string;
	readonly requesterUserId: number;
	readonly recorder: WorldInspectorRecorderState;
}

export class WorldInspectorPeerRecorderState implements WorldInspectorRecorderCollection {
	readonly sessions = new Map<string, PeerRecorderSession>();

	startSession(sessionId: string, requesterUserId: number, maxFrames: number, frame: number): void {
		const recorder = new WorldInspectorRecorderState();
		recorder.startHostRecording("local", sessionId, maxFrames, frame);
		this.sessions.set(peerRecorderSessionKey(requesterUserId, sessionId), { sessionId, requesterUserId, recorder });
	}

	stopSession(sessionId: string, requesterUserId: number): boolean {
		const key = peerRecorderSessionKey(requesterUserId, sessionId);
		const session = this.sessions.get(key);
		if (session === undefined || session.requesterUserId !== requesterUserId) return false;
		session.recorder.stopHostRecording();
		this.sessions.delete(key);
		return true;
	}

	forEachRecordingRecorder(callback: (recorder: WorldInspectorRecorderState) => void): void {
		for (const [, session] of this.sessions) {
			if (session.recorder.phase === "recording") callback(session.recorder);
		}
	}
}

function peerRecorderSessionKey(requesterUserId: number, sessionId: string): string {
	return `${tostring(requesterUserId)}:${sessionId}`;
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
export function registerRecorderListeners(app: App, recorders: WorldInspectorRecorderCollection): void {
	app.on_entity_spawned((record: LifecycleRecord) => {
		if (record.entity === undefined) return;
		recorders.forEachRecordingRecorder((recorder) => {
			recorder.append({ tick: record.tick, kind: "add", target: { kind: "entity", entity: record.entity! } });
		});
	});

	app.on_entity_despawned((record: LifecycleRecord) => {
		if (record.entity === undefined) return;
		recorders.forEachRecordingRecorder((recorder) => {
			recorder.append({ tick: record.tick, kind: "remove", target: { kind: "entity", entity: record.entity! } });
		});
	});

	app.on_component_added((record: LifecycleRecord) => {
		if (record.entity === undefined || record.id === undefined) return;
		recorders.forEachRecordingRecorder((recorder) => {
			const name = record.name ?? record.id!;
			const newTree = buildValueTree(record.value, { rootKey: name });
			recorder.shadow.set(componentKey(record.id!, record.entity!), newTree);
			recorder.append({
				tick: record.tick,
				kind: "add",
				target: { kind: "component", entity: record.entity!, componentId: record.id!, componentName: name },
				newTree,
			});
		});
	});

	app.on_component_changed((record: LifecycleRecord) => {
		if (record.entity === undefined || record.id === undefined) return;
		recorders.forEachRecordingRecorder((recorder) => {
			const name = record.name ?? record.id!;
			const key = componentKey(record.id!, record.entity!);
			const oldTree = recorder.shadow.get(key);
			const newTree = buildValueTree(record.value, { rootKey: name });
			recorder.shadow.set(key, newTree);
			recorder.append({
				tick: record.tick,
				kind: "change",
				target: { kind: "component", entity: record.entity!, componentId: record.id!, componentName: name },
				oldTree,
				newTree,
			});
		});
	});

	app.on_component_removed((record: LifecycleRecord) => {
		if (record.entity === undefined || record.id === undefined) return;
		recorders.forEachRecordingRecorder((recorder) => {
			const name = record.name ?? record.id!;
			const key = componentKey(record.id!, record.entity!);
			const oldTree = recorder.shadow.get(key) ?? buildValueTree(record.oldValue, { rootKey: name });
			recorder.shadow.delete(key);
			recorder.append({
				tick: record.tick,
				kind: "remove",
				target: { kind: "component", entity: record.entity!, componentId: record.id!, componentName: name },
				oldTree,
			});
		});
	});

	app.on_resource_changed((record: LifecycleRecord) => {
		if (record.id === undefined) return;
		recorders.forEachRecordingRecorder((recorder) => {
			const name = record.name ?? record.id!;
			const key = resourceKey(record.id!);
			const oldTree = recorder.shadow.get(key);
			const newTree = buildValueTree(record.value, { rootKey: name });
			recorder.shadow.set(key, newTree);
			recorder.append({
				tick: record.tick,
				kind: "change",
				target: { kind: "resource", resourceId: record.id!, resourceName: name, path: joinPaths(record.paths) },
				oldTree,
				newTree,
			});
		});
	});

	app.on_relation_added((record: LifecycleRecord) => {
		if (record.entity === undefined || record.target === undefined || record.relation === undefined) return;
		recorders.forEachRecordingRecorder((recorder) => {
			const name = relationDisplayName(record.relation!);
			const newTree = record.data !== undefined ? buildValueTree(record.data, { rootKey: name }) : undefined;
			if (newTree !== undefined) recorder.shadow.set(relationKey(name, record.entity!, record.target!), newTree);
			recorder.append({
				tick: record.tick,
				kind: "add",
				target: { kind: "relation", entity: record.entity!, target: record.target!, relationName: name },
				newTree,
			});
		});
	});

	app.on_relation_changed((record: LifecycleRecord) => {
		if (record.entity === undefined || record.target === undefined || record.relation === undefined) return;
		recorders.forEachRecordingRecorder((recorder) => {
			const name = relationDisplayName(record.relation!);
			const key = relationKey(name, record.entity!, record.target!);
			const oldTree = recorder.shadow.get(key);
			const newTree = record.data !== undefined ? buildValueTree(record.data, { rootKey: name }) : undefined;
			if (newTree !== undefined) recorder.shadow.set(key, newTree);
			recorder.append({
				tick: record.tick,
				kind: "change",
				target: { kind: "relation", entity: record.entity!, target: record.target!, relationName: name },
				oldTree,
				newTree,
			});
		});
	});

	app.on_relation_removed((record: LifecycleRecord) => {
		if (record.entity === undefined || record.target === undefined || record.relation === undefined) return;
		recorders.forEachRecordingRecorder((recorder) => {
			const name = relationDisplayName(record.relation!);
			const key = relationKey(name, record.entity!, record.target!);
			const oldTree = recorder.shadow.get(key) ?? (record.oldValue !== undefined ? buildValueTree(record.oldValue, { rootKey: name }) : undefined);
			recorder.shadow.delete(key);
			recorder.append({
				tick: record.tick,
				kind: "remove",
				target: { kind: "relation", entity: record.entity!, target: record.target!, relationName: name },
				oldTree,
			});
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

export function drainRecorderFrame(worldArg: World, state: WorldInspectorRecorderState, ctx: ScheduleContext): FrameRecord | undefined {
	const world = worldArg as unknown as RovyWorld;
	if (state.pendingCommand !== undefined) drainCommand(state, ctx.frame);
	if (state.phase !== "recording") {
		state.pending = [];
		return undefined;
	}
	const entries = state.pending;
	state.pending = [];
	const counts = countByKind(entries);
	const record = {
		frame: ctx.frame,
		relativeIndex: ctx.frame - state.startFrame,
		tick: world.changeTick,
		entityChanges: counts.entity,
		componentChanges: counts.component,
		resourceChanges: counts.resource,
		relationChanges: counts.relation,
		entries,
	};
	state.pushFrame(record);
	return record;
}

/** Drains pending lifecycle entries into one FrameRecord per render tick. */
export class WorldInspectorFrameRecorderSystem {
	run(world: World, state: WorldInspectorRecorderState, ctx: ScheduleContext): void {
		if (state.targetKey !== "local") {
			state.pending = [];
			return;
		}
		drainRecorderFrame(world, state, ctx);
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
