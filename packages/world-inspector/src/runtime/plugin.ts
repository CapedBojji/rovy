import { rovy, ScheduleContext, type App, type Ctor, type Plugin, type World } from "@rovy/core";
import {
	NET_CLIENT_PARAM,
	NET_EVENT_CONTEXT_PARAM,
	NET_SERVER_PARAM,
	NetFlushSet,
	NetPlugin,
	RemoteEventTransport,
	type NetClient,
	type NetEventContext,
	type NetServer,
	type NetTransport,
	type RuntimeBoundary,
} from "@rovy/networking";
import { rovyUi, type Node } from "@rovy/ui";
import {
	HideWorldInspector,
	ShowWorldInspector,
	StartFrameRecording,
	StopFrameRecording,
	ToggleWorldInspector,
} from "../events";
import {
	StartFrameRecordingObserver,
	StopFrameRecordingObserver,
	WorldInspectorFrameRecorderSystem,
	WorldInspectorPeerRecorderState,
	WorldInspectorRecorderState,
	drainRecorderFrame,
	registerRecorderListeners,
} from "./recorder";
import {
	PeerRecordingControlRequest,
	PeerRecordingControlResponse,
	PeerRecordingFrame,
	RecordingControlRequest,
	RecordingControlResponse,
	RecordingFrame,
	WorldInspectorEditRequest,
	WorldInspectorEditResponse,
	WorldInspectorPeerEditRequest,
	WorldInspectorPeerEditResponse,
	WorldInspectorPeerSnapshotRequest,
	WorldInspectorPeerSnapshotResponse,
	WorldInspectorSnapshotRequest,
	WorldInspectorSnapshotResponse,
	WorldInspectorTargetListRequest,
	WorldInspectorTargetListResponse,
	registerWorldInspectorNetEvents,
} from "../remote/events";
import {
	applyWorldInspectorEdit,
	worldToSnapshot,
	type WorldInspectorEditDto,
	type WorldInspectorSnapshotDto,
	type WorldInspectorTargetChoice,
} from "./target";
import { WorldInspectorState } from "../state";
import { worldInspector } from "../widgets/world-inspector";

export interface WorldInspectorPluginOptions {
	readonly uiRoot?: Instance | Node;
	readonly renderSchedule?: Ctor;
	readonly networkSchedule?: Ctor;
	readonly networkTransport?: NetTransport;
	readonly networkBoundary?: RuntimeBoundary;
}

export interface WorldInspectorAccessContext {
	readonly requester: Player;
	readonly action: "view" | "edit";
	readonly targetKind: "server" | "player";
	readonly targetPlayer?: Player;
}

export interface WorldInspectorServerPluginOptions {
	readonly schedule: Ctor;
	readonly access?: (ctx: WorldInspectorAccessContext) => boolean;
	readonly networkTransport?: NetTransport;
	readonly networkBoundary?: RuntimeBoundary;
}

class ShowWorldInspectorObserver {
	run(_event: ShowWorldInspector, state: WorldInspectorState): void {
		state.show();
	}
}

class HideWorldInspectorObserver {
	run(_event: HideWorldInspector, state: WorldInspectorState): void {
		state.hide();
	}
}

class ToggleWorldInspectorObserver {
	run(_event: ToggleWorldInspector, state: WorldInspectorState): void {
		state.toggle();
	}
}

class WorldInspectorRenderSystem {
	run(world: World, state: WorldInspectorState, recorder: WorldInspectorRecorderState): void {
		renderWorldInspector(world, state, recorder);
	}
}

