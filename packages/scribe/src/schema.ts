type WidenLiteral<T> = T extends string ? string : T extends number ? number : T extends boolean ? boolean : T;

export type ScribeSchemaKind =
	| "number"
	| "string"
	| "enum"
	| "timed"
	| "dynamic"
	| "optional"
	| "array"
	| "dictionary"
	| "datatype"
	| "visibility";

export interface ScribeSchema<T, Kind extends ScribeSchemaKind> {
	readonly __scribeSchema: {
		readonly value: T;
		readonly kind: Kind;
	};
}

export interface ScribeNumberSchema<Integer extends boolean = boolean> extends ScribeSchema<number, "number"> {
	readonly integer: Integer;
}

export interface ScribeStringSchema extends ScribeSchema<string, "string"> {}

export interface ScribeEnumSchema<Member extends string> extends ScribeSchema<Member, "enum"> {
	readonly members: ReadonlyArray<Member>;
}

export interface ScribeTimedSchema<Inner> extends ScribeSchema<WidenLiteral<Inner>, "timed"> {
	readonly inner: Inner;
}

export interface ScribeDynamicSchema<Inner> extends ScribeSchema<WidenLiteral<Inner>, "dynamic"> {
	readonly inner: Inner;
}

export interface ScribeOptionalSchema<Inner> extends ScribeSchema<ScribeSchemaValue<Inner> | undefined, "optional"> {
	readonly inner: Inner;
}

export interface ScribeArraySchema<Element> extends ScribeSchema<Array<ScribeSchemaValue<Element>>, "array"> {
	readonly element: Element;
}

export interface ScribeDictionarySchema<Element>
	extends ScribeSchema<Record<string, ScribeSchemaValue<Element>>, "dictionary"> {
	readonly element: Element;
}

export interface ScribeDatatypeSchema<T> extends ScribeSchema<T, "datatype"> {
	readonly datatype: string;
}

export type ScribeVisibility = "serverOnly" | "shared" | "session";

export interface ScribeVisibilitySchema<Visibility extends ScribeVisibility, Inner>
	extends ScribeSchema<ScribeSchemaValue<Inner>, "visibility"> {
	readonly __scribeVisibility: Visibility;
	readonly inner: Inner;
}

export type ScribeSchemaValue<Schema> = Schema extends ScribeVisibilitySchema<ScribeVisibility, infer Inner>
	? ScribeSchemaValue<Inner>
	: Schema extends ScribeOptionalSchema<infer Inner>
		? ScribeSchemaValue<Inner> | undefined
		: Schema extends ScribeArraySchema<infer Element>
			? Array<ScribeSchemaValue<Element>>
			: Schema extends ScribeDictionarySchema<infer Element>
				? Record<string, ScribeSchemaValue<Element>>
				: Schema extends ScribeSchema<infer Value, ScribeSchemaKind>
					? WidenLiteral<Value>
					: Schema extends ReadonlyArray<infer Element>
						? Array<ScribeSchemaValue<Element>>
						: Schema extends object
							? { -readonly [Key in keyof Schema]: ScribeSchemaValue<Schema[Key]> }
							: WidenLiteral<Schema>;

export interface ScribeNumberOptions {
	readonly min?: number;
	readonly max?: number;
}

export interface ScribeStringOptions {
	readonly maxLength?: number;
}

export interface ScribeArrayOptions {
	readonly maxItems?: number;
}

export interface ScribeDictionaryOptions {
	readonly maxKeys?: number;
	readonly maxKeyLength?: number;
}

export interface ScribeSchemaHelpers {
	int(defaultValue: number, options?: ScribeNumberOptions): ScribeNumberSchema<true>;
	number(defaultValue: number, options?: ScribeNumberOptions): ScribeNumberSchema<false>;
	string(defaultValue: string, options?: ScribeStringOptions): ScribeStringSchema;
	enum<const Members extends ReadonlyArray<string>>(
		defaultValue: Members[number],
		members: Members,
	): ScribeEnumSchema<Members[number]>;
	timed<T>(defaultValue: T): ScribeTimedSchema<T>;
	dynamic<T>(factory: () => T): ScribeDynamicSchema<T>;
	optional<T>(inner: T): ScribeOptionalSchema<T>;
	arrayOf<T>(shape: T, options?: ScribeArrayOptions): ScribeArraySchema<T>;
	dictOf<T>(shape: T, options?: ScribeDictionaryOptions): ScribeDictionarySchema<T>;
	serverOnly<T>(inner: T): ScribeVisibilitySchema<"serverOnly", T>;
	shared<T>(inner: T): ScribeVisibilitySchema<"shared", T>;
	session<T>(inner: T): ScribeVisibilitySchema<"session", T>;
	vector3(defaultValue: Vector3): ScribeDatatypeSchema<Vector3>;
	vector2(defaultValue: Vector2): ScribeDatatypeSchema<Vector2>;
	vector3int16(defaultValue: Vector3int16): ScribeDatatypeSchema<Vector3int16>;
	vector2int16(defaultValue: Vector2int16): ScribeDatatypeSchema<Vector2int16>;
	cframe(defaultValue: CFrame): ScribeDatatypeSchema<CFrame>;
	color3(defaultValue: Color3): ScribeDatatypeSchema<Color3>;
	brickColor(defaultValue: BrickColor): ScribeDatatypeSchema<BrickColor>;
	udim(defaultValue: UDim): ScribeDatatypeSchema<UDim>;
	udim2(defaultValue: UDim2): ScribeDatatypeSchema<UDim2>;
	rect(defaultValue: Rect): ScribeDatatypeSchema<Rect>;
	numberRange(defaultValue: NumberRange): ScribeDatatypeSchema<NumberRange>;
	numberSequence(defaultValue: NumberSequence): ScribeDatatypeSchema<NumberSequence>;
	colorSequence(defaultValue: ColorSequence): ScribeDatatypeSchema<ColorSequence>;
	dateTime(defaultValue: DateTime): ScribeDatatypeSchema<DateTime>;
	enumItem(defaultValue: EnumItem): ScribeDatatypeSchema<EnumItem>;
	font(defaultValue: Font): ScribeDatatypeSchema<Font>;
	physicalProperties(defaultValue: PhysicalProperties): ScribeDatatypeSchema<PhysicalProperties>;
}

