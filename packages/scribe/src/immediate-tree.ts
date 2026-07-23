import {
	isScribeSchemaDescriptor,
	type ScribeRuntimeSchemaDescriptor,
} from "./schema";
import type { ScribeNativeModule, ScribeEconomyMeta } from "./types";

type UnknownTable = Record<string | number, unknown>;
type NativeMethod = (...args: ReadonlyArray<unknown>) => unknown;

interface ValueLocation {
	readonly getRaw: () => unknown;
	readonly setRaw: (value: unknown) => void;
}

/**
 * Wraps the raw profile table Scribe provides before the accessor tree exists.
 * The deliberately small surface mirrors the initialization-only public type.
 */
export function createScribeInitializationTree(
	template: object,
	rawData: object,
	module?: ScribeNativeModule,
): object {
	const tree: UnknownTable = {};
	for (const [key, schema] of pairs(template as UnknownTable)) {
		tree[key] = createInitializationNode(
			schema,
			childLocation(rootLocation(rawData), key),
			module,
		);
	}
	return tree;
}

/**
 * Projects a native immediate accessor (used by product Grant callbacks) onto
 * the lowercase, signal-free Scribe facade promised by @rovy/scribe.
 */
export function createScribeNativeImmediateTree(
	template: object,
	nativeAccessor: object,
): object {
	const tree: UnknownTable = {};
	const native = nativeAccessor as UnknownTable;
	for (const [key, schema] of pairs(template as UnknownTable)) {
		tree[key] = createNativeNode(schema, native[key] as object);
	}
	return tree;
}

function createInitializationNode(
	schema: unknown,
	location: ValueLocation,
	module?: ScribeNativeModule,
): object {
	const node: UnknownTable = {
		get: () => cloneAndFreeze(decodeSchemaValue(schema, location.getRaw(), module)),
		set: (value: unknown) => {
			location.setRaw(encodeSchemaValue(schema, value, module));
		},
		update: (transform: unknown) => {
			assert(
				typeIs(transform, "function"),
				"[rovy/scribe] initialization update requires a transform function",
			);
			const current = cloneAndFreeze(
				decodeSchemaValue(schema, location.getRaw(), module),
			);
			const transformed = (transform as (value: unknown) => unknown)(
				current,
			);
			location.setRaw(encodeSchemaValue(schema, transformed, module));
		},
	};

	const unwrapped = unwrapSchema(schema);
	if (isScribeSchemaDescriptor(unwrapped)) {
		if (unwrapped.kind === "array") {
			node.at = (index: unknown) => {
				assertArrayIndex(index);
				const raw = location.getRaw();
				const physicalIndex = (index as number) + 1;
				if (
					!typeIs(raw, "table") ||
					(raw as UnknownTable)[physicalIndex] === undefined
				) {
					return undefined;
				}
				return createInitializationNode(
					unwrapped.element,
					childLocation(location, physicalIndex),
					module,
				);
			};
			node.count = () => arrayCount(location.getRaw());
		} else if (unwrapped.kind === "dictionary") {
			node.at = (key: unknown) => {
				assert(
					typeIs(key, "string"),
					"[rovy/scribe] dictionary at(key) requires a string",
				);
				return createInitializationNode(
					unwrapped.element,
					childLocation(location, key as string),
					module,
				);
			};
			node.count = () => tableCount(location.getRaw());
		}
		return node;
	}

	if (isPlainArray(unwrapped)) {
		const element = (unwrapped as ReadonlyArray<unknown>)[0];
		node.at = (index: unknown) => {
			assertArrayIndex(index);
			const raw = location.getRaw();
			const physicalIndex = (index as number) + 1;
			if (
				!typeIs(raw, "table") ||
				(raw as UnknownTable)[physicalIndex] === undefined
			) {
				return undefined;
			}
			return createInitializationNode(
				element,
				childLocation(location, physicalIndex),
				module,
			);
		};
		node.count = () => arrayCount(location.getRaw());
		return node;
	}

	if (typeIs(unwrapped, "table")) {
		for (const [key, childSchema] of pairs(unwrapped as UnknownTable)) {
			node[key] = createInitializationNode(
				childSchema,
				childLocation(location, key),
				module,
			);
		}
	}
	return node;
}

