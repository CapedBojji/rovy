import type {
	AnyScribeData,
} from "./definitions";
import type {
	ScribePersistence,
	ScribeSaveNowOptions,
} from "./services";
import type {
	ScribeJobHandle,
	ScribeJobResult,
	ScribeJobResults,
	ScribeNativeModule,
	ScribeSaveInfo,
	ScribeVersionInfo,
} from "./types";
import type {
	RuntimeScribeDataDefinition,
} from "./registry";
import {
	isScribeSchemaDescriptor,
	type ScribeRuntimeSchemaDescriptor,
} from "./schema";
import {
	cloneScribeValue,
	freezeScribeValue,
} from "./reader-tree";
import {
	failedJob,
	ScribeJobRuntime,
	type ScribeJobOwner,
	successfulJob,
} from "./job-runtime";
import {
	assertScribeSerializable,
} from "./serialization";

type UnknownTable = Record<string | number, unknown>;
type NativeMethod = (...args: ReadonlyArray<unknown>) => unknown;

export class ScribePersistenceRuntime
	implements ScribePersistence<AnyScribeData>, ScribeJobResults
{
	private readonly owner: ScribeJobOwner;

	constructor(
		private readonly definition: RuntimeScribeDataDefinition,
		private readonly native: object,
		private readonly jobs: ScribeJobRuntime,
		private readonly module?: ScribeNativeModule,
	) {
		this.owner = jobs.owner("persistence", definition.id);
	}

	getSaveInfo(player: Player): ScribeSaveInfo {
		return normalizeScribeSaveInfo(
			callNative(this.native, "GetSaveInfo", player),
		);
	}

	saveNow(
		player: Player,
		options?: ScribeSaveNowOptions,
	): ScribeJobHandle<boolean> {
		assertPlayer(player, "saveNow");
		const nativeOptions = options?.force === true
			? table.freeze({ Force: true })
			: undefined;
		return this.jobs.enqueue(
			this.owner,
			"saveNow",
			() => {
				const [saved, reason] = callNativeTuple(
					this.native,
					"Flush",
					player,
					nativeOptions,
				);
				return booleanJobResult(
					saved,
					reason,
					"save-not-confirmed",
				);
			},
			player,
		);
	}

	getOffline(
		userId: number,
	): ScribeJobHandle<Readonly<Record<string, unknown>> | undefined> {
		assertUserId(userId, "getOffline");
		return this.jobs.enqueue(
			this.owner,
			"getOffline",
			() => {
				const raw = callNative(
					this.native,
					"GetOffline",
					userId,
				);
				if (raw === undefined) return successfulJob(undefined);
				const projected = projectPersisted(
					this.definition.template,
					raw,
					"GetOffline result",
					this.module,
				);
				return successfulJob(projected);
			},
		);
	}

	updateOffline(
		userId: number,
		transform: (
			current: Readonly<Record<string, unknown>>,
		) => Record<string, unknown>,
	): ScribeJobHandle<boolean> {
		assertUserId(userId, "updateOffline");
		assert(
			typeIs(transform, "function"),
			"[rovy/scribe] updateOffline requires a transform callback",
		);
		return this.jobs.enqueue(
			this.owner,
			"updateOffline",
			() => {
				const [updated, reason] = callNativeTuple(
					this.native,
					"UpdateOffline",
					userId,
					(raw: unknown) => {
						assert(
							typeIs(raw, "table"),
							"[rovy/scribe] native UpdateOffline supplied a non-table profile",
						);
						const current = projectPersisted(
							this.definition.template,
							raw,
							"UpdateOffline current profile",
							this.module,
						);
						const transformed = runNonYieldingTransform(
							transform,
							current,
						);
						validatePersistedRoot(
							this.definition.template,
							transformed,
							"UpdateOffline result",
						);
						applyPersisted(
							this.definition.template,
							raw,
							transformed,
							this.module,
						);
					},
				);
				return booleanJobResult(
					updated,
					reason,
					"offline-update-failed",
				);
			},
		);
	}

	listVersions(
		userId: number,
		limit?: number,
	): ScribeJobHandle<ReadonlyArray<ScribeVersionInfo>> {
		assertUserId(userId, "listVersions");
		if (limit !== undefined) {
			assert(
				limit >= 1 && limit % 1 === 0,
				"[rovy/scribe] listVersions limit must be a positive integer",
			);
		}
		return this.jobs.enqueue(
			this.owner,
			"listVersions",
			() => {
				const raw = callNative(
					this.native,
					"ListVersions",
					userId,
					limit,
				);
				assert(
					typeIs(raw, "table"),
					"[rovy/scribe] native ListVersions returned a non-table result",
				);
				const versions = new Array<ScribeVersionInfo>();
				for (const value of raw as ReadonlyArray<unknown>) {
					assert(
						typeIs(value, "table"),
						"[rovy/scribe] native ListVersions returned a malformed entry",
					);
					const entry = value as UnknownTable;
					assert(
						typeIs(entry.VersionId, "string") &&
							typeIs(entry.CreatedAt, "number"),
						"[rovy/scribe] native ListVersions entry is missing VersionId or CreatedAt",
					);
					versions.push(
						table.freeze({
							versionId: entry.VersionId,
							createdAt: entry.CreatedAt,
							size: typeIs(entry.Size, "number")
								? entry.Size
								: undefined,
						}),
					);
				}
				return successfulJob(table.freeze(versions));
			},
		);
	}

	getVersion(
		userId: number,
		versionId: string,
	): ScribeJobHandle<Readonly<Record<string, unknown>> | undefined> {
		assertUserId(userId, "getVersion");
		assertVersionId(versionId, "getVersion");
		return this.jobs.enqueue(
			this.owner,
			"getVersion",
			() => {
				const raw = callNative(
					this.native,
					"GetVersion",
					userId,
					versionId,
				);
				if (raw === undefined) return successfulJob(undefined);
				return successfulJob(
					projectPersisted(
						this.definition.template,
						raw,
						"GetVersion result",
						this.module,
					),
				);
			},
		);
	}

	restoreVersion(
		userId: number,
		versionId: string,
	): ScribeJobHandle<boolean> {
		assertUserId(userId, "restoreVersion");
		assertVersionId(versionId, "restoreVersion");
		return this.booleanJob(
			"restoreVersion",
			"RestoreVersion",
			[userId, versionId],
			"version-restore-failed",
		);
	}

	erase(userId: number): ScribeJobHandle<boolean> {
		assertUserId(userId, "erase");
		return this.booleanJob(
			"erase",
			"Erase",
			[userId],
			"profile-erase-failed",
		);
	}

	export(userId: number): ScribeJobHandle<string | undefined> {
		assertUserId(userId, "export");
		return this.jobs.enqueue(
			this.owner,
			"export",
			() => {
				const value = callNative(
					this.native,
					"Export",
					userId,
				);
				assert(
					value === undefined || typeIs(value, "string"),
					"[rovy/scribe] native Export returned a non-string result",
				);
				return successfulJob(value as string | undefined);
			},
		);
	}

	hasResult<T>(handle: ScribeJobHandle<T>): boolean {
		return this.jobs.hasResult(this.owner, handle);
	}

	takeResult<T>(
		handle: ScribeJobHandle<T>,
	): ScribeJobResult<T> | undefined {
		return this.jobs.takeResult(this.owner, handle);
	}

	private booleanJob(
		operation: string,
		nativeName: string,
		args: ReadonlyArray<unknown>,
		fallbackError: string,
	): ScribeJobHandle<boolean> {
		return this.jobs.enqueue(
			this.owner,
			operation,
			() => {
				const [ok, reason] = callNativeTuple(
					this.native,
					nativeName,
					...args,
				);
				return booleanJobResult(ok, reason, fallbackError);
			},
		);
	}
}