class WorldInspectorClientNetworkSystem {
	run(state: WorldInspectorState, recorder: WorldInspectorRecorderState, client: NetClient): void {
		const targetListRequest = state.consumeTargetListRequest();
		if (targetListRequest !== undefined) client.trigger(new WorldInspectorTargetListRequest(targetListRequest));
		if (state.visible && state.selectedTargetKey !== "local") {
			const now = time();
			if (now - state.lastSnapshotAt >= state.snapshotIntervalSec) {
				state.lastSnapshotAt = now;
				state.queueSnapshot(state.selectedTargetKey);
			}
		}
		for (const request of state.consumeSnapshotRequests()) {
			client.trigger(new WorldInspectorSnapshotRequest(request.requestId, request.targetKey));
		}
		for (const request of state.consumeEditRequests()) {
			client.trigger(new WorldInspectorEditRequest(request.requestId, request.targetKey, request.edit));
		}
		for (const request of recorder.consumeRemoteControlRequests()) {
			client.trigger(new RecordingControlRequest(request.requestId, request.sessionId, request.targetKey, request.command, request.maxFrames));
		}
	}
}

class WorldInspectorTargetListResponseObserver {
	run(event: WorldInspectorTargetListResponse, state: WorldInspectorState): void {
		state.receiveTargets(event.targets, event.message);
	}
}

class WorldInspectorSnapshotResponseObserver {
	run(event: WorldInspectorSnapshotResponse, state: WorldInspectorState): void {
		state.receiveSnapshot(event.snapshot, event.message);
	}
}

class WorldInspectorEditResponseObserver {
	run(event: WorldInspectorEditResponse, state: WorldInspectorState): void {
		state.receiveSnapshot(event.snapshot, event.message);
		if (event.spawnedEntityId !== undefined) state.openEntityWindow(event.targetKey, event.spawnedEntityId);
	}
}

class RecordingControlResponseObserver {
	run(event: RecordingControlResponse, recorder: WorldInspectorRecorderState): void {
		recorder.receiveRemoteControlResponse(event.sessionId, event.targetKey, event.ok, event.command, event.message);
	}
}

class RecordingFrameObserver {
	run(event: RecordingFrame, recorder: WorldInspectorRecorderState): void {
		recorder.receiveRemoteFrame(event.sessionId, event.targetKey, event.frame);
	}
}

class WorldInspectorPeerSnapshotRequestObserver {
	run(event: WorldInspectorPeerSnapshotRequest, world: World, client: NetClient): void {
		client.trigger(new WorldInspectorPeerSnapshotResponse(event.requestId, event.requesterUserId, worldToSnapshot(world, "local")));
	}
}

class WorldInspectorPeerEditRequestObserver {
	run(event: WorldInspectorPeerEditRequest, world: World, client: NetClient): void {
		const result = applyWorldInspectorEdit(world, event.edit);
		client.trigger(
			new WorldInspectorPeerEditResponse(
				event.requestId,
				event.requesterUserId,
				result.ok,
				worldToSnapshot(world, "local"),
				result.error,
				result.entityId,
			),
		);
	}
}

class PeerRecordingControlRequestObserver {
	run(event: PeerRecordingControlRequest, recorder: WorldInspectorPeerRecorderState, client: NetClient, ctx: ScheduleContext): void {
		if (event.command === "start") {
			recorder.startSession(event.sessionId, event.requesterUserId, event.maxFrames, ctx.frame);
			client.trigger(new PeerRecordingControlResponse(event.requestId, event.sessionId, event.requesterUserId, true, event.command));
			return;
		}
		const ok = recorder.stopSession(event.sessionId, event.requesterUserId);
		client.trigger(new PeerRecordingControlResponse(event.requestId, event.sessionId, event.requesterUserId, ok, event.command, ok ? undefined : "not recording"));
	}
}

class WorldInspectorPeerRecordingStreamSystem {
	run(world: World, recorder: WorldInspectorPeerRecorderState, client: NetClient, ctx: ScheduleContext): void {
		for (const [, session] of recorder.sessions) {
			const frame = drainRecorderFrame(world, session.recorder, ctx);
			if (frame !== undefined) client.trigger(new PeerRecordingFrame(session.sessionId, session.requesterUserId, frame));
		}
	}
}

