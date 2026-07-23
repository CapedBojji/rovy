import type {
	RuntimeScribeDataDefinition,
} from "./registry";
import {
	cloneScribeValue,
	freezeScribeValue,
} from "./reader-tree";
import {
	SCRIBE_WRITE_NIL,
	type ScribeQueuedWrite,
	type ScribeWriteKind,
	type ScribeWriteSink,
} from "./writer-tree";
import {
	isScribeSchemaDescriptor,
} from "./schema";
import type {
	ScribeEconomyMeta,
	ScribeTransactionHandle,
} from "./types";

type UnknownTable = Record<string | number, unknown>;
type NativeMethod = (...args: ReadonlyArray<unknown>) => unknown;

export interface ScribeWriteOperation {
	readonly sequence: number;
	readonly dataId: string;
	readonly player?: Player;
	readonly path: ReadonlyArray<string | number>;
	readonly kind: ScribeWriteKind;
	readonly args: ReadonlyArray<unknown>;
	readonly transactionId?: number;
}

export interface ScribeWriteFailure {
	readonly dataId: string;
	readonly player?: Player;
	readonly transactionId?: number;
	readonly operations: ReadonlyArray<ScribeWriteOperation>;
	readonly error: string;
}

export interface ScribeWritableBundle {
	readonly definition: RuntimeScribeDataDefinition;
	readonly active: object;
}

interface OrdinaryEntry {
	readonly entryKind: "ordinary";
	readonly operation: ScribeWriteOperation;
}

interface TransactionEntry {
	readonly entryKind: "transaction";
	readonly sequence: number;
	readonly dataId: string;
	readonly player: Player;
	readonly transactionId: number;
	readonly operations: ReadonlyArray<ScribeWriteOperation>;
}

type WriteEntry = OrdinaryEntry | TransactionEntry;

export class ScribeWriteQueue {
	private sequence = 0;
	private transactionSequence = 0;
	private activeTransaction = false;
	private pending = new Array<WriteEntry>();
	private failures = new Array<ScribeWriteFailure>();

	constructor(
		private readonly boundary: "client" | "server",
		private readonly bundle: (dataId: string) => ScribeWritableBundle,
	) {}

	enqueue(
		dataId: string,
		player: Player | undefined,
		write: ScribeQueuedWrite,
	): void {
		assert(
			!this.activeTransaction,
			"[rovy/scribe] writes captured outside the transaction facade cannot be queued from inside writes.transaction",
		);
		if (this.boundary === "server") {
			assert(
				player !== undefined,
				"[rovy/scribe] authoritative writes require a player",
			);
		} else {
			assert(
				player === undefined,
				"[rovy/scribe] client-local writes cannot target a player",
			);
		}
		this.pending.push({
			entryKind: "ordinary",
			operation: this.materialize(dataId, player, write),
		});
	}

	transaction(
		dataId: string,
		player: Player,
		run: (sink: ScribeWriteSink) => void,
	): ScribeTransactionHandle {
		assert(
			this.boundary === "server",
			"[rovy/scribe] transactions are server-only",
		);
		assert(
			!this.activeTransaction,
			"[rovy/scribe] transactions cannot nest",
		);
		const transactionId = this.transactionSequence + 1;
		this.transactionSequence = transactionId;
		const operations = new Array<ScribeWriteOperation>();
		this.activeTransaction = true;
		const [captured, failureReason] = pcall(() => {
			run((write) => {
				operations.push(
					this.materialize(
						dataId,
						player,
						write,
						transactionId,
					),
				);
			});
		});
		this.activeTransaction = false;
		assert(captured, tostring(failureReason));
		const sequence = operations[0]?.sequence ?? this.nextSequence();
		this.pending.push({
			entryKind: "transaction",
			sequence,
			dataId,
			player,
			transactionId,
			operations,
		});
		return table.freeze({ id: transactionId, player });
	}

	hasPending(): boolean {
		return this.pending.size() > 0;
	}

