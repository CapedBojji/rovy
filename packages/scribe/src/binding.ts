import type {
	ScribeLogCategory,
	ScribeLogEntry,
	ScribeLogLevel,
	ScribeMetricSummary,
	ScribeNativeLogEntry,
	ScribeNativeModule,
	ScribeStatus,
} from "./types";
import {
	isScribeSchemaDescriptor,
	type ScribeRuntimeSchemaDescriptor,
} from "./schema";

export interface ScribeLogFilter {
	readonly level?: ScribeLogLevel;
	readonly category?: ScribeLogCategory;
	readonly code?: string;
	readonly limit?: number;
}

export type ScribeBindingLogEntry =
	| ScribeLogEntry
	| ScribeNativeLogEntry;

export type ScribeBindingMetricSummary =
	| ScribeMetricSummary
	| {
			readonly Count: number;
			readonly Average: number;
			readonly Max: number;
	  };

export type CompiledScribeBundleOptions = Readonly<Record<string, unknown>>;
export type NativeScribeBundle = object;

export interface ScribeBinding {
	readonly version: string;
	readonly module?: ScribeNativeModule;
	configure(config: Readonly<Record<string, unknown>>): void;
	compileTemplate(template: object): object;
	createBundle(options: CompiledScribeBundleOptions): NativeScribeBundle;
	status(): ScribeStatus;
	addLogSink(sink: (entry: ScribeBindingLogEntry) => void): void;
	recentLogs(filter?: ScribeLogFilter): ReadonlyArray<ScribeBindingLogEntry>;
	metrics(): Readonly<Record<string, number | ScribeBindingMetricSummary>>;
}

export class NativeScribeBinding implements ScribeBinding {
	readonly version: string;

	constructor(readonly module: ScribeNativeModule) {
		this.version = module.Version;
	}

	configure(config: Readonly<Record<string, unknown>>): void {
		this.module.Configure(config as { readonly AutoSaveInterval?: number });
	}

	compileTemplate(template: object): object {
		return compileNativeSchemaValue(this.module, template) as object;
	}

	createBundle(options: CompiledScribeBundleOptions): NativeScribeBundle {
		const bundle = this.module.new(options);
		assert(
			typeIs(bundle, "table"),
			"[rovy/scribe] native Scribe.new(options) did not return a bundle table",
		);
		return bundle as object;
	}

	status(): ScribeStatus {
		return this.module.GetStatus();
	}

	addLogSink(sink: (entry: ScribeBindingLogEntry) => void): void {
		this.module.AddLogSink(sink);
	}

	recentLogs(filter?: ScribeLogFilter): ReadonlyArray<ScribeBindingLogEntry> {
		return this.module.GetRecentLogs(
			filter === undefined
				? undefined
				: {
						Level: filter.level,
						Category: filter.category,
						Code: filter.code,
						Limit: filter.limit,
					},
		);
	}

	metrics(): Readonly<Record<string, number | ScribeBindingMetricSummary>> {
		return this.module.GetMetrics();
	}
}

export interface FakeScribeBundle {
	readonly sequence: number;
	readonly options: CompiledScribeBundleOptions;
	readonly Client: object;
	readonly Server: object;
}

export class FakeScribeBinding implements ScribeBinding {
	readonly createdBundles = new Array<FakeScribeBundle>();
	readonly configurations = new Array<Readonly<Record<string, unknown>>>();
	private readonly sinks = new Array<(entry: ScribeBindingLogEntry) => void>();
	private readonly logs = new Array<ScribeLogEntry>();
	private currentStatus: ScribeStatus = "Healthy";

	constructor(readonly version = "2.3.0-fake") {}

	configure(config: Readonly<Record<string, unknown>>): void {
		this.configurations.push(config);
	}

	compileTemplate(template: object): object {
		return compileFakeSchemaValue(template) as object;
	}

	createBundle(options: CompiledScribeBundleOptions): FakeScribeBundle {
		const sequence = this.createdBundles.size() + 1;
		const bundle: FakeScribeBundle = {
			sequence,
			options,
			Client: { sequence, boundary: "client" },
			Server: { sequence, boundary: "server" },
		};
		this.createdBundles.push(bundle);
		return bundle;
	}

	status(): ScribeStatus {
		return this.currentStatus;
	}

	setStatus(status: ScribeStatus): void {
		this.currentStatus = status;
	}