export class WorldInspectorServerState {
	readonly pendingPeer = new Map<string, { requester: Player; target: Player; targetKey: string; action: "view" | "edit" }>();
	readonly serverRecorders = new Map<string, { requester: Player; recorder: WorldInspectorRecorderState }>();
	readonly peerRecorders = new Map<string, { requester: Player; target: Player; targetKey: string }>();

	constructor(readonly access?: (ctx: WorldInspectorAccessContext) => boolean) {}

	can(ctx: WorldInspectorAccessContext): boolean {
		return this.access?.(ctx) === true;
	}

	startServerRecording(requester: Player, sessionId: string, maxFrames: number, frame: number): void {
		const recorder = new WorldInspectorRecorderState();
		recorder.startHostRecording("server", sessionId, maxFrames, frame);
		this.serverRecorders.set(recordingSessionKey(requester.UserId, sessionId), { requester, recorder });
	}

	stopServerRecording(requester: Player, sessionId: string): boolean {
		const key = recordingSessionKey(requester.UserId, sessionId);
		const session = this.serverRecorders.get(key);
		if (session === undefined) return false;
		session.recorder.stopHostRecording();
		this.serverRecorders.delete(key);
		return true;
	}

	forEachRecordingRecorder(callback: (recorder: WorldInspectorRecorderState) => void): void {
		for (const [, session] of this.serverRecorders) {
			if (session.recorder.phase === "recording") callback(session.recorder);
		}
	}
}

class WorldInspectorTargetListRequestObserver {
	run(event: WorldInspectorTargetListRequest, server: NetServer, netContext: NetEventContext, state: WorldInspectorServerState): void {
		const requester = netContext.senderOf(event);
		if (requester === undefined) return;
		const targets = new Array<WorldInspectorTargetChoice>();
		if (state.can({ requester, action: "view", targetKind: "server" })) {
			targets.push({ key: "server", label: "Server", kind: "server" });
		}
		for (const player of getPlayers()) {
			if (samePlayer(player, requester)) continue;
			if (state.can({ requester, action: "view", targetKind: "player", targetPlayer: player })) {
				targets.push({
					key: playerTargetKey(player),
					label: player.DisplayName !== undefined && player.DisplayName !== "" ? player.DisplayName : player.Name,
					kind: "player",
					playerUserId: player.UserId,
				});
			}
		}
		server.trigger(requester, new WorldInspectorTargetListResponse(event.requestId, targets));
	}
}

class WorldInspectorSnapshotRequestObserver {
	run(event: WorldInspectorSnapshotRequest, world: World, server: NetServer, netContext: NetEventContext, state: WorldInspectorServerState): void {
		const requester = netContext.senderOf(event);
		if (requester === undefined) return;
		const resolved = resolveRemoteTarget(event.targetKey);
		if (resolved.kind === "server") {
			if (!state.can({ requester, action: "view", targetKind: "server" })) {
				server.trigger(requester, new WorldInspectorSnapshotResponse(event.requestId, emptySnapshot(event.targetKey), "access denied"));
				return;
			}
			server.trigger(requester, new WorldInspectorSnapshotResponse(event.requestId, worldToSnapshot(world, event.targetKey)));
			return;
		}

		const targetPlayer = findPlayerByUserId(resolved.userId);
		if (targetPlayer === undefined || !state.can({ requester, action: "view", targetKind: "player", targetPlayer })) {
			server.trigger(requester, new WorldInspectorSnapshotResponse(event.requestId, emptySnapshot(event.targetKey), "access denied"));
			return;
		}
		state.pendingPeer.set(event.requestId, { requester, target: targetPlayer, targetKey: event.targetKey, action: "view" });
		server.trigger(targetPlayer, new WorldInspectorPeerSnapshotRequest(event.requestId, requester.UserId));
	}
}

