import { rovy, RovyWorld, ScheduleContext, type Ctor, type Entity, type StableId, type World } from "@rovy/core";
import { StartFrameRecording, StopFrameRecording } from "../events";

type JecsEntity = Entity;
import {
	deepClone,
	diffSnapshots,
	INSPECT_DEPTH,
	snapshotEqual,
	valueToText,
	type ChangeEntry,
	type FrameRecord,
} from "./recorder-snapshot";

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
	lastSampledTick = -1;
	componentShadow = new Map<JecsEntity, Map<Entity, unknown>>();
	resourceShadow = new Map<Ctor, unknown>();
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
}

function componentName(id: StableId): string {
	const pathParts = id.split("/");
	const tail = pathParts[pathParts.size() - 1] ?? id;
	const scopeParts = tail.split("@");
	return scopeParts[scopeParts.size() - 1] ?? tail;
}

function resourceIdFor(ctor: Ctor): StableId {
	for (const reg of rovy.registry.resources) {
		if (reg.ctor === ctor) return reg.id;
	}
	return tostring(ctor);
}

function snapshotAllShadow(world: RovyWorld, state: WorldInspectorRecorderState): void {
	state.componentShadow = new Map();
	for (const comp of world.inspectRegisteredComponents()) {
		const id = world.componentId(comp.ctor);
		const shadow = new Map<Entity, unknown>();
		for (const e of world.entitiesWith(comp.ctor)) {
			const cur = world.get(e, comp.ctor);
			shadow.set(e, deepClone(cur, INSPECT_DEPTH));
		}
		state.componentShadow.set(id, shadow);
	}
	state.resourceShadow = new Map();
	for (const reg of rovy.registry.inspects) {
		const cur = world.optResource(reg.ctor);
		if (cur === undefined) continue;
		const depth = reg.depth ?? INSPECT_DEPTH;
		state.resourceShadow.set(reg.ctor, deepClone(cur, depth));
	}
}

function drainCommand(world: RovyWorld, state: WorldInspectorRecorderState): void {
	const command = state.pendingCommand;
	state.pendingCommand = undefined;
	if (command === "start") {
		state.clearBuffer();
		state.applyMaxFramesDraft();
		snapshotAllShadow(world, state);
		state.lastSampledTick = world.changeTick;
		const ctx = world.optResource(ScheduleContext);
		state.startFrame = ctx?.frame ?? 0;
		state.phase = "recording";
	} else if (command === "stop") {
		state.phase = "stopped";
		state.resultWindowOpen = true;
		state.componentShadow = new Map();
		state.resourceShadow = new Map();
	}
}

function recordFrame(world: RovyWorld, state: WorldInspectorRecorderState, frame: number): void {
	const tick = world.changeTick;
	const entries = new Array<ChangeEntry>();
	const nextComponentShadow = new Map<JecsEntity, Map<Entity, unknown>>();

	for (const comp of world.inspectRegisteredComponents()) {
		const id = world.componentId(comp.ctor);
		const priorShadow = state.componentShadow.get(id) ?? new Map<Entity, unknown>();
		const touched = world.changedSince(id, state.lastSampledTick);
		const removedRecs = world.removedRecordsSince(id, state.lastSampledTick);
		if (touched.size() === 0 && removedRecs.size() === 0) {
			nextComponentShadow.set(id, priorShadow);
			continue;
		}
		const nextShadow = new Map<Entity, unknown>();
		const seen = new Set<Entity>();
		const name = componentName(comp.id);
		for (const e of world.entitiesWith(comp.ctor)) {
			seen.add(e);
			const cur = world.get(e, comp.ctor);
			const clone = deepClone(cur, INSPECT_DEPTH);
			nextShadow.set(e, clone);
			const prior = priorShadow.get(e);
			if (prior === undefined && !priorShadow.has(e)) {
				entries.push({
					tick,
					kind: "add",
					target: { kind: "component", entity: e, componentId: comp.id, componentName: name },
					newText: valueToText(cur),
				});
			} else if (!snapshotEqual(prior, clone)) {
				entries.push({
					tick,
					kind: "change",
					target: { kind: "component", entity: e, componentId: comp.id, componentName: name },
					oldText: valueToText(prior),
					newText: valueToText(cur),
				});
			}
		}
		for (const [e, oldClone] of priorShadow) {
			if (seen.has(e)) continue;
			entries.push({
				tick,
				kind: "remove",
				target: { kind: "component", entity: e, componentId: comp.id, componentName: name },
				oldText: valueToText(oldClone),
			});
		}
		nextComponentShadow.set(id, nextShadow);
	}
	state.componentShadow = nextComponentShadow;

	const nextResourceShadow = new Map<Ctor, unknown>();
	for (const reg of rovy.registry.inspects) {
		const cur = world.optResource(reg.ctor);
		const depth = reg.depth ?? INSPECT_DEPTH;
		const prior = state.resourceShadow.get(reg.ctor);
		const cloneOrUndef = cur === undefined ? undefined : deepClone(cur, depth);
		if (cur === undefined && prior === undefined) continue;
		const resourceId = resourceIdFor(reg.ctor);
		diffSnapshots(
			prior,
			cloneOrUndef,
			"",
			entries,
			tick,
			(path) => ({ kind: "resource", resourceId, path }),
			depth,
			reg.exclude,
		);
		if (cloneOrUndef !== undefined) nextResourceShadow.set(reg.ctor, cloneOrUndef);
	}
	state.resourceShadow = nextResourceShadow;

	let componentChanges = 0;
	let resourceChanges = 0;
	for (const entry of entries) {
		if (entry.target.kind === "component") componentChanges += 1;
		else resourceChanges += 1;
	}

	state.pushFrame({
		frame,
		relativeIndex: frame - state.startFrame,
		tick,
		componentChanges,
		resourceChanges,
		entries,
	});
	state.lastSampledTick = tick;
}

export class WorldInspectorFrameRecorderSystem {
	run(worldArg: World, state: WorldInspectorRecorderState, ctx: ScheduleContext): void {
		const world = worldArg as unknown as RovyWorld;
		if (state.pendingCommand !== undefined) drainCommand(world, state);
		if (state.phase !== "recording") return;
		recordFrame(world, state, ctx.frame);
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
