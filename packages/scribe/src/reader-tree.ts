import {
	isScribeSchemaDescriptor,
} from "./schema";
import type {
	ScribeSaveInfo,
	ScribeSessionState,
	ScribeStatus,
} from "./types";
import type {
	AnyScribeData,
} from "./definitions";

type UnknownTable = Record<string | number, unknown>;
type NativeMethod = (...args: ReadonlyArray<unknown>) => unknown;

export type ScribeReaderBoundary = "client" | "server";

export interface ScribeReadRevisionSource {
	readonly revision: () => number;
}

export function createScribeReadTree(
	template: object,
	nativeRoot: object,
	revisions: ScribeReadRevisionSource,
	boundary: ScribeReaderBoundary,
): object {
	const tree: UnknownTable = {};
	const native = nativeRoot as UnknownTable;
	for (const [key, schema] of pairs(template as UnknownTable)) {
		if (boundary === "client" && visibilityOf(schema) === "serverOnly") {
			continue;
		}
		tree[key] = createReadNode(
			schema,
			nativeChild(native, key),
			revisions,
		);
	}
	return table.freeze(tree);
}

export class ScribeClientStateRuntime {
	ready = false;
	serviceStatus: ScribeStatus;
	saveInfo: ScribeSaveInfo = table.freeze({ dirty: false });

	constructor(
		readonly definition: AnyScribeData,
		private readonly native: object,
		private readonly statusFallback: () => ScribeStatus,
	) {
		this.serviceStatus = statusFallback();
		this.refresh();
	}

	refresh(): void {
		this.ready = callNative(this.native, "IsReady") as boolean;
		const method = (this.native as UnknownTable).GetServiceStatus;
		this.serviceStatus = typeIs(method, "function")
			? (method as () => ScribeStatus)()
			: this.statusFallback();
		this.saveInfo = this.ready
			? readClientSaveInfo(this.native)
			: table.freeze({ dirty: false });
	}
}

export class ScribeServerReaderRuntime {
	private readonly cached = new Map<object, {
		readonly native: object;
		readonly tree: object;
	}>();

	constructor(
		private readonly template: object,
		private readonly native: object,
		private readonly revisions: ScribeReadRevisionSource,
	) {}

	get(player: Player): object | undefined {
		if (this.state(player) !== "Ready") return undefined;
		const nativeTree = callNative(this.native, "Get", player);
		assert(
			typeIs(nativeTree, "table"),
			"[rovy/scribe] native Server.Get returned no accessor for a Ready profile",
		);
		const key = player as object;
		const previous = this.cached.get(key);
		if (previous !== undefined && previous.native === nativeTree) {
			return previous.tree;
		}
		const tree = createScribeReadTree(
			this.template,
			nativeTree,
			this.revisions,
			"server",
		);
		this.cached.set(key, { native: nativeTree, tree });
		return tree;
	}

	require(player: Player): object {
		const tree = this.get(player);
		assert(
			tree !== undefined,
			`[rovy/scribe] data for ${player.Name} is ${this.state(player)}; wait for ScribeReady`,
		);
		return tree;
	}

	state(player: Player): ScribeSessionState {
		const state = callNative(this.native, "GetState", player);
		assert(
			state === "Loading" ||
				state === "Ready" ||
				state === "SessionEnded",
			`[rovy/scribe] native Server.GetState returned invalid state '${tostring(state)}'`,
		);
		return state;
	}
}

export class ScribeSharedReaderRuntime {
	private readonly cache = new Map<number, {
		readonly revision: number;
		readonly value: object | undefined;
	}>();
	private readonly sharedKeys = new Array<string>();

	constructor(
		template: object,
		private readonly native: object,
		private readonly revisions: ScribeReadRevisionSource,
	) {
		for (const [key, schema] of pairs(template as UnknownTable)) {
			if (visibilityOf(schema) === "shared" && typeIs(key, "string")) {
				this.sharedKeys.push(key);
			}
		}
	}

