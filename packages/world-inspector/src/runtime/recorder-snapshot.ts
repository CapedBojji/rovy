import type { Entity, StableId } from "@rovy/core";
import type { WorldInspectorValueNodeDto } from "./value-tree";

export type ChangeKind = "add" | "change" | "remove";
export type RecordingControlCommand = "start" | "stop";

export interface EntityChangeTarget {
	readonly kind: "entity";
	readonly entity: Entity;
}

export interface ComponentChangeTarget {
	readonly kind: "component";
	readonly entity: Entity;
	readonly componentId: StableId;
	readonly componentName: string;
}

export interface ResourceChangeTarget {
	readonly kind: "resource";
	readonly resourceId: StableId;
	readonly resourceName: string;
	readonly path: string;
}

export interface RelationChangeTarget {
	readonly kind: "relation";
	readonly entity: Entity;
	readonly target: Entity;
	readonly relationName: string;
}

export type ChangeTarget = EntityChangeTarget | ComponentChangeTarget | ResourceChangeTarget | RelationChangeTarget;

export interface ChangeEntry {
	readonly tick: number;
	readonly kind: ChangeKind;
	readonly target: ChangeTarget;
	readonly oldTree?: WorldInspectorValueNodeDto;
	readonly newTree?: WorldInspectorValueNodeDto;
}

export interface FrameRecord {
	readonly frame: number;
	readonly relativeIndex: number;
	readonly tick: number;
	readonly entityChanges: number;
	readonly componentChanges: number;
	readonly resourceChanges: number;
	readonly relationChanges: number;
	readonly entries: ReadonlyArray<ChangeEntry>;
}

export function countByKind(entries: ReadonlyArray<ChangeEntry>): {
	entity: number;
	component: number;
	resource: number;
	relation: number;
} {
	let entity = 0;
	let component = 0;
	let resource = 0;
	let relation = 0;
	for (const entry of entries) {
		const kind = entry.target.kind;
		if (kind === "entity") entity += 1;
		else if (kind === "component") component += 1;
		else if (kind === "resource") resource += 1;
		else relation += 1;
	}
	return { entity, component, resource, relation };
}

function shortIdTail(id: StableId): string {
	const parts = id.split("/");
	return parts[parts.size() - 1] ?? id;
}

export function formatTarget(target: ChangeTarget): string {
	if (target.kind === "entity") {
		return `entity @${tostring(target.entity)}`;
	}
	if (target.kind === "component") {
		return `${target.componentName} @${tostring(target.entity)}`;
	}
	if (target.kind === "relation") {
		return `${target.relationName} @${tostring(target.entity)} → @${tostring(target.target)}`;
	}
	const tail = shortIdTail(target.resourceId);
	return target.path.size() === 0 ? tail : `${tail}.${target.path}`;
}