function createNativeNode(schema: unknown, nativeNode: object): object {
	assert(
		typeIs(nativeNode, "table"),
		"[rovy/scribe] native Scribe accessor is missing a declared field",
	);
	const node: UnknownTable = {
		get: () => cloneAndFreeze(callNative(nativeNode, "Clone")),
		clone: () => callNative(nativeNode, "Clone"),
		default: () => cloneAndFreeze(callNative(nativeNode, "Default")),
		set: (value: unknown) => {
			callNative(nativeNode, "Set", value);
		},
		update: (transform: unknown) => {
			assert(
				typeIs(transform, "function"),
				"[rovy/scribe] immediate update requires a transform function",
			);
			callNative(nativeNode, "Update", (current: unknown) =>
				(transform as (value: unknown) => unknown)(
					cloneAndFreeze(current),
				),
			);
		},
	};

	const unwrapped = unwrapSchema(schema);
	if (
		isScribeSchemaDescriptor(unwrapped) &&
		unwrapped.kind === "timed"
	) {
		node.setTimed = (value: unknown, seconds: unknown) => {
			callNative(nativeNode, "SetTimed", value, seconds);
		};
		node.extendTimed = (seconds: unknown) => {
			callNative(nativeNode, "ExtendTimed", seconds);
		};
		node.active = () => {
			const [active, remaining] = callNativeTuple(
				nativeNode,
				"Active",
			);
			return remaining === undefined
				? { active }
				: { active, remaining };
		};
		return node;
	}

	if (isNumberSchema(unwrapped)) {
		node.min = () => callNative(nativeNode, "Min");
		node.max = () => callNative(nativeNode, "Max");
		node.increment = (amount: unknown, economy?: unknown) => {
			callNative(
				nativeNode,
				"Increment",
				amount,
				compileEconomyMeta(economy as ScribeEconomyMeta | undefined),
			);
		};
		node.decrement = (amount: unknown, economy?: unknown) => {
			callNative(
				nativeNode,
				"Decrement",
				amount,
				compileEconomyMeta(economy as ScribeEconomyMeta | undefined),
			);
		};
	} else if (typeIs(unwrapped, "boolean")) {
		node.toggle = () => {
			callNative(nativeNode, "Toggle");
		};
	}

	if (
		isScribeSchemaDescriptor(unwrapped) &&
		unwrapped.kind === "array"
	) {
		node.at = (index: unknown) => {
			assertArrayIndex(index);
			const count = callNative(nativeNode, "Count") as number;
			if ((index as number) >= count) return undefined;
			return createNativeNode(
				unwrapped.element,
				(nativeNode as UnknownTable)[(index as number) + 1] as object,
			);
		};
		node.count = () => callNative(nativeNode, "Count");
		node.find = (value: unknown) => {
			const physical = callNative(nativeNode, "Find", value) as
				| number
				| undefined;
			return physical === undefined ? undefined : physical - 1;
		};
		node.has = (value: unknown) => callNative(nativeNode, "Has", value);
		node.insert = (value: unknown, index?: unknown) => {
			callNative(
				nativeNode,
				"Insert",
				value,
				index === undefined ? undefined : (index as number) + 1,
			);
		};
		node.remove = (index?: unknown) => {
			callNative(
				nativeNode,
				"Remove",
				index === undefined ? undefined : (index as number) + 1,
			);
		};
		node.removeValue = (value: unknown) => {
			callNative(nativeNode, "RemoveValue", value);
		};
		node.clear = () => {
			callNative(nativeNode, "Clear");
		};
		return node;
	}

	if (
		isScribeSchemaDescriptor(unwrapped) &&
		unwrapped.kind === "dictionary"
	) {
		node.at = (key: unknown) => {
			assert(
				typeIs(key, "string"),
				"[rovy/scribe] dictionary at(key) requires a string",
			);
			return createNativeNode(
				unwrapped.element,
				(nativeNode as UnknownTable)[key as string] as object,
			);
		};
		node.count = () => callNative(nativeNode, "Count");
		node.remove = (key: unknown) => {
			callNative(nativeNode, "Remove", key);
		};
		node.clear = () => {
			callNative(nativeNode, "Clear");
		};
		return node;
	}

	if (isScribeSchemaDescriptor(unwrapped)) return node;

	if (isPlainArray(unwrapped)) {
		const element = (unwrapped as ReadonlyArray<unknown>)[0];
		node.at = (index: unknown) => {
			assertArrayIndex(index);
			const count = callNative(nativeNode, "Count") as number;
			if ((index as number) >= count) return undefined;
			return createNativeNode(
				element,
				(nativeNode as UnknownTable)[(index as number) + 1] as object,
			);
		};
		node.count = () => callNative(nativeNode, "Count");
		node.find = (value: unknown) => {
			const physical = callNative(nativeNode, "Find", value) as
				| number
				| undefined;
			return physical === undefined ? undefined : physical - 1;
		};
		node.has = (value: unknown) => callNative(nativeNode, "Has", value);
		node.insert = (value: unknown, index?: unknown) => {
			callNative(
				nativeNode,
				"Insert",
				value,
				index === undefined ? undefined : (index as number) + 1,
			);
		};
		node.remove = (index?: unknown) => {
			callNative(
				nativeNode,
				"Remove",
				index === undefined ? undefined : (index as number) + 1,
			);
		};
		node.removeValue = (value: unknown) => {
			callNative(nativeNode, "RemoveValue", value);
		};
		node.clear = () => {
			callNative(nativeNode, "Clear");
		};
		return node;
	}

	if (typeIs(unwrapped, "table")) {
		for (const [key, childSchema] of pairs(unwrapped as UnknownTable)) {
			node[key] = createNativeNode(
				childSchema,
				(nativeNode as UnknownTable)[key] as object,
			);
		}
	}
	return node;
}