class WorldInspectorEditRequestObserver {
	run(event: WorldInspectorEditRequest, world: World, server: NetServer, netContext: NetEventContext, state: WorldInspectorServerState): void {
		const requester = netContext.senderOf(event);
		if (requester === undefined) return;
		const resolved = resolveRemoteTarget(event.targetKey);
		if (resolved.kind === "server") {
			if (!state.can({ requester, action: "edit", targetKind: "server" })) {
				server.trigger(requester, new WorldInspectorEditResponse(event.requestId, event.targetKey, false, emptySnapshot(event.targetKey), "access denied"));
				return;
			}
			const result = applyWorldInspectorEdit(world, event.edit);
			server.trigger(requester, new WorldInspectorEditResponse(event.requestId, event.targetKey, result.ok, worldToSnapshot(world, event.targetKey), result.error, result.entityId));
			return;
		}

		const targetPlayer = findPlayerByUserId(resolved.userId);
		if (targetPlayer === undefined || !state.can({ requester, action: "edit", targetKind: "player", targetPlayer })) {
			server.trigger(requester, new WorldInspectorEditResponse(event.requestId, event.targetKey, false, emptySnapshot(event.targetKey), "access denied"));
			return;
		}
		state.pendingPeer.set(event.requestId, { requester, target: targetPlayer, targetKey: event.targetKey, action: "edit" });
		server.trigger(targetPlayer, new WorldInspectorPeerEditRequest(event.requestId, requester.UserId, event.edit));
	}
}

class WorldInspectorPeerSnapshotResponseObserver {
	run(event: WorldInspectorPeerSnapshotResponse, server: NetServer, netContext: NetEventContext, state: WorldInspectorServerState): void {
		const sender = netContext.senderOf(event);
		const pending = state.pendingPeer.get(event.requestId);
		if (sender === undefined || pending === undefined || !samePlayer(sender, pending.target)) return;
		state.pendingPeer.delete(event.requestId);
		server.trigger(pending.requester, new WorldInspectorSnapshotResponse(event.requestId, retargetSnapshot(event.snapshot, pending.targetKey), event.message));
	}
}

class WorldInspectorPeerEditResponseObserver {
	run(event: WorldInspectorPeerEditResponse, server: NetServer, netContext: NetEventContext, state: WorldInspectorServerState): void {
		const sender = netContext.senderOf(event);
		const pending = state.pendingPeer.get(event.requestId);
		if (sender === undefined || pending === undefined || !samePlayer(sender, pending.target)) return;
		state.pendingPeer.delete(event.requestId);
		server.trigger(pending.requester, new WorldInspectorEditResponse(event.requestId, pending.targetKey, event.ok, retargetSnapshot(event.snapshot, pending.targetKey), event.message, event.spawnedEntityId));
	}
}

class RecordingControlRequestObserver {
	run(event: RecordingControlRequest, server: NetServer, netContext: NetEventContext, state: WorldInspectorServerState, ctx: ScheduleContext): void {
		const requester = netContext.senderOf(event);
		if (requester === undefined) return;
		const resolved = resolveRemoteTarget(event.targetKey);
		if (resolved.kind === "server") {
			if (!state.can({ requester, action: "view", targetKind: "server" })) {
				server.trigger(requester, new RecordingControlResponse(event.requestId, event.sessionId, event.targetKey, false, event.command, "access denied"));
				return;
			}
			if (event.command === "start") {
				state.startServerRecording(requester, event.sessionId, event.maxFrames, ctx.frame);
			} else {
				state.stopServerRecording(requester, event.sessionId);
			}
			server.trigger(requester, new RecordingControlResponse(event.requestId, event.sessionId, event.targetKey, true, event.command));
			return;
		}

		const targetPlayer = findPlayerByUserId(resolved.userId);
		if (targetPlayer === undefined || !state.can({ requester, action: "view", targetKind: "player", targetPlayer })) {
			server.trigger(requester, new RecordingControlResponse(event.requestId, event.sessionId, event.targetKey, false, event.command, "access denied"));
			return;
		}
		const key = recordingSessionKey(requester.UserId, event.sessionId);
		if (event.command === "start") {
			state.peerRecorders.set(key, { requester, target: targetPlayer, targetKey: event.targetKey });
		}
		server.trigger(targetPlayer, new PeerRecordingControlRequest(event.requestId, event.sessionId, requester.UserId, event.command, event.maxFrames));
	}
}