export interface ScribeRuntimeSchemaDescriptor {
	readonly kind: ScribeSchemaKind;
	readonly __scribeSchema?: {
		readonly value: unknown;
		readonly kind: ScribeSchemaKind;
	};
	readonly __scribeVisibility?: ScribeVisibility;
	readonly defaultValue?: unknown;
	readonly options?: object;
	readonly members?: ReadonlyArray<string>;
	readonly inner?: unknown;
	readonly factory?: () => unknown;
	readonly element?: unknown;
	readonly visibility?: ScribeVisibility;
	readonly datatype?: string;
}

function descriptor<T>(value: ScribeRuntimeSchemaDescriptor): T {
	(value as { __scribeSchema?: unknown }).__scribeSchema = {
		value: undefined,
		kind: value.kind,
	};
	return value as T;
}

function datatype<T>(name: string, defaultValue: T): ScribeDatatypeSchema<T> {
	return descriptor({
		kind: "datatype",
		datatype: name,
		defaultValue,
	});
}

export const s: ScribeSchemaHelpers = {
	int(defaultValue, options) {
		return descriptor({
			kind: "number",
			defaultValue,
			options,
			integer: true,
		} as ScribeRuntimeSchemaDescriptor & { readonly integer: true });
	},
	number(defaultValue, options) {
		return descriptor({
			kind: "number",
			defaultValue,
			options,
			integer: false,
		} as ScribeRuntimeSchemaDescriptor & { readonly integer: false });
	},
	string(defaultValue, options) {
		return descriptor({ kind: "string", defaultValue, options });
	},
	enum(defaultValue, members) {
		return descriptor({ kind: "enum", defaultValue, members });
	},
	timed(defaultValue) {
		return descriptor({ kind: "timed", defaultValue, inner: defaultValue });
	},
	dynamic(factory) {
		return descriptor({ kind: "dynamic", factory, inner: factory });
	},
	optional(inner) {
		return descriptor({ kind: "optional", inner });
	},
	arrayOf(element, options) {
		return descriptor({ kind: "array", element, options });
	},
	dictOf(element, options) {
		return descriptor({ kind: "dictionary", element, options });
	},
	serverOnly(inner) {
		return descriptor({
			kind: "visibility",
			visibility: "serverOnly",
			__scribeVisibility: "serverOnly",
			inner,
		});
	},
	shared(inner) {
		return descriptor({
			kind: "visibility",
			visibility: "shared",
			__scribeVisibility: "shared",
			inner,
		});
	},
	session(inner) {
		return descriptor({
			kind: "visibility",
			visibility: "session",
			__scribeVisibility: "session",
			inner,
		});
	},
	vector3(defaultValue) {
		return datatype("Vector3", defaultValue);
	},
	vector2(defaultValue) {
		return datatype("Vector2", defaultValue);
	},
	vector3int16(defaultValue) {
		return datatype("Vector3int16", defaultValue);
	},
	vector2int16(defaultValue) {
		return datatype("Vector2int16", defaultValue);
	},
	cframe(defaultValue) {
		return datatype("CFrame", defaultValue);
	},
	color3(defaultValue) {
		return datatype("Color3", defaultValue);
	},
	brickColor(defaultValue) {
		return datatype("BrickColor", defaultValue);
	},
	udim(defaultValue) {
		return datatype("UDim", defaultValue);
	},
	udim2(defaultValue) {
		return datatype("UDim2", defaultValue);
	},
	rect(defaultValue) {
		return datatype("Rect", defaultValue);
	},
	numberRange(defaultValue) {
		return datatype("NumberRange", defaultValue);
	},
	numberSequence(defaultValue) {
		return datatype("NumberSequence", defaultValue);
	},
	colorSequence(defaultValue) {
		return datatype("ColorSequence", defaultValue);
	},
	dateTime(defaultValue) {
		return datatype("DateTime", defaultValue);
	},
	enumItem(defaultValue) {
		return datatype("EnumItem", defaultValue);
	},
	font(defaultValue) {
		return datatype("Font", defaultValue);
	},
	physicalProperties(defaultValue) {
		return datatype("PhysicalProperties", defaultValue);
	},
};

export function isScribeSchemaDescriptor(value: unknown): value is ScribeRuntimeSchemaDescriptor {
	if (!typeIs(value, "table")) return false;
	const kind = (value as { readonly kind?: unknown }).kind;
	return typeIs(kind, "string") && (
		kind === "number" ||
		kind === "string" ||
		kind === "enum" ||
		kind === "timed" ||
		kind === "dynamic" ||
		kind === "optional" ||
		kind === "array" ||
		kind === "dictionary" ||
		kind === "datatype" ||
		kind === "visibility"
	);
}
