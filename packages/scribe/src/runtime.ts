import type { FlushContext, FlushParticipant } from "@rovy/core";
import type { AnyScribeData } from "./definitions";
import type {
	ScribeBinding,
	NativeScribeBundle,
	CompiledScribeBundleOptions,
	ScribeLogFilter,
} from "./binding";
import type { ScribeDataParamKind } from "./param-ids";
import type { RuntimeScribeDataDefinition } from "./registry";
import type {
	ScribeLogEntry,
	ScribeMetricSummary,
	ScribeStatus,
	ScribeTransport,
} from "./types";

export type ScribeRuntimeBoundary = "client" | "server";

export interface ScribeInstalledBundle {
	readonly definition: RuntimeScribeDataDefinition;
	readonly native: NativeScribeBundle;
	readonly active: object;
}

export interface ScribeRuntimeHandle {
	readonly kind: ScribeDataParamKind;
	readonly dataId: string;
	readonly definition: AnyScribeData;
	readonly runtime: object;
}

export class ScribeDiagnosticsHandle {
	constructor(private readonly binding: ScribeBinding) {}

	status(): ScribeStatus {
		return this.binding.status();
	}

	recentLogs(filter?: ScribeLogFilter): ReadonlyArray<ScribeLogEntry> {
		return this.binding.recentLogs(filter);
	}

	metrics(): Readonly<Record<string, number | ScribeMetricSummary>> {
		return this.binding.metrics();
	}

	addSink(sink: (entry: ScribeLogEntry) => void): void {
		this.binding.addLogSink(sink);
	}
}

export class ScribeRuntime implements FlushParticipant {
	readonly diagnostics: ScribeDiagnosticsHandle;
	private readonly bundleById = new Map<string, ScribeInstalledBundle>();
	private readonly handles = new Map<string, ScribeRuntimeHandle | object>();

	constructor(
		readonly boundary: ScribeRuntimeBoundary,
		readonly binding: ScribeBinding,
		definitions: ReadonlyArray<RuntimeScribeDataDefinition>,
		transport?: ScribeTransport,
	) {
		this.diagnostics = new ScribeDiagnosticsHandle(binding);
		for (const definition of definitions) {
			const native = binding.createBundle(compileBundleOptions(definition, transport));
			const active = activeNativeApi(native, boundary, definition.id);
			this.bundleById.set(definition.id, { definition, native, active });
		}
	}

	bundles(): ReadonlyArray<ScribeInstalledBundle> {
		const bundles = new Array<ScribeInstalledBundle>();
		for (const [, bundle] of this.bundleById) bundles.push(bundle);
		return bundles;
	}

	bundle(dataId: string): ScribeInstalledBundle | undefined {
		return this.bundleById.get(dataId);
	}

	requireBundle(dataId: string): ScribeInstalledBundle {
		const bundle = this.bundleById.get(dataId);
		assert(bundle !== undefined, `[rovy/scribe] unknown data definition id '${dataId}'`);
		return bundle;
	}

	handle(kind: ScribeDataParamKind, dataId: string): ScribeRuntimeHandle | object {
		const key = `${kind}:${dataId}`;
		let handle = this.handles.get(key);
		if (handle !== undefined) return handle;
		const bundle = this.requireBundle(dataId);
		handle = kind === "client-state"
			? {
					kind,
					dataId,
					definition: bundle.definition.publicToken,
					runtime: this,
					ready: false,
					serviceStatus: this.binding.status(),
				}
			: {
					kind,
					dataId,
					definition: bundle.definition.publicToken,
					runtime: this,
				};
		this.handles.set(key, handle);
		return handle;
	}

	flush(_context: FlushContext): boolean {
		return false;
	}
}

function compileBundleOptions(
	definition: RuntimeScribeDataDefinition,
	transport?: ScribeTransport,
): CompiledScribeBundleOptions {
	const options: Record<string, unknown> = {
		Template: definition.template,
		ProfileStoreIndex: definition.profileStoreIndex,
		ProfileKeyPrefix: definition.profileKeyPrefix,
		TransportChannel:
			definition.options?.transportChannel ??
			`@rovy/scribe:${definition.id}`,
	};
	if (transport !== undefined) options.Transport = transport;
	return options;
}

function activeNativeApi(
	bundle: NativeScribeBundle,
	boundary: ScribeRuntimeBoundary,
	dataId: string,
): object {
	const key = boundary === "client" ? "Client" : "Server";
	const active = (bundle as Record<string, unknown>)[key];
	assert(
		typeIs(active, "table"),
		`[rovy/scribe] native bundle '${dataId}' has no ${key} API`,
	);
	return active as object;
}