class PeerRecordingControlResponseObserver {
	run(event: PeerRecordingControlResponse, server: NetServer, netContext: NetEventContext, state: WorldInspectorServerState): void {
		const sender = netContext.senderOf(event);
		const key = recordingSessionKey(event.requesterUserId, event.sessionId);
		const session = state.peerRecorders.get(key);
		if (sender === undefined || session === undefined || !samePlayer(sender, session.target)) return;
		server.trigger(session.requester, new RecordingControlResponse(event.requestId, event.sessionId, session.targetKey, event.ok, event.command, event.message));
		if (event.command === "stop" || !event.ok) state.peerRecorders.delete(key);
	}
}

class PeerRecordingFrameObserver {
	run(event: PeerRecordingFrame, server: NetServer, netContext: NetEventContext, state: WorldInspectorServerState): void {
		const sender = netContext.senderOf(event);
		const session = state.peerRecorders.get(recordingSessionKey(event.requesterUserId, event.sessionId));
		if (sender === undefined || session === undefined || !samePlayer(sender, session.target)) return;
		server.trigger(session.requester, new RecordingFrame(event.sessionId, session.targetKey, event.frame));
	}
}

class WorldInspectorServerRecordingStreamSystem {
	run(world: World, state: WorldInspectorServerState, server: NetServer, ctx: ScheduleContext): void {
		for (const [sessionKey, session] of state.serverRecorders) {
			const frame = drainRecorderFrame(world, session.recorder, ctx);
			if (frame !== undefined) server.trigger(session.requester, new RecordingFrame(session.recorder.sessionId, session.recorder.targetKey, frame));
			if (session.recorder.phase === "stopped") state.serverRecorders.delete(sessionKey);
		}
	}
}

function asRootNode(root: Instance | Node | undefined): Node | undefined {
	if (root === undefined) return undefined;
	if (typeOf(root) === "Instance") return rovyUi.new(root as Instance);
	const maybeNode = root as Partial<Node>;
	if (
		maybeNode.generation !== undefined &&
		maybeNode.effects !== undefined &&
		maybeNode.states !== undefined &&
		maybeNode.children !== undefined
	) {
		return root as Node;
	}
	return rovyUi.new(root as Instance);
}