	get(playerOrUserId: Player | number): object | undefined {
		const userId = typeIs(playerOrUserId, "Instance")
			? playerOrUserId.UserId
			: playerOrUserId;
		const revision = this.revisions.revision();
		const cached = this.cache.get(userId);
		if (cached !== undefined && cached.revision === revision) {
			return cached.value;
		}
		const nativeValue = callNative(
			this.native,
			"GetShared",
			playerOrUserId,
		);
		let value: object | undefined;
		if (nativeValue !== undefined) {
			assert(
				typeIs(nativeValue, "table"),
				"[rovy/scribe] native Client.GetShared returned a non-table value",
			);
			const projection: Record<string, unknown> = {};
			for (const key of this.sharedKeys) {
				const child = (nativeValue as UnknownTable)[key];
				if (child !== undefined) projection[key] = cloneValue(child);
			}
			value = freezeValue(projection) as object;
		}
		this.cache.set(userId, { revision, value });
		return value;
	}
}

function createReadNode(
	schema: unknown,
	nativeNode: object,
	revisions: ScribeReadRevisionSource,
): object {
	const node: UnknownTable = {};
	let cachedRevision = -1;
	let cachedValue: unknown;
	let defaultCached = false;
	let cachedDefault: unknown;

	const snapshot = (): unknown => {
		const revision = revisions.revision();
		if (revision !== cachedRevision) {
			cachedRevision = revision;
			cachedValue = cloneAndFreeze(callNative(nativeNode, "Clone"));
		}
		return cachedValue;
	};

	node.get = (_self?: unknown) => snapshot();
	node.clone = (_self?: unknown) => cloneValue(snapshot());
	node.default = (_self?: unknown) => {
		if (!defaultCached) {
			defaultCached = true;
			cachedDefault = cloneAndFreeze(callNative(nativeNode, "Default"));
		}
		return cachedDefault;
	};

	const unwrapped = unwrapSchema(schema);
	if (
		isScribeSchemaDescriptor(unwrapped) &&
		unwrapped.kind === "timed"
	) {
		let activeRevision = -1;
		let activeValue: object;
		node.active = (_self?: unknown) => {
			const revision = revisions.revision();
			if (revision !== activeRevision) {
				activeRevision = revision;
				const [active, remaining] = callNativeTuple(
					nativeNode,
					"Active",
				);
				activeValue = table.freeze(
					remaining === undefined
						? { active: active as boolean }
						: {
								active: active as boolean,
								remaining: remaining as number,
							},
				);
			}
			return activeValue;
		};
		return table.freeze(node);
	}

	if (isNumberSchema(unwrapped)) {
		node.min = (_self?: unknown) => callNative(nativeNode, "Min");
		node.max = (_self?: unknown) => callNative(nativeNode, "Max");
	}

	if (
		isScribeSchemaDescriptor(unwrapped) &&
		unwrapped.kind === "array"
	) {
		const children = new Map<number, object>();
		node.at = (selfOrIndex: unknown, maybeIndex?: unknown) => {
			const index = methodArgument(node, selfOrIndex, maybeIndex);
			assertArrayIndex(index);
			if ((index as number) >= arrayCount(snapshot())) return undefined;
			let child = children.get(index as number);
			if (child === undefined) {
				child = createReadNode(
					unwrapped.element,
					nativeChild(
						nativeNode as UnknownTable,
						(index as number) + 1,
					),
					revisions,
				);
				children.set(index as number, child);
			}
			return child;
		};
		node.count = (_self?: unknown) => arrayCount(snapshot());
		node.find = (selfOrValue: unknown, maybeValue?: unknown) => {
			const value = methodArgument(node, selfOrValue, maybeValue);
			return findArrayValue(snapshot(), value);
		};
		node.has = (selfOrValue: unknown, maybeValue?: unknown) =>
			findArrayValue(
				snapshot(),
				methodArgument(node, selfOrValue, maybeValue),
			) !== undefined;
		return table.freeze(node);
	}

	if (
		isScribeSchemaDescriptor(unwrapped) &&
		unwrapped.kind === "dictionary"
	) {
		const children = new Map<string, object>();
		node.at = (selfOrKey: unknown, maybeKey?: unknown) => {
			const key = methodArgument(node, selfOrKey, maybeKey);
			assert(
				typeIs(key, "string"),
				"[rovy/scribe] dictionary at(key) requires a string",
			);
			let child = children.get(key);
			if (child === undefined) {
				child = createReadNode(
					unwrapped.element,
					nativeChild(nativeNode as UnknownTable, key),
					revisions,
				);
				children.set(key, child);
			}
			return child;
		};
		node.count = (_self?: unknown) => tableCount(snapshot());
		return table.freeze(node);
	}

	if (isScribeSchemaDescriptor(unwrapped)) return table.freeze(node);

	if (isPlainArray(unwrapped)) {
		const element = (unwrapped as ReadonlyArray<unknown>)[0];
		const children = new Map<number, object>();
		node.at = (selfOrIndex: unknown, maybeIndex?: unknown) => {
			const index = methodArgument(node, selfOrIndex, maybeIndex);
			assertArrayIndex(index);
			if ((index as number) >= arrayCount(snapshot())) return undefined;
			let child = children.get(index as number);
			if (child === undefined) {
				child = createReadNode(
					element,
					nativeChild(
						nativeNode as UnknownTable,
						(index as number) + 1,
					),
					revisions,
				);
				children.set(index as number, child);
			}
			return child;
		};
		node.count = (_self?: unknown) => arrayCount(snapshot());
		node.find = (selfOrValue: unknown, maybeValue?: unknown) =>
			findArrayValue(
				snapshot(),
				methodArgument(node, selfOrValue, maybeValue),
			);
		node.has = (selfOrValue: unknown, maybeValue?: unknown) =>
			findArrayValue(
				snapshot(),
				methodArgument(node, selfOrValue, maybeValue),
			) !== undefined;
		return table.freeze(node);
	}

	if (typeIs(unwrapped, "table")) {
		for (const [key, childSchema] of pairs(unwrapped as UnknownTable)) {
			node[key] = createReadNode(
				childSchema,
				nativeChild(nativeNode as UnknownTable, key),
				revisions,
			);
		}
	}
	return table.freeze(node);
}

