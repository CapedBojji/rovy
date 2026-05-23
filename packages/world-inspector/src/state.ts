import type { Node } from "@rovy/ui";
import type {
	WorldInspectorEditDto,
	WorldInspectorSnapshotDto,
	WorldInspectorTargetChoice,
} from "./runtime/target";

export interface WorldInspectorEntityWindowState {
	targetKey: string;
	entityId: number;
	position?: Vector2;
	size?: Vector2;
}

export class WorldInspectorState {
	visible = false;
	windowOpen = false;
	openEntityWindows = new Map<string, WorldInspectorEntityWindowState>();
	liveUpdate = new Map<string, boolean>();
	selectedTargetKey = "local";
	query = "";
	position?: Vector2;
	size?: Vector2;
	drafts = new Map<string, unknown>();
	actionErrors = new Map<string, string>();
	uiRoot?: Node;
	componentPicker = "";
	error?: string;
	remoteTargets = new Array<WorldInspectorTargetChoice>();
	snapshots = new Map<string, WorldInspectorSnapshotDto>();
	lastSnapshotAt = 0;
	snapshotIntervalSec = 0.5;
	private requestId = 0;
	private targetListQueued = false;
	private readonly snapshotQueue = new Array<{ requestId: string; targetKey: string }>();
	private readonly editQueue = new Array<{ requestId: string; targetKey: string; edit: WorldInspectorEditDto }>();

	show(): void {
		this.visible = true;
		this.windowOpen = true;
		this.queueTargetList();
	}

	hide(): void {
		this.visible = false;
	}

	toggle(): void {
		if (this.visible) this.hide();
		else this.show();
	}

	closeWindow(): void {
		this.visible = false;
		this.windowOpen = false;
		this.openEntityWindows.clear();
		this.liveUpdate.clear();
		this.selectedTargetKey = "local";
		this.query = "";
		this.componentPicker = "";
		this.error = undefined;
		this.drafts.clear();
		this.actionErrors.clear();
	}

	entityWindowKey(targetKey: string, entityId: number): string {
		return `${targetKey}:${tostring(entityId)}`;
	}

	openEntityWindow(targetKey: string, entityId: number): void {
		const key = this.entityWindowKey(targetKey, entityId);
		if (!this.openEntityWindows.has(key)) this.openEntityWindows.set(key, { targetKey, entityId });
		if (!this.liveUpdate.has(key)) this.liveUpdate.set(key, true);
	}

	closeEntityWindow(targetKey: string, entityId: number): void {
		const key = this.entityWindowKey(targetKey, entityId);
		this.openEntityWindows.delete(key);
		this.liveUpdate.delete(key);
	}

	nextRequestId(): string {
		this.requestId += 1;
		return `wi-${this.requestId}`;
	}

	queueTargetList(): void {
		this.targetListQueued = true;
	}

	consumeTargetListRequest(): string | undefined {
		if (!this.targetListQueued) return undefined;
		this.targetListQueued = false;
		return this.nextRequestId();
	}

	queueSnapshot(targetKey = this.selectedTargetKey): void {
		if (targetKey === "local") return;
		this.snapshotQueue.push({ requestId: this.nextRequestId(), targetKey });
	}

	consumeSnapshotRequests(): Array<{ requestId: string; targetKey: string }> {
		const out = [...this.snapshotQueue];
		this.snapshotQueue.clear();
		return out;
	}

	queueEdit(targetKey: string, edit: WorldInspectorEditDto): void {
		if (targetKey === "local") return;
		this.editQueue.push({ requestId: this.nextRequestId(), targetKey, edit });
	}

	consumeEditRequests(): Array<{ requestId: string; targetKey: string; edit: WorldInspectorEditDto }> {
		const out = [...this.editQueue];
		this.editQueue.clear();
		return out;
	}

	receiveTargets(targets: ReadonlyArray<WorldInspectorTargetChoice>, message?: string): void {
		this.remoteTargets = [...targets];
		if (message !== undefined) this.error = message;
	}

	receiveSnapshot(snapshot: WorldInspectorSnapshotDto, message?: string): void {
		this.snapshots.set(snapshot.targetKey, snapshot);
		if (message !== undefined) this.error = message;
		else this.error = undefined;
	}

	setActionError(scope: string, message?: string): void {
		if (message === undefined || message.size() === 0) this.actionErrors.delete(scope);
		else this.actionErrors.set(scope, message);
	}
}
