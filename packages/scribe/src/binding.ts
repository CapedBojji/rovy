import type {
	ScribeLogCategory,
	ScribeLogEntry,
	ScribeLogLevel,
	ScribeMetricSummary,
	ScribeNativeModule,
	ScribeStatus,
} from "./types";

export interface ScribeLogFilter {
	readonly level?: ScribeLogLevel;
	readonly category?: ScribeLogCategory;
	readonly code?: string;
	readonly limit?: number;
}

export type CompiledScribeBundleOptions = Readonly<Record<string, unknown>>;
export type NativeScribeBundle = object;

export interface ScribeBinding {
	readonly version: string;
	readonly module?: ScribeNativeModule;
	createBundle(options: CompiledScribeBundleOptions): NativeScribeBundle;
	status(): ScribeStatus;
	addLogSink(sink: (entry: ScribeLogEntry) => void): void;
	recentLogs(filter?: ScribeLogFilter): ReadonlyArray<ScribeLogEntry>;
	metrics(): Readonly<Record<string, number | ScribeMetricSummary>>;
}

export class NativeScribeBinding implements ScribeBinding {
	readonly version: string;

	constructor(readonly module: ScribeNativeModule) {
		this.version = module.Version;
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

	addLogSink(sink: (entry: ScribeLogEntry) => void): void {
		this.module.AddLogSink(sink);
	}

	recentLogs(filter?: ScribeLogFilter): ReadonlyArray<ScribeLogEntry> {
		return this.module.GetRecentLogs(filter);
	}

	metrics(): Readonly<Record<string, number | ScribeMetricSummary>> {
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
	private readonly sinks = new Array<(entry: ScribeLogEntry) => void>();
	private readonly logs = new Array<ScribeLogEntry>();
	private currentStatus: ScribeStatus = "Healthy";

	constructor(readonly version = "1.0.10-fake") {}

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

	addLogSink(sink: (entry: ScribeLogEntry) => void): void {
		this.sinks.push(sink);
	}

	pushLog(entry: ScribeLogEntry): void {
		this.logs.push(entry);
		for (const sink of this.sinks) sink(entry);
	}

	recentLogs(filter?: ScribeLogFilter): ReadonlyArray<ScribeLogEntry> {
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

	metrics(): Readonly<Record<string, number | ScribeMetricSummary>> {
		return {
			"fake.bundles": this.createdBundles.size(),
		};
	}
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
