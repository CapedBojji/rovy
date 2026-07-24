type UnknownTable = Record<string | number, unknown>;

const SERIALIZABLE_DATATYPES = new Set<string>([
	"Vector3",
	"Vector2",
	"Vector3int16",
	"Vector2int16",
	"CFrame",
	"Color3",
	"BrickColor",
	"UDim",
	"UDim2",
	"Rect",
	"NumberRange",
	"NumberSequence",
	"ColorSequence",
	"DateTime",
	"EnumItem",
	"Font",
	"PhysicalProperties",
]);

export function assertScribeSerializable(
	value: unknown,
	path: string,
	seen = new Set<object>(),
	depth = 0,
): void {
	assert(
		depth <= 25,
		`[rovy/scribe] ${path} exceeds the serializable depth limit`,
	);
	if (value === undefined) return;
	const valueType = typeOf(value);
	if (
		valueType === "string" ||
		valueType === "number" ||
		valueType === "boolean" ||
		valueType === "buffer" ||
		SERIALIZABLE_DATATYPES.has(valueType)
	) {
		return;
	}
	assert(
		typeIs(value, "table"),
		`[rovy/scribe] ${path} is not Scribe-serializable (${valueType})`,
	);
	const object = value as object;
	assert(!seen.has(object), `[rovy/scribe] ${path} contains a cycle`);
	seen.add(object);
	for (const [key, child] of pairs(value as UnknownTable)) {
		assert(
			typeIs(key, "string") ||
				(typeIs(key, "number") && key >= 1 && key % 1 === 0),
			`[rovy/scribe] ${path} contains an unsupported table key`,
		);
		assertScribeSerializable(
			child,
			`${path}.${tostring(key)}`,
			seen,
			depth + 1,
		);
	}
	seen.delete(object);
}
