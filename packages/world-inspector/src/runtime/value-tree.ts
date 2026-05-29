export interface WorldInspectorValueNodeDto {
	readonly key: string;
	readonly path: ReadonlyArray<string>;
	readonly typeLabel: string;
	readonly preview: string;
	readonly children?: ReadonlyArray<WorldInspectorValueNodeDto>;
	readonly truncated: boolean;
	readonly cycle: boolean;
}

export interface ValueTreeOptions {
	readonly maxDepth?: number;
	readonly maxChildren?: number;
	readonly rootKey?: string;
}

const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_CHILDREN = 50;

export function valueToText(value: unknown): string {
	if (value === undefined) return "";
	if (typeIs(value, "string")) return value;
	if (typeIs(value, "number") || typeIs(value, "boolean")) return tostring(value);
	if (typeIs(value, "Instance")) return value.GetFullName();
	if (typeIs(value, "Vector2")) return `Vector2(${tostring(value.X)}, ${tostring(value.Y)})`;
	if (typeIs(value, "Vector3")) return `Vector3(${tostring(value.X)}, ${tostring(value.Y)}, ${tostring(value.Z)})`;
	if (typeIs(value, "UDim")) return `UDim(${tostring(value.Scale)}, ${tostring(value.Offset)})`;
	if (typeIs(value, "UDim2")) {
		return `UDim2(${tostring(value.X.Scale)}, ${tostring(value.X.Offset)}, ${tostring(value.Y.Scale)}, ${tostring(value.Y.Offset)})`;
	}
	if (typeIs(value, "Color3")) return `Color3(${tostring(value.R)}, ${tostring(value.G)}, ${tostring(value.B)})`;
	if (typeIs(value, "CFrame")) {
		const [x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22] = value.GetComponents();
		return `CFrame(${tostring(x)}, ${tostring(y)}, ${tostring(z)}, ${tostring(r00)}, ${tostring(r01)}, ${tostring(r02)}, ${tostring(r10)}, ${tostring(r11)}, ${tostring(r12)}, ${tostring(r20)}, ${tostring(r21)}, ${tostring(r22)})`;
	}
	return tostring(value);
}

export function valueTypeLabel(value: unknown): string {
	if (value === undefined) return "unknown";
	if (typeIs(value, "string")) return "string";
	if (typeIs(value, "number")) return "number";
	if (typeIs(value, "boolean")) return "boolean";
	if (typeIs(value, "Instance")) return "Instance";
	const label = typeOf(value);
	return label !== undefined ? label : "unknown";
}

function countEntries(value: object): number {
	let count = 0;
	for (const [, _] of pairs(value as Record<never, unknown>)) count += 1;
	return count;
}

function tablePreview(value: object): string {
	const n = countEntries(value);
	return `{${tostring(n)} ${n === 1 ? "key" : "keys"}}`;
}

function buildNode(
	key: string,
	path: ReadonlyArray<string>,
	value: unknown,
	depth: number,
	maxDepth: number,
	maxChildren: number,
	seen: Set<object>,
): WorldInspectorValueNodeDto {
	const typeLabel = valueTypeLabel(value);
	// Roblox value types (Vector3, CFrame, …) are userdata, not tables, so they fall here as leaves.
	if (!typeIs(value, "table")) {
		return { key, path, typeLabel, preview: valueToText(value), truncated: false, cycle: false };
	}
	const obj = value as object;
	const preview = tablePreview(obj);
	if (seen.has(obj)) {
		return { key, path, typeLabel, preview, truncated: false, cycle: true };
	}
	if (depth >= maxDepth) {
		// nesting continues below the cap but is not expanded
		return { key, path, typeLabel, preview, truncated: true, cycle: false };
	}
	seen.add(obj);
	const children = new Array<WorldInspectorValueNodeDto>();
	let count = 0;
	let truncated = false;
	for (const [childKey, childValue] of pairs(obj as Record<never, unknown>)) {
		if (count >= maxChildren) {
			truncated = true;
			break;
		}
		const ck = tostring(childKey);
		children.push(buildNode(ck, [...path, ck], childValue, depth + 1, maxDepth, maxChildren, seen));
		count += 1;
	}
	// only guard cycles along the current path, not shared tables across sibling branches
	seen.delete(obj);
	return { key, path, typeLabel, preview, children, truncated, cycle: false };
}

/** Build a bounded, cycle-safe value tree rooted at `value`. */
export function buildValueTree(value: unknown, opts?: ValueTreeOptions): WorldInspectorValueNodeDto {
	const maxDepth = opts?.maxDepth ?? DEFAULT_MAX_DEPTH;
	const maxChildren = opts?.maxChildren ?? DEFAULT_MAX_CHILDREN;
	const rootKey = opts?.rootKey ?? "value";
	return buildNode(rootKey, [], value, 0, maxDepth, maxChildren, new Set<object>());
}

/** Top-level rows of a table value (the root's children), for resource/component listings. */
export function buildValueTreeRows(value: unknown, opts?: ValueTreeOptions): ReadonlyArray<WorldInspectorValueNodeDto> {
	return buildValueTree(value, opts).children ?? [];
}

/** Walk `rows` following `path` (relative keys) and return the node's children at that path. */
export function valueTreeRowsAtPath(
	rows: ReadonlyArray<WorldInspectorValueNodeDto>,
	path: ReadonlyArray<string>,
): ReadonlyArray<WorldInspectorValueNodeDto> {
	let current = rows;
	for (const segment of path) {
		let descended: ReadonlyArray<WorldInspectorValueNodeDto> | undefined;
		for (const node of current) {
			if (node.key === segment) {
				descended = node.children;
				break;
			}
		}
		if (descended === undefined) return [];
		current = descended;
	}
	return current;
}

/** True when a node represents an expandable table (has navigable children). */
export function isExpandable(node: WorldInspectorValueNodeDto): boolean {
	return node.children !== undefined && node.children.size() > 0;
}