export function normalizeScribeSaveInfo(raw: unknown): ScribeSaveInfo {
	assert(
		typeIs(raw, "table"),
		"[rovy/scribe] native GetSaveInfo returned a non-table result",
	);
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

function projectPersisted(
	template: object,
	raw: unknown,
	label: string,
	module?: ScribeNativeModule,
): Readonly<Record<string, unknown>> {
	assert(
		typeIs(raw, "table"),
		`[rovy/scribe] ${label} must be a table`,
	);
	const source = raw as UnknownTable;
	const output: Record<string, unknown> = {};
	for (const [key, schema] of pairs(template as Record<string, unknown>)) {
		if (isSessionSchema(schema)) continue;
		const value = source[key];
		if (value !== undefined) {
			output[key] = decodePersistedValue(
				schema,
				value,
				module,
				`${label}.${key}`,
			);
		}
	}
	validatePersistedRoot(template, output, label);
	return freezeScribeValue(output) as Readonly<Record<string, unknown>>;
}

function applyPersisted(
	template: object,
	raw: object,
	transformed: Readonly<Record<string, unknown>>,
	module?: ScribeNativeModule,
): void {
	const target = raw as UnknownTable;
	for (const [key, schema] of pairs(template as Record<string, unknown>)) {
		if (isSessionSchema(schema)) continue;
		target[key] = encodePersistedValue(
			schema,
			transformed[key],
			module,
			`UpdateOffline result.${key}`,
		);
	}
}

function decodePersistedValue(
	schema: unknown,
	value: unknown,
	module: ScribeNativeModule | undefined,
	path: string,
): unknown {
	const datatype = schemaDatatype(schema);
	if (datatype !== undefined) {
		assert(
			module !== undefined &&
				typeIs(module.Datatypes.Unpack, "function"),
			`[rovy/scribe] ${path} requires native Scribe datatype unpacking`,
		);
		assert(
			typeIs(value, "buffer"),
			`[rovy/scribe] ${path} has malformed packed ${datatype} data`,
		);
		return module.Datatypes.Unpack(datatype, value);
	}
	if (isScribeSchemaDescriptor(schema)) {
		switch (schema.kind) {
			case "visibility":
			case "optional":
			case "timed":
				return decodePersistedValue(
					schema.inner,
					value,
					module,
					path,
				);
			case "array":
				return mapArrayValue(
					value,
					(child, childPath) =>
						decodePersistedValue(
							schema.element,
							child,
							module,
							childPath,
						),
					path,
				);
			case "dictionary":
				return mapDictionaryValue(
					value,
					(child, childPath) =>
						decodePersistedValue(
							schema.element,
							child,
							module,
							childPath,
						),
					path,
				);
			default:
				return cloneScribeValue(value);
		}
	}
	if (!typeIs(schema, "table") || !typeIs(value, "table")) {
		return cloneScribeValue(value);
	}
	const output: UnknownTable = {};
	for (const [key, childSchema] of pairs(schema as UnknownTable)) {
		const child = (value as UnknownTable)[key];
		if (child !== undefined) {
			output[key] = decodePersistedValue(
				childSchema,
				child,
				module,
				`${path}.${tostring(key)}`,
			);
		}
	}
	return output;
}

function encodePersistedValue(
	schema: unknown,
	value: unknown,
	module: ScribeNativeModule | undefined,
	path: string,
): unknown {
	if (value === undefined) return undefined;
	const datatype = schemaDatatype(schema);
	if (datatype !== undefined) {
		assert(
			module !== undefined &&
				typeIs(module.Datatypes.Pack, "function"),
			`[rovy/scribe] ${path} requires native Scribe datatype packing`,
		);
		return module.Datatypes.Pack(
			datatype,
			value as Parameters<ScribeNativeModule["Datatypes"]["Pack"]>[1],
		);
	}
	if (isScribeSchemaDescriptor(schema)) {
		switch (schema.kind) {
			case "visibility":
			case "optional":
			case "timed":
				return encodePersistedValue(
					schema.inner,
					value,
					module,
					path,
				);
			case "array":
				return mapArrayValue(
					value,
					(child, childPath) =>
						encodePersistedValue(
							schema.element,
							child,
							module,
							childPath,
						),
					path,
				);
			case "dictionary":
				return mapDictionaryValue(
					value,
					(child, childPath) =>
						encodePersistedValue(
							schema.element,
							child,
							module,
							childPath,
						),
					path,
				);
			default:
				return cloneScribeValue(value);
		}
	}
	if (!typeIs(schema, "table") || !typeIs(value, "table")) {
		return cloneScribeValue(value);
	}
	const output: UnknownTable = {};
	for (const [key, childSchema] of pairs(schema as UnknownTable)) {
		const child = (value as UnknownTable)[key];
		if (child !== undefined) {
			output[key] = encodePersistedValue(
				childSchema,
				child,
				module,
				`${path}.${tostring(key)}`,
			);
		}
	}
	return output;
}

function schemaDatatype(schema: unknown): string | undefined {
	if (!isScribeSchemaDescriptor(schema)) return undefined;
	if (schema.kind === "datatype") return schema.datatype;
	if (
		schema.kind === "dynamic" &&
		schema.sampledDatatype !== undefined
	) {
		return schema.sampledDatatype;
	}
	if (schema.kind === "dynamic" && schema.factory !== undefined) {
		const [ok, sample] = pcall(schema.factory);
		if (!ok) return undefined;
		const valueType = typeOf(sample);
		return isNativeDatatypeName(valueType) ? valueType : undefined;
	}
	return undefined;
}

function isNativeDatatypeName(valueType: string): boolean {
	return (
		valueType === "Vector3" ||
		valueType === "Vector2" ||
		valueType === "Vector3int16" ||
		valueType === "Vector2int16" ||
		valueType === "CFrame" ||
		valueType === "Color3" ||
		valueType === "BrickColor" ||
		valueType === "UDim" ||
		valueType === "UDim2" ||
		valueType === "Rect" ||
		valueType === "NumberRange" ||
		valueType === "NumberSequence" ||
		valueType === "ColorSequence" ||
		valueType === "DateTime" ||
		valueType === "EnumItem" ||
		valueType === "Font" ||
		valueType === "PhysicalProperties"
	);
}

function mapArrayValue(
	value: unknown,
	mapper: (value: unknown, path: string) => unknown,
	path: string,
): unknown {
	assert(
		typeIs(value, "table"),
		`[rovy/scribe] ${path} must be an array`,
	);
	const output = new Array<unknown>();
	let count = 0;
	let maximumIndex = 0;
	for (const [index, child] of pairs(value as UnknownTable)) {
		assert(
			typeIs(index, "number") &&
				index >= 1 &&
				index % 1 === 0,
			`[rovy/scribe] ${path} contains a non-array key`,
		);
		count += 1;
		if (index > maximumIndex) maximumIndex = index;
		output[index - 1] = mapper(child, `${path}[${index}]`);
	}
	assert(
		count === maximumIndex,
		`[rovy/scribe] ${path} contains an array hole`,
	);
	return output;
}

function mapDictionaryValue(
	value: unknown,
	mapper: (value: unknown, path: string) => unknown,
	path: string,
): unknown {
	assert(
		typeIs(value, "table"),
		`[rovy/scribe] ${path} must be a dictionary`,
	);
	const output: UnknownTable = {};
	for (const [key, child] of pairs(value as UnknownTable)) {
		output[key] = mapper(child, `${path}.${tostring(key)}`);
	}
	return output;
}

function validatePersistedRoot(
	template: object,
	value: unknown,
	label: string,
): asserts value is Record<string, unknown> {
	assert(
		typeIs(value, "table"),
		`[rovy/scribe] ${label} must return a table`,
	);
	const root = value as UnknownTable;
	const allowed = new Set<string>();
	for (const [key, schema] of pairs(template as Record<string, unknown>)) {
		if (isSessionSchema(schema)) continue;
		allowed.add(key);
		validateSchemaValue(schema, root[key], `${label}.${key}`);
	}
	for (const [key] of pairs(root)) {
		assert(
			typeIs(key, "string") && allowed.has(key),
			`[rovy/scribe] ${label} contains undeclared root field '${tostring(key)}'`,
		);
	}
	assertScribeSerializable(value, label);
}

function validateSchemaValue(
	schema: unknown,
	value: unknown,
	path: string,
): void {
	if (isScribeSchemaDescriptor(schema)) {
		validateDescriptor(schema, value, path);
		return;
	}
	if (!typeIs(schema, "table")) {
		assert(
			typeOf(value) === typeOf(schema),
			`[rovy/scribe] ${path} must be ${typeOf(schema)}, got ${typeOf(value)}`,
		);
		return;
	}
	assert(
		typeIs(value, "table"),
		`[rovy/scribe] ${path} must be a table`,
	);
	const shape = schema as UnknownTable;
	const object = value as UnknownTable;
	const allowed = new Set<string | number>();
	for (const [key, childSchema] of pairs(shape)) {
		allowed.add(key);
		validateSchemaValue(
			childSchema,
			object[key],
			`${path}.${tostring(key)}`,
		);
	}
	for (const [key] of pairs(object)) {
		assert(
			allowed.has(key),
			`[rovy/scribe] ${path} contains undeclared field '${tostring(key)}'`,
		);
	}
}

function validateDescriptor(
	descriptor: ScribeRuntimeSchemaDescriptor,
	value: unknown,
	path: string,
): void {
	switch (descriptor.kind) {
		case "visibility":
			validateSchemaValue(descriptor.inner, value, path);
			return;
		case "optional":
			if (value !== undefined) {
				validateSchemaValue(descriptor.inner, value, path);
			}
			return;
		case "dynamic":
			assertScribeSerializable(value, path);
			return;
		case "timed":
			validateSchemaValue(descriptor.inner, value, path);
			return;
		case "number": {
			assert(
				typeIs(value, "number"),
				`[rovy/scribe] ${path} must be a number`,
			);
			if (descriptor.integer === true) {
				assert(
					value % 1 === 0,
					`[rovy/scribe] ${path} must be an integer`,
				);
			}
			const options = (descriptor.options ?? {}) as UnknownTable;
			const minimum = options.min ?? options.Min;
			const maximum = options.max ?? options.Max;
			if (typeIs(minimum, "number")) {
				assert(
					value >= minimum,
					`[rovy/scribe] ${path} is below its minimum`,
				);
			}
			if (typeIs(maximum, "number")) {
				assert(
					value <= maximum,
					`[rovy/scribe] ${path} is above its maximum`,
				);
			}
			return;
		}
		case "string": {
			assert(
				typeIs(value, "string"),
				`[rovy/scribe] ${path} must be a string`,
			);
			const options = (descriptor.options ?? {}) as UnknownTable;
			const maximum = options.maxLength ?? options.MaxLength;
			if (typeIs(maximum, "number")) {
				assert(
					value.size() <= maximum,
					`[rovy/scribe] ${path} exceeds its maximum length`,
				);
			}
			return;
		}
		case "enum":
			assert(
				typeIs(value, "string") &&
					(descriptor.members ?? []).includes(value),
				`[rovy/scribe] ${path} is not a declared enum member`,
			);
			return;
		case "datatype":
			assert(
				typeOf(value) === descriptor.datatype,
				`[rovy/scribe] ${path} must be ${descriptor.datatype}`,
			);
			return;
		case "array":
			validateArray(descriptor, value, path);
			return;
		case "dictionary":
			validateDictionary(descriptor, value, path);
			return;
	}
}

function validateArray(
	descriptor: ScribeRuntimeSchemaDescriptor,
	value: unknown,
	path: string,
): void {
	assert(
		typeIs(value, "table"),
		`[rovy/scribe] ${path} must be an array`,
	);
	const array = value as UnknownTable;
	let count = 0;
	let maximumIndex = 0;
	for (const [key, child] of pairs(array)) {
		assert(
			typeIs(key, "number") && key >= 1 && key % 1 === 0,
			`[rovy/scribe] ${path} contains a non-array key`,
		);
		count += 1;
		if (key > maximumIndex) maximumIndex = key;
		validateSchemaValue(
			descriptor.element,
			child,
			`${path}[${key}]`,
		);
	}
	assert(
		count === maximumIndex,
		`[rovy/scribe] ${path} contains an array hole`,
	);
	const options = (descriptor.options ?? {}) as UnknownTable;
	const maximum = options.maxItems ?? options.MaxItems;
	if (typeIs(maximum, "number")) {
		assert(
			count <= maximum,
			`[rovy/scribe] ${path} exceeds its maximum item count`,
		);
	}
}

function validateDictionary(
	descriptor: ScribeRuntimeSchemaDescriptor,
	value: unknown,
	path: string,
): void {
	assert(
		typeIs(value, "table"),
		`[rovy/scribe] ${path} must be a dictionary`,
	);
	const dictionary = value as UnknownTable;
	let count = 0;
	const options = (descriptor.options ?? {}) as UnknownTable;
	const maximumKeys = options.maxKeys ?? options.MaxKeys;
	const maximumKeyLength =
		options.maxKeyLength ?? options.MaxKeyLength;
	for (const [key, child] of pairs(dictionary)) {
		assert(
			typeIs(key, "string"),
			`[rovy/scribe] ${path} contains a non-string key`,
		);
		if (typeIs(maximumKeyLength, "number")) {
			assert(
				key.size() <= maximumKeyLength,
				`[rovy/scribe] ${path} contains an overlong key`,
			);
		}
		count += 1;
		validateSchemaValue(
			descriptor.element,
			child,
			`${path}.${key}`,
		);
	}
	if (typeIs(maximumKeys, "number")) {
		assert(
			count <= maximumKeys,
			`[rovy/scribe] ${path} exceeds its maximum key count`,
		);
	}
}

function runNonYieldingTransform(
	transform: (
		current: Readonly<Record<string, unknown>>,
	) => Record<string, unknown>,
	current: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
	const transformThread = coroutine.create(() => transform(current));
	const [ok, resultOrError] = coroutine.resume(transformThread);
	if (!ok) error(resultOrError);
	if (coroutine.status(transformThread) !== "dead") {
		coroutine.close(transformThread);
		error("[rovy/scribe] updateOffline transform must not yield");
	}
	assert(
		typeIs(resultOrError, "table"),
		"[rovy/scribe] updateOffline transform must return a data table",
	);
	return resultOrError as Record<string, unknown>;
}

function isSessionSchema(schema: unknown): boolean {
	return (
		isScribeSchemaDescriptor(schema) &&
		schema.kind === "visibility" &&
		schema.visibility === "session"
	);
}

function booleanJobResult(
	ok: unknown,
	reason: unknown,
	fallbackError: string,
): ScribeJobResult<boolean> {
	if (ok === true) return successfulJob(true);
	return failedJob(
		typeIs(reason, "string") && reason.size() > 0
			? reason
			: fallbackError,
	);
}

function callNative(
	native: object,
	name: string,
	...args: ReadonlyArray<unknown>
): unknown {
	const method = (native as UnknownTable)[name];
	assert(
		typeIs(method, "function"),
		`[rovy/scribe] native server API does not expose ${name}`,
	);
	return (method as NativeMethod)(...args);
}

function callNativeTuple(
	native: object,
	name: string,
	...args: ReadonlyArray<unknown>
): LuaTuple<[unknown, unknown?]> {
	const method = (native as UnknownTable)[name];
	assert(
		typeIs(method, "function"),
		`[rovy/scribe] native server API does not expose ${name}`,
	);
	return (method as (
		...args: ReadonlyArray<unknown>
	) => LuaTuple<[unknown, unknown?]>)(...args);
}

function assertUserId(userId: number, operation: string): void {
	assert(
		userId >= 1 && userId % 1 === 0,
		`[rovy/scribe] ${operation} userId must be a positive integer`,
	);
}

function assertVersionId(versionId: string, operation: string): void {
	assert(
		versionId.size() > 0,
		`[rovy/scribe] ${operation} versionId must not be empty`,
	);
}

function assertPlayer(player: Player, operation: string): void {
	assert(
		player !== undefined,
		`[rovy/scribe] ${operation} requires a Player`,
	);
}