function rootLocation(rawData: object): ValueLocation {
	let root = rawData;
	return {
		getRaw: () => root,
		setRaw: (value) => {
			assert(
				typeIs(value, "table"),
				"[rovy/scribe] initialization root must remain a table",
			);
			root = value as object;
		},
	};
}

function childLocation(parent: ValueLocation, key: string | number): ValueLocation {
	return {
		getRaw: () => {
			const container = parent.getRaw();
			return typeIs(container, "table")
				? (container as UnknownTable)[key]
				: undefined;
		},
		setRaw: (value) => {
			let container = parent.getRaw();
			if (!typeIs(container, "table")) {
				container = {};
				parent.setRaw(container);
			}
			(container as UnknownTable)[key] = value;
		},
	};
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

function decodeSchemaValue(
	schema: unknown,
	raw: unknown,
	module?: ScribeNativeModule,
): unknown {
	if (raw === undefined) return undefined;
	if (isScribeSchemaDescriptor(schema)) {
		if (schema.kind === "visibility" || schema.kind === "optional") {
			return decodeSchemaValue(schema.inner, raw, module);
		}
		if (schema.kind === "datatype") {
			if (!typeIs(raw, "buffer")) return raw;
			assert(
				module !== undefined,
				"[rovy/scribe] datatype initialization reads require a native Scribe module",
			);
			return module.Datatypes.Unpack(schema.datatype!, raw);
		}
		if (schema.kind === "array") {
			if (!typeIs(raw, "table")) return raw;
			const output = new Array<defined>();
			for (const [, value] of ipairs(raw as ReadonlyArray<unknown>)) {
				output.push(
					decodeSchemaValue(schema.element, value, module) as defined,
				);
			}
			return output;
		}
		if (schema.kind === "dictionary") {
			if (!typeIs(raw, "table")) return raw;
			const output: Record<string, unknown> = {};
			for (const [key, value] of pairs(raw as Record<string, unknown>)) {
				output[key] = decodeSchemaValue(schema.element, value, module);
			}
			return output;
		}
		return cloneValue(raw);
	}
	if (isPlainArray(schema) && typeIs(raw, "table")) {
		const output = new Array<defined>();
		const element = (schema as ReadonlyArray<unknown>)[0];
		for (const [, value] of ipairs(raw as ReadonlyArray<unknown>)) {
			output.push(decodeSchemaValue(element, value, module) as defined);
		}
		return output;
	}
	if (typeIs(schema, "table") && typeIs(raw, "table")) {
		const output: UnknownTable = {};
		for (const [key, childSchema] of pairs(schema as UnknownTable)) {
			output[key] = decodeSchemaValue(
				childSchema,
				(raw as UnknownTable)[key],
				module,
			);
		}
		return output;
	}
	return cloneValue(raw);
}

function encodeSchemaValue(
	schema: unknown,
	value: unknown,
	module?: ScribeNativeModule,
): unknown {
	if (value === undefined) return undefined;
	if (isScribeSchemaDescriptor(schema)) {
		if (schema.kind === "visibility" || schema.kind === "optional") {
			return encodeSchemaValue(schema.inner, value, module);
		}
		if (schema.kind === "datatype") {
			if (typeIs(value, "buffer")) return cloneBuffer(value);
			assert(
				module !== undefined,
				"[rovy/scribe] datatype initialization writes require a native Scribe module",
			);
			return module.Datatypes.Pack(schema.datatype!, value as never);
		}
		if (schema.kind === "array") {
			assert(
				typeIs(value, "table"),
				"[rovy/scribe] initialization array write requires an array",
			);
			const output = new Array<defined>();
			for (const [, child] of ipairs(value as ReadonlyArray<unknown>)) {
				output.push(
					encodeSchemaValue(schema.element, child, module) as defined,
				);
			}
			return output;
		}
		if (schema.kind === "dictionary") {
			assert(
				typeIs(value, "table"),
				"[rovy/scribe] initialization dictionary write requires a table",
			);
			const output: Record<string, unknown> = {};
			for (const [key, child] of pairs(value as Record<string, unknown>)) {
				output[key] = encodeSchemaValue(schema.element, child, module);
			}
			return output;
		}
		return cloneValue(value);
	}
	if (isPlainArray(schema) && typeIs(value, "table")) {
		const output = new Array<defined>();
		const element = (schema as ReadonlyArray<unknown>)[0];
		for (const [, child] of ipairs(value as ReadonlyArray<unknown>)) {
			output.push(encodeSchemaValue(element, child, module) as defined);
		}
		return output;
	}
	if (typeIs(schema, "table") && typeIs(value, "table")) {
		const output: UnknownTable = {};
		for (const [key, childSchema] of pairs(schema as UnknownTable)) {
			output[key] = encodeSchemaValue(
				childSchema,
				(value as UnknownTable)[key],
				module,
			);
		}
		return output;
	}
	return cloneValue(value);
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

function compileEconomyMeta(
	meta?: ScribeEconomyMeta,
): Readonly<Record<string, unknown>> | undefined {
	if (meta === undefined) return undefined;
	return {
		Flow:
			meta.flow === undefined
				? undefined
				: meta.flow === "source"
					? "Source"
					: "Sink",
		TransactionType: meta.transactionType,
		ItemSku: meta.itemSku,
		Currency: meta.currency,
		Fields: meta.fields,
	};
}

function cloneAndFreeze(value: unknown): unknown {
	return freezeValue(cloneValue(value));
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

function isNumberSchema(schema: unknown): boolean {
	return (
		typeIs(schema, "number") ||
		(isScribeSchemaDescriptor(schema) && schema.kind === "number")
	);
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