	flush(): boolean {
		if (this.pending.size() === 0) return false;
		const entries = this.pending;
		this.pending = new Array<WriteEntry>();
		let index = 0;
		while (index < entries.size()) {
			const entry = entries[index];
			if (entry.entryKind === "transaction") {
				this.applyTransaction(entry);
				index += 1;
				continue;
			}
			const segment = new Array<ScribeWriteOperation>();
			const first = entry.operation;
			segment.push(first);
			index += 1;
			while (index < entries.size()) {
				const candidate = entries[index];
				if (
					candidate.entryKind !== "ordinary" ||
					candidate.operation.dataId !== first.dataId ||
					candidate.operation.player !== first.player
				) {
					break;
				}
				segment.push(candidate.operation);
				index += 1;
			}
			if (this.boundary === "server") {
				this.applyServerBatch(segment);
			} else {
				this.applyClientSegment(segment);
			}
		}
		return true;
	}

	drainFailures(): ReadonlyArray<ScribeWriteFailure> {
		const failures = this.failures;
		this.failures = new Array<ScribeWriteFailure>();
		return failures;
	}

	private nextSequence(): number {
		this.sequence += 1;
		return this.sequence;
	}

	private materialize(
		dataId: string,
		player: Player | undefined,
		write: ScribeQueuedWrite,
		transactionId?: number,
	): ScribeWriteOperation {
		const path = new Array<string | number>();
		for (const segment of write.path) path.push(segment);
		const args = new Array<defined>();
		for (const argument of write.args) {
			args.push(
				argument === SCRIBE_WRITE_NIL ||
					typeIs(argument, "function")
					? argument
					: cloneScribeValue(argument) as defined,
			);
		}
		return table.freeze({
			sequence: this.nextSequence(),
			dataId,
			player,
			path: table.freeze(path),
			kind: write.kind,
			args: table.freeze(args),
			transactionId,
		});
	}

	private applyClientSegment(
		operations: ReadonlyArray<ScribeWriteOperation>,
	): void {
		const first = operations[0];
		const bundle = this.bundle(first.dataId);
		const [ok, failureReason] = pcall(() => {
			for (const operation of operations) {
				applyOperation(
					bundle.definition.template,
					bundle.active,
					operation,
				);
			}
		});
		if (!ok) this.recordFailure(operations, tostring(failureReason));
	}

	private applyServerBatch(
		operations: ReadonlyArray<ScribeWriteOperation>,
	): void {
		const first = operations[0];
		const player = first.player!;
		const bundle = this.bundle(first.dataId);
		const [ok, failureReason] = pcall(() => {
			callNative(bundle.active, "Batch", player, () => {
				const root = callNative(bundle.active, "Get", player);
				assert(
					typeIs(root, "table"),
					"[rovy/scribe] native Server.Get returned no accessor during Batch",
				);
				for (const operation of operations) {
					applyOperation(
						bundle.definition.template,
						root,
						operation,
					);
				}
			});
		});
		if (!ok) this.recordFailure(operations, tostring(failureReason));
	}

	private applyTransaction(entry: TransactionEntry): void {
		const bundle = this.bundle(entry.dataId);
		const [called, committedOrError, transactionError] = pcall(() => {
			const method = (bundle.active as UnknownTable).Transaction;
			assert(
				typeIs(method, "function"),
				"[rovy/scribe] native server API does not expose Transaction",
			);
			return (method as (
				player: Player,
				callback: () => void,
			) => LuaTuple<[boolean, string?]>)(
				entry.player,
				() => {
					const root = callNative(
						bundle.active,
						"Get",
						entry.player,
					);
					assert(
						typeIs(root, "table"),
						"[rovy/scribe] native Server.Get returned no accessor during Transaction",
					);
					for (const operation of entry.operations) {
						applyOperation(
							bundle.definition.template,
							root,
							operation,
						);
					}
				},
			);
		});
		if (!called) {
			this.recordFailure(
				entry.operations,
				tostring(committedOrError),
				entry,
			);
			return;
		}
		if (!committedOrError) {
			this.recordFailure(
				entry.operations,
				transactionError ?? "native transaction rejected",
				entry,
			);
		}
	}