function registerRuntime(schedule?: Ctor, networkSchedule?: Ctor): void {
	rovy.__resource(WorldInspectorState, "rovy/world-inspector/WorldInspectorState");
	rovy.__resource(WorldInspectorRecorderState, "rovy/world-inspector/WorldInspectorRecorderState");
	rovy.__resource(WorldInspectorPeerRecorderState, "rovy/world-inspector/WorldInspectorPeerRecorderState");
	rovy.__event(ShowWorldInspector);
	rovy.__event(HideWorldInspector);
	rovy.__event(ToggleWorldInspector);
	rovy.__event(StartFrameRecording);
	rovy.__event(StopFrameRecording);
	rovy.__observer(ShowWorldInspectorObserver, {
		event: ShowWorldInspector,
		priority: 0,
		params: [{ kind: "event" }, { kind: "resMut", ctor: WorldInspectorState }],
	});
	rovy.__observer(HideWorldInspectorObserver, {
		event: HideWorldInspector,
		priority: 0,
		params: [{ kind: "event" }, { kind: "resMut", ctor: WorldInspectorState }],
	});
	rovy.__observer(ToggleWorldInspectorObserver, {
		event: ToggleWorldInspector,
		priority: 0,
		params: [{ kind: "event" }, { kind: "resMut", ctor: WorldInspectorState }],
	});
	rovy.__observer(StartFrameRecordingObserver, {
		event: StartFrameRecording,
		priority: 0,
		params: [{ kind: "event" }, { kind: "resMut", ctor: WorldInspectorRecorderState }],
	});
	rovy.__observer(StopFrameRecordingObserver, {
		event: StopFrameRecording,
		priority: 0,
		params: [{ kind: "event" }, { kind: "resMut", ctor: WorldInspectorRecorderState }],
	});
	if (schedule !== undefined) {
		rovy.__system(WorldInspectorFrameRecorderSystem, {
			id: "rovy/world-inspector/WorldInspectorFrameRecorderSystem",
			schedule,
			before: [WorldInspectorRenderSystem],
			params: [
				{ kind: "world" },
				{ kind: "resMut", ctor: WorldInspectorRecorderState },
				{ kind: "res", ctor: ScheduleContext },
			],
		});
		rovy.__system(WorldInspectorRenderSystem, {
			id: "rovy/world-inspector/WorldInspectorRenderSystem",
			schedule,
			params: [
				{ kind: "world" },
				{ kind: "resMut", ctor: WorldInspectorState },
				{ kind: "resMut", ctor: WorldInspectorRecorderState },
			],
		});
	}
	if (networkSchedule !== undefined) {
		registerWorldInspectorNetEvents();
		rovy.__system(WorldInspectorClientNetworkSystem, {
			id: "rovy/world-inspector/WorldInspectorClientNetworkSystem",
			schedule: networkSchedule,
			set: NetFlushSet,
			params: [
				{ kind: "resMut", ctor: WorldInspectorState },
				{ kind: "resMut", ctor: WorldInspectorRecorderState },
				{ kind: "external", id: NET_CLIENT_PARAM },
			],
		});
		rovy.__system(WorldInspectorPeerRecordingStreamSystem, {
			id: "rovy/world-inspector/WorldInspectorPeerRecordingStreamSystem",
			schedule: networkSchedule,
			set: NetFlushSet,
			params: [
				{ kind: "world" },
				{ kind: "resMut", ctor: WorldInspectorPeerRecorderState },
				{ kind: "external", id: NET_CLIENT_PARAM },
				{ kind: "res", ctor: ScheduleContext },
			],
		});
		registerClientObservers();
	}
}

export class WorldInspectorPlugin implements Plugin {
	private readonly state = new WorldInspectorState();
	private readonly recorder = new WorldInspectorRecorderState();
	private readonly peerRecorder = new WorldInspectorPeerRecorderState();

	constructor(private readonly options: WorldInspectorPluginOptions = {}) {
		this.state.uiRoot = asRootNode(options.uiRoot);
	}

	build(app: App): void {
		registerRuntime(this.options.renderSchedule, this.options.networkSchedule);
		if (this.options.networkSchedule !== undefined) {
			new NetPlugin({
				schedule: this.options.networkSchedule,
				transport: this.options.networkTransport ?? new RemoteEventTransport(),
				boundary: this.options.networkBoundary,
			}).build(app);
		}
		app.insertResource(this.state);
		app.insertResource(this.recorder);
		if (this.options.networkSchedule !== undefined) {
			app.insertResource(this.peerRecorder);
			registerRecorderListeners(app, this.peerRecorder);
		}
		registerRecorderListeners(app, this.recorder);
	}

	render(world: World, state = this.state, recorder = this.recorder): void {
		renderWorldInspector(world, state, recorder);
	}
}

export class WorldInspectorServerPlugin implements Plugin {
	private readonly state: WorldInspectorServerState;

	constructor(private readonly options: WorldInspectorServerPluginOptions) {
		this.state = new WorldInspectorServerState(options.access);
	}

