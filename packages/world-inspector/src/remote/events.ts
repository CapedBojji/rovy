import { rovy } from "@rovy/core";
import { rovyNet } from "@rovy/networking";
import type {
	WorldInspectorEditDto,
	WorldInspectorSnapshotDto,
	WorldInspectorTargetChoice,
} from "../runtime/target";
import type { FrameRecord, RecordingControlCommand } from "../runtime/recorder-snapshot";

export class WorldInspectorTargetListRequest {
	constructor(readonly requestId: string) {}
}

export class WorldInspectorTargetListResponse {
	constructor(
		readonly requestId: string,
		readonly targets: ReadonlyArray<WorldInspectorTargetChoice>,
		readonly message?: string,
	) {}
}

export class WorldInspectorSnapshotRequest {
	constructor(
		readonly requestId: string,
		readonly targetKey: string,
	) {}
}

export class WorldInspectorSnapshotResponse {
	constructor(
		readonly requestId: string,
		readonly snapshot: WorldInspectorSnapshotDto,
		readonly message?: string,
	) {}
}

export class WorldInspectorEditRequest {
	constructor(
		readonly requestId: string,
		readonly targetKey: string,
		readonly edit: WorldInspectorEditDto,
	) {}
}

export class WorldInspectorEditResponse {
	constructor(
		readonly requestId: string,
		readonly targetKey: string,
		readonly ok: boolean,
		readonly snapshot: WorldInspectorSnapshotDto,
		readonly message?: string,
		readonly spawnedEntityId?: number,
	) {}
}

export class WorldInspectorPeerSnapshotRequest {
	constructor(
		readonly requestId: string,
		readonly requesterUserId: number,
	) {}
}

export class WorldInspectorPeerSnapshotResponse {
	constructor(
		readonly requestId: string,
		readonly requesterUserId: number,
		readonly snapshot: WorldInspectorSnapshotDto,
		readonly message?: string,
	) {}
}

export class WorldInspectorPeerEditRequest {
	constructor(
		readonly requestId: string,
		readonly requesterUserId: number,
		readonly edit: WorldInspectorEditDto,
	) {}
}

export class WorldInspectorPeerEditResponse {
	constructor(
		readonly requestId: string,
		readonly requesterUserId: number,
		readonly ok: boolean,
		readonly snapshot: WorldInspectorSnapshotDto,
		readonly message?: string,
		readonly spawnedEntityId?: number,
	) {}
}

export class RecordingControlRequest {
	constructor(
		readonly requestId: string,
		readonly sessionId: string,
		readonly targetKey: string,
		readonly command: RecordingControlCommand,
		readonly maxFrames: number,
	) {}
}

export class RecordingControlResponse {
	constructor(
		readonly requestId: string,
		readonly sessionId: string,
		readonly targetKey: string,
		readonly ok: boolean,
		readonly command: RecordingControlCommand,
		readonly message?: string,
	) {}
}

export class RecordingFrame {
	constructor(
		readonly sessionId: string,
		readonly targetKey: string,
		readonly frame: FrameRecord,
	) {}
}

export class PeerRecordingControlRequest {
	constructor(
		readonly requestId: string,
		readonly sessionId: string,
		readonly requesterUserId: number,
		readonly command: RecordingControlCommand,
		readonly maxFrames: number,
	) {}
}

export class PeerRecordingControlResponse {
	constructor(
		readonly requestId: string,
		readonly sessionId: string,
		readonly requesterUserId: number,
		readonly ok: boolean,
		readonly command: RecordingControlCommand,
		readonly message?: string,
	) {}
}

export class PeerRecordingFrame {
	constructor(
		readonly sessionId: string,
		readonly requesterUserId: number,
		readonly frame: FrameRecord,
	) {}
}