function nativeChild(native: UnknownTable, key: string | number): object {
	const child = native[key];
	assert(
		typeIs(child, "table"),
		`[rovy/scribe] native accessor is missing declared child '${tostring(key)}'`,
	);
	return child;
}

function callNative(
	node: object,
	name: string,
	...args: ReadonlyArray<unknown>
): unknown {
	const method = (node as UnknownTable)[name];
	assert(
		typeIs(method, "function"),
		`[rovy/scribe] native accessor does not expose ${name}`,
	);
	return (method as NativeMethod)(...args);
}

function callNativeTuple(
	node: object,
	name: string,
): LuaTuple<[unknown, unknown?]> {
	const method = (node as UnknownTable)[name];
	assert(
		typeIs(method, "function"),
		`[rovy/scribe] native accessor does not expose ${name}`,
	);
	return (method as () => LuaTuple<[unknown, unknown?]>)();
}

function readClientSaveInfo(native: object): ScribeSaveInfo {
	const method = (native as UnknownTable).GetSaveInfo;
	if (!typeIs(method, "function")) {
		return table.freeze({ dirty: false });
	}
	const [ok, raw] = pcall(() => (method as () => unknown)());
	if (!ok || !typeIs(raw, "table")) {
		return table.freeze({ dirty: false });
	}
	const info = raw as UnknownTable;
	return table.freeze({
		lastSaveAt: typeIs(info.LastSaveAt, "number")
			? info.LastSaveAt
			: undefined,
		lastResult:
			info.LastResult === "Ok" || info.LastResult === "Fail"
				? info.LastResult
				: undefined,
		dirty: info.Dirty === true,
		size: typeIs(info.Size, "number") ? info.Size : undefined,
	});
}

