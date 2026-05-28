import type { Entity, StableId } from "@rovy/core";

export type ChangeKind = "add" | "change" | "remove";

export interface ComponentChangeTarget {
	readonly kind: "component";
	readonly entity: Entity;
	readonly componentId: StableId;
	readonly componentName: string;
}

export interface ResourceChangeTarget {
	readonly kind: "resource";
	readonly resourceId: StableId;
	readonly path: string;
}

export type ChangeTarget = ComponentChangeTarget | ResourceChangeTarget;

export interface ChangeEntry {
	readonly tick: number;
	readonly kind: ChangeKind;
	readonly target: ChangeTarget;
	readonly oldText?: string;
	readonly newText?: string;
}

export interface FrameRecord {
	readonly frame: number;
	readonly relativeIndex: number;
	readonly tick: number;
	readonly componentChanges: number;
	readonly resourceChanges: number;
	readonly entries: ReadonlyArray<ChangeEntry>;
}

export const INSPECT_DEPTH = 4;

const SENTINEL_DEEP = "<deep>";
const SENTINEL_CYCLE = "<cycle>";

export function deepClone(value: unknown, depth: number, seen?: Set<object>): unknown {
	if (value === undefined) return undefined;
	if (!typeIs(value, "table")) return value;
	if (depth <= 0) return SENTINEL_DEEP;
	const tracker = seen ?? new Set<object>();
	if (tracker.has(value as object)) return SENTINEL_CYCLE;
	tracker.add(value as object);
	const out = new Map<unknown, unknown>();
	for (const [k, v] of value as unknown as Map<unknown, unknown>) {
		out.set(k, deepClone(v, depth - 1, tracker));
	}
	tracker.delete(value as object);
	return out;
}

export function valueToText(value: unknown): string {
	if (value === undefined) return "nil";
	if (typeIs(value, "string")) return `"${value}"`;
	if (typeIs(value, "number") || typeIs(value, "boolean")) return tostring(value);
	if (value === SENTINEL_DEEP || value === SENTINEL_CYCLE) return value as string;
	if (typeIs(value, "table")) {
		const parts = new Array<string>();
		let count = 0;
		for (const [k, v] of value as unknown as Map<unknown, unknown>) {
			if (count >= 6) {
				parts.push("…");
				break;
			}
			parts.push(`${tostring(k)}=${shortText(v)}`);
			count += 1;
		}
		return `{${parts.join(", ")}}`;
	}
	return tostring(value);
}

function shortText(value: unknown): string {
	if (typeIs(value, "table")) return "{…}";
	if (typeIs(value, "string")) return `"${value}"`;
	return tostring(value);
}

function equalValues(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (a === undefined || b === undefined) return false;
	if (typeIs(a, "table") && typeIs(b, "table")) {
		const am = a as unknown as Map<unknown, unknown>;
		const bm = b as unknown as Map<unknown, unknown>;
		const seenKeys = new Set<unknown>();
		for (const [k, v] of am) {
			if (!equalValues(v, bm.get(k))) return false;
			seenKeys.add(k);
		}
		for (const [k] of bm) {
			if (!seenKeys.has(k)) return false;
		}
		return true;
	}
	return false;
}

export function snapshotEqual(a: unknown, b: unknown): boolean {
	return equalValues(a, b);
}

function joinPath(prefix: string, key: unknown): string {
	const keyText = typeIs(key, "string") ? key : `[${tostring(key)}]`;
	if (prefix.size() === 0) return keyText;
	return typeIs(key, "string") ? `${prefix}.${keyText}` : `${prefix}${keyText}`;
}

export function diffSnapshots(
	prior: unknown,
	nextValue: unknown,
	pathPrefix: string,
	out: Array<ChangeEntry>,
	tick: number,
	target: (path: string) => ChangeTarget,
	depth: number,
	exclude?: ReadonlyArray<string>,
): void {
	if (equalValues(prior, nextValue)) return;
	if (depth <= 0 || !typeIs(prior, "table") || !typeIs(nextValue, "table")) {
		out.push({
			tick,
			kind: prior === undefined ? "add" : nextValue === undefined ? "remove" : "change",
			target: target(pathPrefix),
			oldText: prior === undefined ? undefined : valueToText(prior),
			newText: nextValue === undefined ? undefined : valueToText(nextValue),
		});
		return;
	}
	const priorMap = prior as unknown as Map<unknown, unknown>;
	const nextMap = nextValue as unknown as Map<unknown, unknown>;
	const excludeSet = new Set<string>();
	if (exclude !== undefined && pathPrefix.size() === 0) {
		for (const key of exclude) excludeSet.add(key);
	}
	const seenKeys = new Set<unknown>();
	for (const [k, priorVal] of priorMap) {
		if (typeIs(k, "string") && excludeSet.has(k)) {
			seenKeys.add(k);
			continue;
		}
		seenKeys.add(k);
		const nextVal = nextMap.get(k);
		if (nextVal === undefined && !nextMap.has(k)) {
			out.push({
				tick,
				kind: "remove",
				target: target(joinPath(pathPrefix, k)),
				oldText: valueToText(priorVal),
			});
		} else if (!equalValues(priorVal, nextVal)) {
			if (typeIs(priorVal, "table") && typeIs(nextVal, "table") && depth > 1) {
				diffSnapshots(priorVal, nextVal, joinPath(pathPrefix, k), out, tick, target, depth - 1);
			} else {
				out.push({
					tick,
					kind: "change",
					target: target(joinPath(pathPrefix, k)),
					oldText: valueToText(priorVal),
					newText: valueToText(nextVal),
				});
			}
		}
	}
	for (const [k, nextVal] of nextMap) {
		if (seenKeys.has(k)) continue;
		if (typeIs(k, "string") && excludeSet.has(k)) continue;
		out.push({
			tick,
			kind: "add",
			target: target(joinPath(pathPrefix, k)),
			newText: valueToText(nextVal),
		});
	}
}

export function formatTarget(target: ChangeTarget): string {
	if (target.kind === "component") {
		return `${target.componentName} @${tostring(target.entity)}`;
	}
	const tail = shortIdTail(target.resourceId);
	return target.path.size() === 0 ? tail : `${tail}.${target.path}`;
}

function shortIdTail(id: StableId): string {
	const parts = id.split("/");
	return parts[parts.size() - 1] ?? id;
}