const registrations = [
	{
		ctor: WorldInspectorTargetListRequest,
		id: "@rovy/world-inspector/TargetListRequest",
		name: "WorldInspectorTargetListRequest",
		direction: "clientToServer" as const,
		fields: ["requestId"],
	},
	{
		ctor: WorldInspectorTargetListResponse,
		id: "@rovy/world-inspector/TargetListResponse",
		name: "WorldInspectorTargetListResponse",
		direction: "serverToClient" as const,
		fields: ["requestId", "targets", "message"],
	},
	{
		ctor: WorldInspectorSnapshotRequest,
		id: "@rovy/world-inspector/SnapshotRequest",
		name: "WorldInspectorSnapshotRequest",
		direction: "clientToServer" as const,
		fields: ["requestId", "targetKey"],
	},
	{
		ctor: WorldInspectorSnapshotResponse,
		id: "@rovy/world-inspector/SnapshotResponse",
		name: "WorldInspectorSnapshotResponse",
		direction: "serverToClient" as const,
		fields: ["requestId", "snapshot", "message"],
	},
	{
		ctor: WorldInspectorEditRequest,
		id: "@rovy/world-inspector/EditRequest",
		name: "WorldInspectorEditRequest",
		direction: "clientToServer" as const,
		fields: ["requestId", "targetKey", "edit"],
	},
	{
		ctor: WorldInspectorEditResponse,
		id: "@rovy/world-inspector/EditResponse",
		name: "WorldInspectorEditResponse",
		direction: "serverToClient" as const,
		fields: ["requestId", "targetKey", "ok", "snapshot", "message", "spawnedEntityId"],
	},
	{
		ctor: WorldInspectorPeerSnapshotRequest,
		id: "@rovy/world-inspector/PeerSnapshotRequest",
		name: "WorldInspectorPeerSnapshotRequest",
		direction: "serverToClient" as const,
		fields: ["requestId", "requesterUserId"],
	},
	{
		ctor: WorldInspectorPeerSnapshotResponse,
		id: "@rovy/world-inspector/PeerSnapshotResponse",
		name: "WorldInspectorPeerSnapshotResponse",
		direction: "clientToServer" as const,
		fields: ["requestId", "requesterUserId", "snapshot", "message"],
	},
	{
		ctor: WorldInspectorPeerEditRequest,
		id: "@rovy/world-inspector/PeerEditRequest",
		name: "WorldInspectorPeerEditRequest",
		direction: "serverToClient" as const,
		fields: ["requestId", "requesterUserId", "edit"],
	},
	{
		ctor: WorldInspectorPeerEditResponse,
		id: "@rovy/world-inspector/PeerEditResponse",
		name: "WorldInspectorPeerEditResponse",
		direction: "clientToServer" as const,
		fields: ["requestId", "requesterUserId", "ok", "snapshot", "message", "spawnedEntityId"],
	},
	{
		ctor: RecordingControlRequest,
		id: "@rovy/world-inspector/RecordingControlRequest",
		name: "RecordingControlRequest",
		direction: "clientToServer" as const,
		fields: ["requestId", "sessionId", "targetKey", "command", "maxFrames"],
	},
	{
		ctor: RecordingControlResponse,
		id: "@rovy/world-inspector/RecordingControlResponse",
		name: "RecordingControlResponse",
		direction: "serverToClient" as const,
		fields: ["requestId", "sessionId", "targetKey", "ok", "command", "message"],
	},
	{
		ctor: RecordingFrame,
		id: "@rovy/world-inspector/RecordingFrame",
		name: "RecordingFrame",
		direction: "serverToClient" as const,
		fields: ["sessionId", "targetKey", "frame"],
	},
	{
		ctor: PeerRecordingControlRequest,
		id: "@rovy/world-inspector/PeerRecordingControlRequest",
		name: "PeerRecordingControlRequest",
		direction: "serverToClient" as const,
		fields: ["requestId", "sessionId", "requesterUserId", "command", "maxFrames"],
	},
	{
		ctor: PeerRecordingControlResponse,
		id: "@rovy/world-inspector/PeerRecordingControlResponse",
		name: "PeerRecordingControlResponse",
		direction: "clientToServer" as const,
		fields: ["requestId", "sessionId", "requesterUserId", "ok", "command", "message"],
	},
	{
		ctor: PeerRecordingFrame,
		id: "@rovy/world-inspector/PeerRecordingFrame",
		name: "PeerRecordingFrame",
		direction: "clientToServer" as const,
		fields: ["sessionId", "requesterUserId", "frame"],
	},
];

export function registerWorldInspectorNetEvents(): void {
	for (const reg of registrations) {
		if (rovyNet.byCtor(reg.ctor) === undefined) {
			rovyNet.__netEvent(reg.ctor, {
				id: reg.id,
				name: reg.name,
				direction: reg.direction,
				channel: "reliable",
				receive: "trigger",
				fields: reg.fields,
			});
		}
		rovy.__event(reg.ctor);
	}
}