	addLogSink(sink: (entry: ScribeBindingLogEntry) => void): void {
		this.sinks.push(sink);
	}

	pushLog(entry: ScribeLogEntry): void {
		this.logs.push(entry);
		for (const sink of this.sinks) sink(entry);
	}

	recentLogs(filter?: ScribeLogFilter): ReadonlyArray<ScribeBindingLogEntry> {
		const matches = this.logs.filter(
			(entry) =>
				(filter?.level === undefined || entry.level === filter.level) &&
				(filter?.category === undefined || entry.category === filter.category) &&
				(filter?.code === undefined || entry.code === filter.code),
		);
		const limit = filter?.limit;
		if (limit === undefined || matches.size() <= limit) return matches;
		const limited = new Array<ScribeLogEntry>();
		const start = matches.size() - limit;
		for (let index = start; index < matches.size(); index += 1) {
			limited.push(matches[index]);
		}
		return limited;
	}

	metrics(): Readonly<Record<string, number | ScribeBindingMetricSummary>> {
		return {
			"fake.bundles": this.createdBundles.size(),
		};
	}
}

function compileNativeSchemaValue(
	module: ScribeNativeModule,
	value: unknown,
): unknown {
	if (isScribeSchemaDescriptor(value)) {
		return compileNativeSchemaDescriptor(module, value);
	}
	if (!typeIs(value, "table")) return value;
	if (isArrayTable(value)) {
		const output = new Array<defined>();
		for (const child of value as Array<defined>) {
			output.push(compileNativeSchemaValue(module, child) as defined);
		}
		return output;
	}
	const output: Record<string | number, unknown> = {};
	for (const [key, child] of pairs(value as Record<string | number, unknown>)) {
		output[key] = compileNativeSchemaValue(module, child);
	}
	return output;
}

function compileNativeSchemaDescriptor(
	module: ScribeNativeModule,
	descriptor: ScribeRuntimeSchemaDescriptor,
): unknown {
	switch (descriptor.kind) {
		case "number": {
			const options = compileSchemaOptions(descriptor.options, {
				min: "Min",
				max: "Max",
			});
			return descriptor.integer === true
				? module.Int(descriptor.defaultValue as number, options)
				: module.Number(descriptor.defaultValue as number, options);
		}
		case "string":
			return module.String(
				descriptor.defaultValue as string,
				compileSchemaOptions(descriptor.options, {
					maxLength: "MaxLength",
				}),
			);
		case "enum":
			return module.Enum(
				descriptor.defaultValue as string,
				descriptor.members ?? [],
			);
		case "timed":
			return module.Timed(
				compileNativeSchemaValue(module, descriptor.inner),
			);
		case "dynamic": {
			const compiled = module.Dynamic(descriptor.factory!);
			if (typeIs(compiled, "table")) {
				const sampled = (
					compiled as unknown as Record<string, unknown>
				).Default;
				const sampledType = typeOf(sampled);
				const isSupported = module.Datatypes.IsSupported;
				if (
					typeIs(isSupported, "function") &&
					isSupported(sampledType)
				) {
					(descriptor as {
						sampledDatatype?: string;
					}).sampledDatatype = sampledType;
				}
			}
			return compiled;
		}
		case "optional":
			return module.Optional(
				compileNativeSchemaValue(module, descriptor.inner),
			);
		case "array":
			return module.ArrayOf(
				compileNativeSchemaValue(module, descriptor.element),
				compileSchemaOptions(descriptor.options, {
					maxItems: "MaxItems",
				}),
			);
		case "dictionary":
			return module.DictOf(
				compileNativeSchemaValue(module, descriptor.element),
				compileSchemaOptions(descriptor.options, {
					maxKeys: "MaxKeys",
					maxKeyLength: "MaxKeyLength",
				}),
			);
		case "visibility": {
			const inner = compileNativeSchemaValue(module, descriptor.inner);
			if (descriptor.visibility === "serverOnly") return module.ServerOnly(inner);
			if (descriptor.visibility === "shared") return module.Shared(inner);
			return module.Session(inner);
		}
		case "datatype": {
			const declarator = (module as unknown as Record<string, unknown>)[
				descriptor.datatype!
			];
			assert(
				typeIs(declarator, "function"),
				`[rovy/scribe] native Scribe ${descriptor.datatype} declarator is unavailable`,
			);
			return (declarator as (defaultValue: unknown) => unknown)(
				descriptor.defaultValue,
			);
		}
	}
}

