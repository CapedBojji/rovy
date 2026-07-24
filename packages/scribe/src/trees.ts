import type {
	AnyScribeData,
	ScribeClientSchema,
	ScribeFullSchema,
	ScribeSharedShape,
} from "./definitions";
import type {
	ScribeArraySchema,
	ScribeDictionarySchema,
	ScribeDynamicSchema,
	ScribeNumberSchema,
	ScribeOptionalSchema,
	ScribeSchema,
	ScribeSchemaKind,
	ScribeSchemaValue,
	ScribeTimedSchema,
	ScribeVisibility,
	ScribeVisibilitySchema,
} from "./schema";
import type {
	ReadonlyDeep,
	ScribeEconomyMeta,
	ScribeSaveInfo,
	ScribeSessionState,
	ScribeStatus,
	ScribeTransactionHandle,
} from "./types";

export interface ScribeReadable<T> {
	get(): ReadonlyDeep<T>;
	clone(): T;
	default(): ReadonlyDeep<T>;
}

export interface ScribeNumberReader<Value extends number | undefined = number> extends ScribeReadable<Value> {
	min(): number | undefined;
	max(): number | undefined;
}

export interface ScribeBooleanReader<Value extends boolean | undefined = boolean> extends ScribeReadable<Value> {}

export interface ScribeTimedReader<T> extends ScribeReadable<T> {
	active(): {
		readonly active: boolean;
		readonly remaining?: number;
	};
}

export interface ScribeArrayReader<T, Node = ScribeReadNode<T>> extends ScribeReadable<Array<T>> {
	at(index: number): Node | undefined;
	count(): number;
	find(value: T): number | undefined;
	has(value: T): boolean;
}

export interface ScribeDictionaryReader<T, Node = ScribeReadNode<T>> extends ScribeReadable<Record<string, T>> {
	at(key: string): Node;
	count(): number;
}

type ScribeObjectReader<Schema extends object, Value> = ScribeReadable<Value> & {
	readonly [Key in keyof Schema]: ScribeReadNode<Schema[Key]>;
};

type ScribeReadNodeCore<Schema, Value> = Schema extends ScribeDynamicSchema<infer Inner>
	? ScribeReadNodeCore<Inner, Value>
	: Schema extends ScribeTimedSchema<infer _Inner>
		? ScribeTimedReader<Value>
		: Schema extends ScribeNumberSchema<boolean>
			? ScribeNumberReader<Extract<Value, number | undefined>>
			: Schema extends ScribeArraySchema<infer Element>
				? ScribeArrayReader<ScribeSchemaValue<Element>, ScribeReadNode<Element>>
				: Schema extends ScribeDictionarySchema<infer Element>
					? ScribeDictionaryReader<
							ScribeSchemaValue<Element>,
							ScribeReadNodeCore<Element, ScribeSchemaValue<Element> | undefined>
						>
					: Schema extends ScribeSchema<unknown, ScribeSchemaKind>
						? ScribeReadable<Value>
						: Schema extends number
							? ScribeNumberReader<Extract<Value, number | undefined>>
							: Schema extends boolean
								? ScribeBooleanReader<Extract<Value, boolean | undefined>>
								: Schema extends ReadonlyArray<infer Element>
									? ScribeArrayReader<
											ScribeSchemaValue<Element>,
											ScribeReadNode<Element>
										>
									: Schema extends object
										? ScribeObjectReader<Schema, Value>
										: ScribeReadable<Value>;

export type ScribeReadNode<Schema> = Schema extends ScribeVisibilitySchema<ScribeVisibility, infer Inner>
	? ScribeReadNode<Inner>
	: Schema extends ScribeOptionalSchema<infer Inner>
		? ScribeReadNodeCore<Inner, ScribeSchemaValue<Inner> | undefined>
		: ScribeReadNodeCore<Schema, ScribeSchemaValue<Schema>>;

export type ScribeReadTree<Schema extends object> = {
	readonly [Key in keyof Schema]: ScribeReadNode<Schema[Key]>;
};

export interface ScribeValueWriter<T> {
	set(value: T): void;
	update(transform: (current: ReadonlyDeep<T>) => T): void;
}

export interface ScribeNumberWriter<Value extends number | undefined = number> extends ScribeValueWriter<Value> {
	increment(amount: number, economy?: ScribeEconomyMeta): void;
	decrement(amount: number, economy?: ScribeEconomyMeta): void;
}

export interface ScribeBooleanWriter<Value extends boolean | undefined = boolean> extends ScribeValueWriter<Value> {
	toggle(): void;
}

export interface ScribeArrayWriter<T, Node = ScribeWriteNode<T>> extends ScribeValueWriter<ReadonlyArray<T>> {
	at(index: number): Node;
	insert(value: T, index?: number): void;
	remove(index?: number): void;
	removeValue(value: T): void;
	clear(): void;
}

export interface ScribeDictionaryWriter<T, Node = ScribeWriteNode<T>>
	extends ScribeValueWriter<Readonly<Record<string, T>>> {
	at(key: string): Node;
	remove(key: string): void;
	clear(): void;
}

export interface ScribeTimedWriter<T> extends ScribeValueWriter<T> {
	setTimed(value: T, seconds: number): void;
	extendTimed(seconds: number): void;
}

type ScribeObjectWriter<Schema extends object, Value> = ScribeValueWriter<Value> & {
	readonly [Key in keyof Schema]: ScribeWriteNode<Schema[Key]>;
};