	private recordFailure(
		operations: ReadonlyArray<ScribeWriteOperation>,
		failureReason: string,
		transaction?: TransactionEntry,
	): void {
		const first = operations[0];
		this.failures.push(
			table.freeze({
				dataId: transaction?.dataId ?? first?.dataId ?? "unknown",
				player: transaction?.player ?? first?.player,
				transactionId:
					transaction?.transactionId ??
					first?.transactionId,
				operations,
				error: failureReason,
			}),
		);
	}
}

function applyOperation(
	template: object,
	root: object,
	operation: ScribeWriteOperation,
): void {
	const node = resolveNativeNode(template, root, operation.path);
	const args = operation.args;
	switch (operation.kind) {
		case "set":
			callNative(
				node,
				"Set",
				restoreNil(args[0]),
			);
			return;
		case "update": {
			const transform = args[0] as (current: unknown) => unknown;
			callNative(node, "Update", (current: unknown) => {
				const safe = freezeScribeValue(cloneScribeValue(current));
				return cloneScribeValue(transform(safe));
			});
			return;
		}
		case "increment":
		case "decrement":
			callNative(
				node,
				operation.kind === "increment"
					? "Increment"
					: "Decrement",
				args[0],
				compileEconomyMeta(args[1] as ScribeEconomyMeta | undefined),
			);
			return;
		case "toggle":
			callNative(node, "Toggle");
			return;
		case "insert":
			callNative(
				node,
				"Insert",
				restoreNil(args[0]),
				args[1] === undefined
					? undefined
					: (args[1] as number) + 1,
			);
			return;
		case "remove": {
			const target = args[0];
			callNative(
				node,
				"Remove",
				typeIs(target, "number") ? target + 1 : target,
			);
			return;
		}
		case "removeValue":
			callNative(node, "RemoveValue", restoreNil(args[0]));
			return;
		case "clear":
			callNative(node, "Clear");
			return;
		case "setTimed":
			callNative(
				node,
				"SetTimed",
				restoreNil(args[0]),
				args[1],
			);
			return;
		case "extendTimed":
			callNative(node, "ExtendTimed", args[0]);
			return;
	}
}

function resolveNativeNode(
	template: object,
	root: object,
	path: ReadonlyArray<string | number>,
): object {
	let schema: unknown = template;
	let native = root as UnknownTable;
	for (const segment of path) {
		const unwrapped = unwrapSchema(schema);
		let key = segment;
		if (
			isScribeSchemaDescriptor(unwrapped) &&
			unwrapped.kind === "array"
		) {
			assert(
				typeIs(segment, "number"),
				"[rovy/scribe] array write path contains a non-numeric index",
			);
			key = segment + 1;
			schema = unwrapped.element;
		} else if (
			isScribeSchemaDescriptor(unwrapped) &&
			unwrapped.kind === "dictionary"
		) {
			assert(
				typeIs(segment, "string"),
				"[rovy/scribe] dictionary write path contains a non-string key",
			);
			schema = unwrapped.element;
		} else {
			assert(
				typeIs(unwrapped, "table"),
				`[rovy/scribe] write path continues through a leaf at '${tostring(segment)}'`,
			);
			schema = (unwrapped as UnknownTable)[segment];
		}
		const child = native[key];
		assert(
			typeIs(child, "table"),
			`[rovy/scribe] native accessor is missing write path segment '${tostring(segment)}'`,
		);
		native = child as UnknownTable;
	}
	return native;
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

function restoreNil(value: unknown): unknown {
	return value === SCRIBE_WRITE_NIL ? undefined : value;
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
		Fields: cloneScribeValue(meta.fields),
	};
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