	build(app: App): void {
		registerWorldInspectorNetEvents();
		rovy.__resource(WorldInspectorServerState, "rovy/world-inspector/WorldInspectorServerState");
		registerServerObservers();
		rovy.__system(WorldInspectorServerRecordingStreamSystem, {
			id: "rovy/world-inspector/WorldInspectorServerRecordingStreamSystem",
			schedule: this.options.schedule,
			set: NetFlushSet,
			params: [
				{ kind: "world" },
				{ kind: "resMut", ctor: WorldInspectorServerState },
				{ kind: "external", id: NET_SERVER_PARAM },
				{ kind: "res", ctor: ScheduleContext },
			],
		});
		new NetPlugin({
			schedule: this.options.schedule,
			transport: this.options.networkTransport ?? new RemoteEventTransport(),
			boundary: this.options.networkBoundary,
		}).build(app);
		app.insertResource(this.state);
		registerRecorderListeners(app, this.state);
	}
}

export function renderWorldInspector(world: World, state: WorldInspectorState, recorder?: WorldInspectorRecorderState): void {
	if (state.uiRoot === undefined) return;
	rovyUi.start(state.uiRoot, () => {
		if (state.windowOpen) worldInspector({ world, state, recorder });
	});
}

function registerClientObservers(): void {
	rovy.__observer(WorldInspectorTargetListResponseObserver, {
		event: WorldInspectorTargetListResponse,
		priority: 0,
		params: [{ kind: "event" }, { kind: "resMut", ctor: WorldInspectorState }],
	});
	rovy.__observer(WorldInspectorSnapshotResponseObserver, {
		event: WorldInspectorSnapshotResponse,
		priority: 0,
		params: [{ kind: "event" }, { kind: "resMut", ctor: WorldInspectorState }],
	});
	rovy.__observer(WorldInspectorEditResponseObserver, {
		event: WorldInspectorEditResponse,
		priority: 0,
		params: [{ kind: "event" }, { kind: "resMut", ctor: WorldInspectorState }],
	});
	rovy.__observer(RecordingControlResponseObserver, {
		event: RecordingControlResponse,
		priority: 0,
		params: [{ kind: "event" }, { kind: "resMut", ctor: WorldInspectorRecorderState }],
	});
	rovy.__observer(RecordingFrameObserver, {
		event: RecordingFrame,
		priority: 0,
		params: [{ kind: "event" }, { kind: "resMut", ctor: WorldInspectorRecorderState }],
	});
	rovy.__observer(WorldInspectorPeerSnapshotRequestObserver, {
		event: WorldInspectorPeerSnapshotRequest,
		priority: 0,
		params: [{ kind: "event" }, { kind: "world" }, { kind: "external", id: NET_CLIENT_PARAM }],
	});
	rovy.__observer(WorldInspectorPeerEditRequestObserver, {
		event: WorldInspectorPeerEditRequest,
		priority: 0,
		params: [{ kind: "event" }, { kind: "world" }, { kind: "external", id: NET_CLIENT_PARAM }],
	});
	rovy.__observer(PeerRecordingControlRequestObserver, {
		event: PeerRecordingControlRequest,
		priority: 0,
		params: [
			{ kind: "event" },
			{ kind: "resMut", ctor: WorldInspectorPeerRecorderState },
			{ kind: "external", id: NET_CLIENT_PARAM },
			{ kind: "res", ctor: ScheduleContext },
		],
	});
}

