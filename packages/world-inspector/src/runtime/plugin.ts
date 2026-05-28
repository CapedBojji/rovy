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
	WorldInspectorRecorderState,
} from "./recorder";
import { recorderDetail } from "../widgets/recorder-detail";
import { recorderResult } from "../widgets/recorder-result";
import { __scope, useKey } from "@rovy/ui";
import {
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
	run(state: WorldInspectorState, client: NetClient): void {
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

export class WorldInspectorServerState {
	readonly pendingPeer = new Map<string, { requester: Player; target: Player; targetKey: string; action: "view" | "edit" }>();

	constructor(readonly access?: (ctx: WorldInspectorAccessContext) => boolean) {}

	can(ctx: WorldInspectorAccessContext): boolean {
		return this.access?.(ctx) === true;
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
			params: [{ kind: "resMut", ctor: WorldInspectorState }, { kind: "external", id: NET_CLIENT_PARAM }],
		});
		registerClientObservers();
	}
}

export class WorldInspectorPlugin implements Plugin {
	private readonly state = new WorldInspectorState();
	private readonly recorder = new WorldInspectorRecorderState();

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
		new NetPlugin({
			schedule: this.options.schedule,
			transport: this.options.networkTransport ?? new RemoteEventTransport(),
			boundary: this.options.networkBoundary,
		}).build(app);
		app.insertResource(this.state);
	}
}

export function renderWorldInspector(world: World, state: WorldInspectorState, recorder?: WorldInspectorRecorderState): void {
	if (state.uiRoot === undefined) return;
	rovyUi.start(state.uiRoot, () => {
		if (state.windowOpen) worldInspector({ world, state, recorder });
		if (recorder !== undefined) {
			if (recorder.resultWindowOpen) recorderResult(recorder);
			const openIndices = new Array<number>();
			for (const idx of recorder.openDetailFrames) openIndices.push(idx);
			for (const idx of openIndices) {
				__scope("world-inspector:recorder-detail", () => {
					useKey(tostring(idx));
					recorderDetail(recorder, idx);
				});
			}
		}
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

function playerTargetKey(player: Player): string {
	return `player:${player.UserId}`;
}

function resolveRemoteTarget(targetKey: string): { kind: "server" } | { kind: "player"; userId: number } {
	if (targetKey === "server") return { kind: "server" };
	const idText = targetKey.gsub("^player:", "")[0];
	return { kind: "player", userId: tonumber(idText) ?? -1 };
}

function emptySnapshot(targetKey: string): WorldInspectorSnapshotDto {
	return { targetKey, entities: [], registeredComponents: [] };
}

function retargetSnapshot(snapshot: WorldInspectorSnapshotDto, targetKey: string): WorldInspectorSnapshotDto {
	return {
		targetKey,
		entities: snapshot.entities,
		registeredComponents: snapshot.registeredComponents,
	};
}
