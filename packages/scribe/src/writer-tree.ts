import {
	isScribeSchemaDescriptor,
} from "./schema";
import type {
	ScribeEconomyMeta,
} from "./types";

type UnknownTable = Record<string | number, unknown>;

export type ScribeWriteKind =
	| "set"
	| "update"
	| "increment"
	| "decrement"
	| "toggle"
	| "insert"
	| "remove"
	| "removeValue"
	| "clear"
	| "setTimed"
	| "extendTimed";

export interface ScribeQueuedWrite {
	readonly path: ReadonlyArray<string | number>;
	readonly kind: ScribeWriteKind;
	readonly args: ReadonlyArray<unknown>;
}

export type ScribeWriteSink = (write: ScribeQueuedWrite) => void;
export const SCRIBE_WRITE_NIL = table.freeze({});

export function createScribeWriteTree(
	template: object,
	sink: ScribeWriteSink,
	boundary: "client" | "server",
): object {
	const tree: UnknownTable = {};
	for (const [key, schema] of pairs(template as UnknownTable)) {
		if (boundary === "client" && visibilityOf(schema) === "serverOnly") {
			continue;
		}
		tree[key] = createWriteNode(schema, [key], sink);
	}
	return table.freeze(tree);
}

function createWriteNode(
	schema: unknown,
	path: ReadonlyArray<string | number>,
	sink: ScribeWriteSink,
): object {
	const node: UnknownTable = {};
	node.set = (selfOrValue: unknown, maybeValue?: unknown) => {
		sink({
			path,
			kind: "set",
			args: [
				protectNil(methodArgument(node, selfOrValue, maybeValue)),
			],
		});
	};
	node.update = (selfOrTransform: unknown, maybeTransform?: unknown) => {
		const transform = methodArgument(
			node,
			selfOrTransform,
			maybeTransform,
		);
		assert(
			typeIs(transform, "function"),
			"[rovy/scribe] update requires a transform function",
		);
		sink({ path, kind: "update", args: [transform] });
	};

	const unwrapped = unwrapSchema(schema);
	if (
		isScribeSchemaDescriptor(unwrapped) &&
		unwrapped.kind === "timed"
	) {
		node.setTimed = (
			selfOrValue: unknown,
			valueOrSeconds: unknown,
			maybeSeconds?: unknown,
		) => {
			const value = selfOrValue === node
				? valueOrSeconds
				: selfOrValue;
			const seconds = selfOrValue === node
				? maybeSeconds
				: valueOrSeconds;
			assertPositiveSeconds(seconds, "setTimed");
			sink({
				path,
				kind: "setTimed",
				args: [value, seconds],
			});
		};
		node.extendTimed = (
			selfOrSeconds: unknown,
			maybeSeconds?: unknown,
		) => {
			const seconds = methodArgument(
				node,
				selfOrSeconds,
				maybeSeconds,
			);
			assertPositiveSeconds(seconds, "extendTimed");
			sink({ path, kind: "extendTimed", args: [seconds] });
		};
		return table.freeze(node);
	}

	if (isNumberSchema(unwrapped)) {
		node.increment = (
			selfOrAmount: unknown,
			amountOrEconomy?: unknown,
			maybeEconomy?: unknown,
		) => {
			const amount = selfOrAmount === node
				? amountOrEconomy
				: selfOrAmount;
			const economy = selfOrAmount === node
				? maybeEconomy
				: amountOrEconomy;
			assertFiniteNumber(amount, "increment amount");
			sink({
				path,
				kind: "increment",
				args: economy === undefined
					? [amount]
					: [amount, economy as ScribeEconomyMeta],
			});
		};
		node.decrement = (
			selfOrAmount: unknown,
			amountOrEconomy?: unknown,
			maybeEconomy?: unknown,
		) => {
			const amount = selfOrAmount === node
				? amountOrEconomy
				: selfOrAmount;
			const economy = selfOrAmount === node
				? maybeEconomy
				: amountOrEconomy;
			assertFiniteNumber(amount, "decrement amount");
			sink({
				path,
				kind: "decrement",
				args: economy === undefined
					? [amount]
					: [amount, economy as ScribeEconomyMeta],
			});
		};
	} else if (typeIs(unwrapped, "boolean")) {
		node.toggle = (_self?: unknown) => {
			sink({ path, kind: "toggle", args: [] });
		};
	}

	if (
		isScribeSchemaDescriptor(unwrapped) &&
		unwrapped.kind === "array"
	) {
		node.at = (selfOrIndex: unknown, maybeIndex?: unknown) => {
			const index = methodArgument(node, selfOrIndex, maybeIndex);
			assertArrayIndex(index);
			return createWriteNode(
				unwrapped.element,
				[...path, index as number],
				sink,
			);
		};
		node.insert = (
			selfOrValue: unknown,
			valueOrIndex?: unknown,
			maybeIndex?: unknown,
		) => {
			const value = selfOrValue === node
				? valueOrIndex
				: selfOrValue;
			const index = selfOrValue === node
				? maybeIndex
				: valueOrIndex;
			if (index !== undefined) assertArrayIndex(index);
			sink({
				path,
				kind: "insert",
				args: index === undefined ? [value] : [value, index],
			});
		};
		node.remove = (selfOrIndex?: unknown, maybeIndex?: unknown) => {
			const index = selfOrIndex === node
				? maybeIndex
				: selfOrIndex;
			if (index !== undefined) assertArrayIndex(index);
			sink({
				path,
				kind: "remove",
				args: index === undefined ? [] : [index],
			});
		};
		node.removeValue = (
			selfOrValue: unknown,
			maybeValue?: unknown,
		) => {
			sink({
				path,
				kind: "removeValue",
				args: [methodArgument(node, selfOrValue, maybeValue)],
			});
		};
		node.clear = (_self?: unknown) => {
			sink({ path, kind: "clear", args: [] });
		};
		return table.freeze(node);
	}

	if (
		isScribeSchemaDescriptor(unwrapped) &&
		unwrapped.kind === "dictionary"
	) {
		node.at = (selfOrKey: unknown, maybeKey?: unknown) => {
			const key = methodArgument(node, selfOrKey, maybeKey);
			assert(
				typeIs(key, "string"),
				"[rovy/scribe] dictionary at(key) requires a string",
			);
			return createWriteNode(
				unwrapped.element,
				[...path, key],
				sink,
			);
		};
		node.remove = (selfOrKey: unknown, maybeKey?: unknown) => {
			const key = methodArgument(node, selfOrKey, maybeKey);
			assert(
				typeIs(key, "string"),
				"[rovy/scribe] dictionary remove(key) requires a string",
			);
			sink({ path, kind: "remove", args: [key] });
		};
		node.clear = (_self?: unknown) => {
			sink({ path, kind: "clear", args: [] });
		};
		return table.freeze(node);
	}

	if (isScribeSchemaDescriptor(unwrapped)) return table.freeze(node);

	if (isPlainArray(unwrapped)) {
		const element = (unwrapped as ReadonlyArray<unknown>)[0];
		node.at = (selfOrIndex: unknown, maybeIndex?: unknown) => {
			const index = methodArgument(node, selfOrIndex, maybeIndex);
			assertArrayIndex(index);
			return createWriteNode(
				element,
				[...path, index as number],
				sink,
			);
		};
		node.insert = (
			selfOrValue: unknown,
			valueOrIndex?: unknown,
			maybeIndex?: unknown,
		) => {
			const value = selfOrValue === node
				? valueOrIndex
				: selfOrValue;
			const index = selfOrValue === node
				? maybeIndex
				: valueOrIndex;
			if (index !== undefined) assertArrayIndex(index);
			sink({
				path,
				kind: "insert",
				args: index === undefined ? [value] : [value, index],
			});
		};
		node.remove = (selfOrIndex?: unknown, maybeIndex?: unknown) => {
			const index = selfOrIndex === node
				? maybeIndex
				: selfOrIndex;
			if (index !== undefined) assertArrayIndex(index);
			sink({
				path,
				kind: "remove",
				args: index === undefined ? [] : [index],
			});
		};
		node.removeValue = (
			selfOrValue: unknown,
			maybeValue?: unknown,
		) => {
			sink({
				path,
				kind: "removeValue",
				args: [methodArgument(node, selfOrValue, maybeValue)],
			});
		};
		node.clear = (_self?: unknown) => {
			sink({ path, kind: "clear", args: [] });
		};
		return table.freeze(node);
	}

	if (typeIs(unwrapped, "table")) {
		for (const [key, childSchema] of pairs(unwrapped as UnknownTable)) {
			node[key] = createWriteNode(
				childSchema,
				[...path, key],
				sink,
			);
		}
	}
	return table.freeze(node);
}

function methodArgument(
	node: object,
	selfOrValue: unknown,
	maybeValue: unknown,
): unknown {
	return selfOrValue === node ? maybeValue : selfOrValue;
}

function protectNil(value: unknown): unknown {
	return value === undefined ? SCRIBE_WRITE_NIL : value;
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
		"[rovy/scribe] array index must be a non-negative integer",
	);
}

function assertFiniteNumber(value: unknown, label: string): void {
	assert(
		typeIs(value, "number") &&
			value === value &&
			value !== math.huge &&
			value !== -math.huge,
		`[rovy/scribe] ${label} must be a finite number`,
	);
}

function assertPositiveSeconds(value: unknown, label: string): void {
	assert(
		typeIs(value, "number") &&
			value === value &&
			value > 0,
		`[rovy/scribe] ${label} seconds must be positive`,
	);
}