function registerServerObservers(): void {
	rovy.__observer(WorldInspectorTargetListRequestObserver, {
		event: WorldInspectorTargetListRequest,
		priority: 0,
		params: [
			{ kind: "event" },
			{ kind: "external", id: NET_SERVER_PARAM },
			{ kind: "external", id: NET_EVENT_CONTEXT_PARAM },
			{ kind: "res", ctor: WorldInspectorServerState },
		],
	});
	rovy.__observer(WorldInspectorSnapshotRequestObserver, {
		event: WorldInspectorSnapshotRequest,
		priority: 0,
		params: [
			{ kind: "event" },
			{ kind: "world" },
			{ kind: "external", id: NET_SERVER_PARAM },
			{ kind: "external", id: NET_EVENT_CONTEXT_PARAM },
			{ kind: "resMut", ctor: WorldInspectorServerState },
		],
	});
	rovy.__observer(WorldInspectorEditRequestObserver, {
		event: WorldInspectorEditRequest,
		priority: 0,
		params: [
			{ kind: "event" },
			{ kind: "world" },
			{ kind: "external", id: NET_SERVER_PARAM },
			{ kind: "external", id: NET_EVENT_CONTEXT_PARAM },
			{ kind: "resMut", ctor: WorldInspectorServerState },
		],
	});
	rovy.__observer(WorldInspectorPeerSnapshotResponseObserver, {
		event: WorldInspectorPeerSnapshotResponse,
		priority: 0,
		params: [
			{ kind: "event" },
			{ kind: "external", id: NET_SERVER_PARAM },
			{ kind: "external", id: NET_EVENT_CONTEXT_PARAM },
			{ kind: "resMut", ctor: WorldInspectorServerState },
		],
	});
	rovy.__observer(WorldInspectorPeerEditResponseObserver, {
		event: WorldInspectorPeerEditResponse,
		priority: 0,
		params: [
			{ kind: "event" },
			{ kind: "external", id: NET_SERVER_PARAM },
			{ kind: "external", id: NET_EVENT_CONTEXT_PARAM },
			{ kind: "resMut", ctor: WorldInspectorServerState },
		],
	});
	rovy.__observer(RecordingControlRequestObserver, {
		event: RecordingControlRequest,
		priority: 0,
		params: [
			{ kind: "event" },
			{ kind: "external", id: NET_SERVER_PARAM },
			{ kind: "external", id: NET_EVENT_CONTEXT_PARAM },
			{ kind: "resMut", ctor: WorldInspectorServerState },
			{ kind: "res", ctor: ScheduleContext },
		],
	});
	rovy.__observer(PeerRecordingControlResponseObserver, {
		event: PeerRecordingControlResponse,
		priority: 0,
		params: [
			{ kind: "event" },
			{ kind: "external", id: NET_SERVER_PARAM },
			{ kind: "external", id: NET_EVENT_CONTEXT_PARAM },
			{ kind: "resMut", ctor: WorldInspectorServerState },
		],
	});
	rovy.__observer(PeerRecordingFrameObserver, {
		event: PeerRecordingFrame,
		priority: 0,
		params: [
			{ kind: "event" },
			{ kind: "external", id: NET_SERVER_PARAM },
			{ kind: "external", id: NET_EVENT_CONTEXT_PARAM },
			{ kind: "resMut", ctor: WorldInspectorServerState },
		],
	});
}

function getPlayers(): Player[] {
	const [ok, players] = pcall(() => game.GetService("Players"));
	return ok && players !== undefined ? players.GetPlayers() : [];
}

function findPlayerByUserId(userId: number): Player | undefined {
	for (const player of getPlayers()) {
		if (player.UserId === userId) return player;
	}
	return undefined;
}

function samePlayer(a: Player, b: Player): boolean {
	return a === b || a.UserId === b.UserId;
}

function recordingSessionKey(requesterUserId: number, sessionId: string): string {
	return `${tostring(requesterUserId)}:${sessionId}`;
}

function playerTargetKey(player: Player): string {
	return `player:${player.UserId}`;
}

function resolveRemoteTarget(targetKey: string): { kind: "server" } | { kind: "player"; userId: number } {
	if (targetKey === "server") return { kind: "server" };
	const idText = targetKey.gsub("^player:", "")[0];
	return { kind: "player", userId: tonumber(idText) ?? -1 };
}

function emptySnapshot(targetKey: string): WorldInspectorSnapshotDto {
	return { targetKey, entities: [], registeredComponents: [], resources: [] };
}

function retargetSnapshot(snapshot: WorldInspectorSnapshotDto, targetKey: string): WorldInspectorSnapshotDto {
	return {
		targetKey,
		entities: snapshot.entities,
		registeredComponents: snapshot.registeredComponents,
		resources: snapshot.resources,
	};
}
