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

export type WorldInspectorMainTab = "entities" | "resources" | "frames";

/** Identifies which value tree a table explorer window navigates. */
export type WorldInspectorExplorerSource =
	| { readonly kind: "resource"; readonly resourceId: string }
	| { readonly kind: "frame"; readonly frameIndex: number; readonly entryIndex: number; readonly side: "old" | "new" };

export interface WorldInspectorTableExplorerState {
	readonly title: string;
	readonly source: WorldInspectorExplorerSource;
	path?: ReadonlyArray<string>;
}

export class WorldInspectorState {
	visible = false;
	windowOpen = false;
	openEntityWindows = new Map<string, WorldInspectorEntityWindowState>();
	liveUpdate = new Map<string, boolean>();
	selectedTargetKey = "local";
	activeTab: WorldInspectorMainTab = "entities";
	query = "";
	resourceQuery = "";
	tableExplorers = new Map<string, WorldInspectorTableExplorerState>();
	position?: Vector2;
	size?: Vector2;
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
	private readonly drafts = new Map<string, unknown>();
	private readonly draftRevisions = new Map<string, number>();
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
		this.activeTab = "entities";
		this.query = "";
		this.resourceQuery = "";
		this.tableExplorers.clear();
		this.componentPicker = "";
		this.error = undefined;
		this.clearDrafts();
		this.actionErrors.clear();
	}

	openTableExplorer(key: string, title: string, source: WorldInspectorExplorerSource, path: ReadonlyArray<string> = []): void {
		const existing = this.tableExplorers.get(key);
		if (existing !== undefined) {
			existing.path = path;
			return;
		}
		this.tableExplorers.set(key, { title, source, path });
	}

	closeTableExplorer(key: string): void {
		this.tableExplorers.delete(key);
	}

	hasDraft(key: string): boolean {
		return this.drafts.has(key);
	}

	getDraft(key: string): unknown {
		return this.drafts.get(key);
	}

	getDraftRevision(key: string): number | undefined {
		return this.draftRevisions.get(key);
	}

	setDraft(key: string, value: unknown, revision?: number): void {
		this.drafts.set(key, value);
		if (revision === undefined) this.draftRevisions.delete(key);
		else this.draftRevisions.set(key, revision);
	}

	clearDraft(key: string): void {
		this.drafts.delete(key);
		this.draftRevisions.delete(key);
	}

	clearDrafts(): void {
		this.drafts.clear();
		this.draftRevisions.clear();
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