function compileSchemaOptions(
	options: object | undefined,
	keys: Readonly<Record<string, string>>,
): Readonly<Record<string, number>> | undefined {
	if (options === undefined) return undefined;
	const output: Record<string, number> = {};
	let hasOptions = false;
	for (const [key, value] of pairs(options as Record<string, unknown>)) {
		const nativeKey = keys[key];
		if (nativeKey !== undefined && typeIs(value, "number")) {
			output[nativeKey] = value;
			hasOptions = true;
		}
	}
	return hasOptions ? output : undefined;
}

function compileFakeSchemaValue(value: unknown): unknown {
	if (isScribeSchemaDescriptor(value)) {
		const output: Record<string, unknown> = {
			kind: value.kind,
		};
		if (value.defaultValue !== undefined) output.defaultValue = value.defaultValue;
		if (value.options !== undefined) output.options = value.options;
		if (value.members !== undefined) output.members = value.members;
		if (value.visibility !== undefined) output.visibility = value.visibility;
		if (value.datatype !== undefined) output.datatype = value.datatype;
		if (value.factory !== undefined) output.factory = value.factory;
		if (value.inner !== undefined) output.inner = compileFakeSchemaValue(value.inner);
		if (value.element !== undefined) output.element = compileFakeSchemaValue(value.element);
		return output;
	}
	if (!typeIs(value, "table")) return value;
	if (isArrayTable(value)) {
		const output = new Array<defined>();
		for (const child of value as Array<defined>) {
			output.push(compileFakeSchemaValue(child) as defined);
		}
		return output;
	}
	const output: Record<string | number, unknown> = {};
	for (const [key, child] of pairs(value as Record<string | number, unknown>)) {
		output[key] = compileFakeSchemaValue(child);
	}
	return output;
}

function isArrayTable(value: object): boolean {
	let count = 0;
	let maximum = 0;
	for (const [key] of pairs(value as Record<string | number, unknown>)) {
		if (!typeIs(key, "number") || key < 1 || key % 1 !== 0) return false;
		count += 1;
		if (key > maximum) maximum = key;
	}
	return count === maximum;
}

export type ScribeModuleResolver = () => ModuleScript | ScribeNativeModule | undefined;

export function resolveScribeBinding(
	explicitModule?: ModuleScript | ScribeNativeModule,
	resolver?: ScribeModuleResolver,
): ScribeBinding {
	const candidate =
		explicitModule ??
		resolveWith(resolver) ??
		findDefaultScribeModule();
	assert(
		candidate !== undefined,
		"[rovy/scribe] Scribe module not found; pass { module }, configure a resolver, or install Scribe at ReplicatedStorage.Packages.Scribe",
	);
	const module = requireScribeModule(candidate);
	assert(
		typeIs(module.Version, "string") && module.Version.size() > 0,
		"[rovy/scribe] resolved module is not Scribe: missing string Version",
	);
	assert(
		typeIs(module.new, "function"),
		"[rovy/scribe] resolved module is not Scribe: missing new(options)",
	);
	return new NativeScribeBinding(module);
}

function resolveWith(
	resolver?: ScribeModuleResolver,
): ModuleScript | ScribeNativeModule | undefined {
	if (resolver === undefined) return undefined;
	const [ok, result] = pcall(resolver);
	assert(ok, `[rovy/scribe] configured module resolver failed: ${tostring(result)}`);
	return result as ModuleScript | ScribeNativeModule | undefined;
}

function requireScribeModule(
	candidate: ModuleScript | ScribeNativeModule,
): ScribeNativeModule {
	if (typeIs(candidate, "Instance")) {
		assert(
			candidate.IsA("ModuleScript"),
			"[rovy/scribe] configured Scribe module Instance must be a ModuleScript",
		);
		return require(candidate as ModuleScript) as ScribeNativeModule;
	}
	return candidate as ScribeNativeModule;
}

function findDefaultScribeModule(): ModuleScript | undefined {
	const [ok, result] = pcall(() => {
		const replicatedStorage = game.GetService("ReplicatedStorage");
		const packages = replicatedStorage.FindFirstChild("Packages");
		const module = packages?.FindFirstChild("Scribe");
		if (module !== undefined && module.IsA("ModuleScript")) return module;
		return undefined;
	});
	return ok ? result as ModuleScript | undefined : undefined;
}