function methodArgument(
	node: object,
	selfOrValue: unknown,
	maybeValue: unknown,
): unknown {
	return selfOrValue === node ? maybeValue : selfOrValue;
}

function visibilityOf(schema: unknown): string | undefined {
	return isScribeSchemaDescriptor(schema) &&
		schema.kind === "visibility"
		? schema.visibility
		: undefined;
}

function unwrapSchema(schema: unknown): unknown {
	let current = schema;
	while (
		isScribeSchemaDescriptor(current) &&
		(current.kind === "visibility" || current.kind === "optional")
	) {
		current = current.inner;
	}
	return current;
}

function isNumberSchema(schema: unknown): boolean {
	return typeIs(schema, "number") ||
		(isScribeSchemaDescriptor(schema) && schema.kind === "number");
}

function cloneAndFreeze(value: unknown): unknown {
	return freezeValue(cloneValue(value));
}

export function cloneScribeValue(value: unknown): unknown {
	return cloneValue(value);
}

export function freezeScribeValue(value: unknown): unknown {
	return freezeValue(value);
}

function cloneValue(value: unknown): unknown {
	if (typeIs(value, "buffer")) return cloneBuffer(value);
	if (!typeIs(value, "table")) return value;
	const output: UnknownTable = {};
	for (const [key, child] of pairs(value as UnknownTable)) {
		output[key] = cloneValue(child);
	}
	return output;
}

function cloneBuffer(value: buffer): buffer {
	const output = buffer.create(buffer.len(value));
	buffer.copy(output, 0, value);
	return output;
}

function freezeValue(value: unknown): unknown {
	if (!typeIs(value, "table")) return value;
	for (const [, child] of pairs(value as UnknownTable)) {
		freezeValue(child);
	}
	return table.freeze(value);
}

function isPlainArray(value: unknown): boolean {
	if (!typeIs(value, "table") || isScribeSchemaDescriptor(value)) return false;
	let count = 0;
	let maximum = 0;
	for (const [key] of pairs(value as UnknownTable)) {
		if (
			!typeIs(key, "number") ||
			key < 1 ||
			key % 1 !== 0
		) {
			return false;
		}
		count += 1;
		if (key > maximum) maximum = key;
	}
	return count === maximum;
}

function assertArrayIndex(index: unknown): void {
	assert(
		typeIs(index, "number") &&
			index >= 0 &&
			index % 1 === 0,
		"[rovy/scribe] array at(index) requires a non-negative integer",
	);
}

function arrayCount(value: unknown): number {
	if (!typeIs(value, "table")) return 0;
	let count = 0;
	while ((value as UnknownTable)[count + 1] !== undefined) count += 1;
	return count;
}

function tableCount(value: unknown): number {
	if (!typeIs(value, "table")) return 0;
	let count = 0;
	for (const [_key] of pairs(value as UnknownTable)) count += 1;
	return count;
}

function findArrayValue(
	value: unknown,
	target: unknown,
): number | undefined {
	const count = arrayCount(value);
	for (let index = 0; index < count; index += 1) {
		if (
			deepEqual(
				(value as UnknownTable)[index + 1],
				target,
			)
		) {
			return index;
		}
	}
	return undefined;
}

function deepEqual(left: unknown, right: unknown): boolean {
	if (left === right) return true;
	if (!typeIs(left, "table") || !typeIs(right, "table")) return false;
	for (const [key, value] of pairs(left as UnknownTable)) {
		if (!deepEqual(value, (right as UnknownTable)[key])) return false;
	}
	for (const [key] of pairs(right as UnknownTable)) {
		if ((left as UnknownTable)[key] === undefined) return false;
	}
	return true;
}