type ScribeWriteNodeCore<Schema, Value> = Schema extends ScribeDynamicSchema<infer Inner>
	? ScribeWriteNodeCore<Inner, Value>
	: Schema extends ScribeTimedSchema<infer _Inner>
		? ScribeTimedWriter<Value>
		: Schema extends ScribeNumberSchema<boolean>
			? ScribeNumberWriter<Extract<Value, number | undefined>>
			: Schema extends ScribeArraySchema<infer Element>
				? ScribeArrayWriter<ScribeSchemaValue<Element>, ScribeWriteNode<Element>>
				: Schema extends ScribeDictionarySchema<infer Element>
					? ScribeDictionaryWriter<ScribeSchemaValue<Element>, ScribeWriteNode<Element>>
					: Schema extends ScribeSchema<unknown, ScribeSchemaKind>
						? ScribeValueWriter<Value>
						: Schema extends number
							? ScribeNumberWriter<Extract<Value, number | undefined>>
							: Schema extends boolean
								? ScribeBooleanWriter<Extract<Value, boolean | undefined>>
								: Schema extends ReadonlyArray<infer Element>
									? ScribeArrayWriter<
											ScribeSchemaValue<Element>,
											ScribeWriteNode<Element>
										>
									: Schema extends object
										? ScribeObjectWriter<Schema, Value>
										: ScribeValueWriter<Value>;

export type ScribeWriteNode<Schema> = Schema extends ScribeVisibilitySchema<ScribeVisibility, infer Inner>
	? ScribeWriteNode<Inner>
	: Schema extends ScribeOptionalSchema<infer Inner>
		? ScribeWriteNodeCore<Inner, ScribeSchemaValue<Inner> | undefined>
		: ScribeWriteNodeCore<Schema, ScribeSchemaValue<Schema>>;

export type ScribeWriteTree<Schema extends object> = {
	readonly [Key in keyof Schema]: ScribeWriteNode<Schema[Key]>;
};

/**
 * Immediate access used only while Scribe is constructing a profile. Unlike a
 * scheduled writer, these methods update Scribe's pre-ready raw profile table
 * synchronously and expose no signals, timers, economy operations, or flush.
 */
export interface ScribeInitializationValue<T> {
	get(): ReadonlyDeep<T>;
	set(value: T): void;
	update(transform: (current: ReadonlyDeep<T>) => T): void;
}

type ScribeInitializationObject<Schema extends object, Value> =
	& ScribeInitializationValue<Value>
	& {
		readonly [Key in keyof Schema]: ScribeInitializationNode<Schema[Key]>;
	};

export interface ScribeInitializationArray<T, Node = ScribeInitializationNode<T>>
	extends ScribeInitializationValue<ReadonlyArray<T>> {
	at(index: number): Node | undefined;
	count(): number;
}

export interface ScribeInitializationDictionary<
	T,
	Node = ScribeInitializationNode<T>,
> extends ScribeInitializationValue<Readonly<Record<string, T>>> {
	at(key: string): Node;
	count(): number;
}

type ScribeInitializationNodeCore<Schema, Value> =
	Schema extends ScribeDynamicSchema<infer _Inner>
		? ScribeInitializationValue<Value>
		: Schema extends ScribeTimedSchema<infer _Inner>
			? ScribeInitializationValue<Value>
			: Schema extends ScribeArraySchema<infer Element>
				? ScribeInitializationArray<
						ScribeSchemaValue<Element>,
						ScribeInitializationNode<Element>
					>
				: Schema extends ScribeDictionarySchema<infer Element>
					? ScribeInitializationDictionary<
							ScribeSchemaValue<Element>,
							ScribeInitializationNodeCore<
								Element,
								ScribeSchemaValue<Element> | undefined
							>
						>
					: Schema extends ScribeSchema<unknown, ScribeSchemaKind>
						? ScribeInitializationValue<Value>
						: Schema extends ReadonlyArray<infer Element>
							? ScribeInitializationArray<
									ScribeSchemaValue<Element>,
									ScribeInitializationNode<Element>
								>
							: Schema extends object
								? ScribeInitializationObject<Schema, Value>
								: ScribeInitializationValue<Value>;

export type ScribeInitializationNode<Schema> =
	Schema extends ScribeVisibilitySchema<ScribeVisibility, infer Inner>
		? ScribeInitializationNode<Inner>
		: Schema extends ScribeOptionalSchema<infer Inner>
			? ScribeInitializationNodeCore<
					Inner,
					ScribeSchemaValue<Inner> | undefined
				>
			: ScribeInitializationNodeCore<Schema, ScribeSchemaValue<Schema>>;

export type ScribeInitializationTree<Schema extends object> = {
	readonly [Key in keyof Schema]: ScribeInitializationNode<Schema[Key]>;
};

export type ScribeClientReader<D extends AnyScribeData> = ScribeReadTree<ScribeClientSchema<D>>;
export type ScribeLocalWriter<D extends AnyScribeData> = ScribeWriteTree<ScribeClientSchema<D>>;

export interface ScribeClientState<D extends AnyScribeData> {
	readonly definition: D;
	readonly ready: boolean;
	readonly serviceStatus: ScribeStatus;
	readonly saveInfo: ScribeSaveInfo;
}

export interface ScribeServerReader<D extends AnyScribeData> {
	get(player: Player): ScribeReadTree<ScribeFullSchema<D>> | undefined;
	require(player: Player): ScribeReadTree<ScribeFullSchema<D>>;
	state(player: Player): ScribeSessionState;
}

export interface ScribeServerWriter<D extends AnyScribeData> {
	for(player: Player): ScribeWriteTree<ScribeFullSchema<D>>;
	transaction(player: Player, callback: (writes: ScribeWriteTree<ScribeFullSchema<D>>) => void): ScribeTransactionHandle;
}

export interface ScribeSharedReader<D extends AnyScribeData> {
	get(playerOrUserId: Player | number): ReadonlyDeep<ScribeSharedShape<D>> | undefined;
}
