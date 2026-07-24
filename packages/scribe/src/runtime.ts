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
import {
	createScribeInitializationTree,
	createScribeNativeImmediateTree,
} from "./immediate-tree";
import {
	createScribeReadTree,
	ScribeClientStateRuntime,
	ScribeServerReaderRuntime,
	ScribeSharedReaderRuntime,
	type ScribeReadRevisionSource,
} from "./reader-tree";
import {
	ScribeWriteQueue,
	type ScribeWriteFailure,
} from "./write-queue";
import {
	createScribeLocalWriterRuntime,
	ScribeServerWriterRuntime,
} from "./writer-runtime";
import {
	ScribeEventRuntime,
	type ScribeEventRoute,
} from "./event-runtime";
import {
	ScribeCommandRuntime,
	type ScribeCommandPlan,
} from "./command-runtime";
import {
	ScribeJobRuntime,
} from "./job-runtime";
import {
	ScribePersistenceRuntime,
} from "./persistence";
import {
	ScribeMessagingRuntime,
} from "./messaging";
import {
	ScribeUnsafeRuntime,
} from "./unsafe";
import {
	ScribeLeaderboardsRuntime,
} from "./leaderboards";
import {
	ScribeMonetizationRuntime,
} from "./monetization";
import {
	ScribeOwnershipRuntime,
} from "./ownership";
import {
	ScribeReceiptsRuntime,
} from "./receipts";
import {
	ScribeCooldownsRuntime,
} from "./cooldowns";
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

export interface ScribeRuntimeServerSetup {
	readonly migrations?: ReadonlyArray<{
		readonly version: number;
		readonly migrate: (data: unknown) => unknown;
	}>;
	readonly onPlayerInit?: (
		player: Player,
		data: object,
		isNewProfile: boolean,
	) => void;
	readonly productGrants?: Readonly<Record<string, (context: {
		readonly data: object;
	}) => void>>;
	readonly economy?: {
		readonly resolve?: (player: Player) => Readonly<Record<string, unknown>>;
		readonly currencyResolve?: Readonly<
			Record<string, (player: Player) => Readonly<Record<string, unknown>>>
		>;
		readonly logEconomyEvent?: (...args: ReadonlyArray<unknown>) => void;
	};
	readonly profileStore?: unknown;
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
	private readonly writeQueue: ScribeWriteQueue;
	private readonly eventRuntime: ScribeEventRuntime;
	private readonly commandRuntime: ScribeCommandRuntime;
	private readonly jobRuntime: ScribeJobRuntime;
	private readonly writeFailures = new Array<ScribeWriteFailure>();
	private applyingWrites = false;
	private readRevision = 0;
	private readonly revisions: ScribeReadRevisionSource = {
		revision: () => this.readRevision,
	};

	constructor(
		readonly boundary: ScribeRuntimeBoundary,
		readonly binding: ScribeBinding,
		definitions: ReadonlyArray<RuntimeScribeDataDefinition>,
		transport?: ScribeTransport,
		serverSetups?: ReadonlyMap<string, ScribeRuntimeServerSetup>,
		eventRoutes: ReadonlyArray<ScribeEventRoute> = [],
		commandPlans: ReadonlyArray<ScribeCommandPlan> = [],
	) {
		this.diagnostics = new ScribeDiagnosticsHandle(binding);
		this.writeQueue = new ScribeWriteQueue(
			boundary,
			(dataId) => this.requireBundle(dataId),
		);
		for (const definition of definitions) {
			const native = binding.createBundle(
				compileBundleOptions(
					binding,
					definition,
					transport,
					serverSetups?.get(definition.id),
				),
			);
			const active = activeNativeApi(native, boundary, definition.id);
			this.bundleById.set(definition.id, { definition, native, active });
		}
		this.eventRuntime = new ScribeEventRuntime(
			boundary,
			binding,
			this.bundles(),
			eventRoutes,
			(dataId) => this.changeSource(dataId),
		);
		this.jobRuntime = new ScribeJobRuntime(
			boundary,
			this.bundles(),
			this.eventRuntime,
		);
		this.commandRuntime = new ScribeCommandRuntime(
			boundary,
			this.bundles(),
			commandPlans,
			this.writeQueue,
			this.eventRuntime,
		);
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
		switch (kind) {
			case "client-reader":
				handle = createScribeReadTree(
					bundle.definition.template,
					bundle.active,
					this.revisions,
					"client",
				);
				break;
			case "client-state":
				handle = new ScribeClientStateRuntime(
					bundle.definition.publicToken,
					bundle.active,
					() => this.binding.status(),
				);
				break;
			case "local-writer":
				handle = createScribeLocalWriterRuntime(
					dataId,
					bundle.definition.template,
					this.writeQueue,
				);
				break;
			case "shared-reader":
				handle = new ScribeSharedReaderRuntime(
					bundle.definition.template,
					bundle.active,
					this.revisions,
				);
				break;
			case "server-reader":
				handle = new ScribeServerReaderRuntime(
					bundle.definition.template,
					bundle.active,
					this.revisions,
				);
				break;
			case "server-writer":
				handle = new ScribeServerWriterRuntime(
					dataId,
					bundle.definition.template,
					this.writeQueue,
					(player) =>
						this.eventRuntime.trackServerPlayer(dataId, player),
				);
				break;
			case "persistence":
				this.assertBoundary("server", "ScribePersistence");
				handle = new ScribePersistenceRuntime(
					bundle.definition,
					bundle.active,
					this.jobRuntime,
					this.binding.module,
				);
				break;
			case "leaderboards":
				handle = new ScribeLeaderboardsRuntime(
					bundle.definition.publicToken,
					this.boundary,
					bundle.active,
				);
				break;
			case "monetization":
				handle = new ScribeMonetizationRuntime(
					bundle.definition,
					this.boundary,
					bundle.active,
					this.jobRuntime,
					this.writeQueue,
				);
				break;
			case "ownership":
				handle = new ScribeOwnershipRuntime(
					bundle.definition.publicToken,
					this.boundary,
					bundle.active,
					this.jobRuntime,
					this.writeQueue,
				);
				break;
			case "receipts":
				this.assertBoundary("server", "ScribeReceipts");
				handle = new ScribeReceiptsRuntime(
					bundle.definition.publicToken,
					this.boundary,
					bundle.active,
					this.jobRuntime,
				);
				break;
			case "cooldowns":
				this.assertBoundary("server", "ScribeCooldowns");
				handle = new ScribeCooldownsRuntime(
					bundle.definition.publicToken,
					this.boundary,
					bundle.active,
					this.jobRuntime,
					this.writeQueue,
				);
				break;
			case "messaging":
				this.assertBoundary("server", "ScribeMessaging");
				handle = new ScribeMessagingRuntime(
					bundle.definition.publicToken,
					bundle.active,
					this.jobRuntime,
				);
				break;
			case "unsafe":
				handle = new ScribeUnsafeRuntime(
					bundle.definition.publicToken,
					this.binding,
					bundle.native,
					this.boundary,
				);
				break;
			default:
				handle = {
					kind,
					dataId,
					definition: bundle.definition.publicToken,
					runtime: this,
				};
		}
		this.handles.set(key, handle);
		return handle;
	}

	hasCommandPlan(commandId: string): boolean {
		return this.commandRuntime.hasPlan(commandId);
	}

	commandClient(commandId: string): object {
		return this.commandRuntime.clientFacade(commandId);
	}

	commandReader(commandId: string): object {
		return this.commandRuntime.serverReader(commandId);
	}

	commandResponder(): object {
		return this.commandRuntime.responder();
	}

	flush(context: FlushContext): boolean {
		const commandBefore = this.commandRuntime.flushBeforeWrites();
		this.applyingWrites = true;
		const [writeOk, wroteOrError] = pcall(() =>
			this.writeQueue.flush(),
		);
		this.applyingWrites = false;
		assert(writeOk, tostring(wroteOrError));
		const wrote = wroteOrError as boolean;
		const failures = this.writeQueue.drainFailures();
		for (const failure of failures) {
			this.writeFailures.push(failure);
			this.eventRuntime.recordWriteFailure(failure);
		}
		const commandAfter =
			this.commandRuntime.flushAfterWrites(failures);
		const jobs = this.jobRuntime.flushAfterWrites();
		this.readRevision += 1;
		for (const [, handle] of this.handles) {
			if (handle instanceof ScribeClientStateRuntime) handle.refresh();
		}
		const published = this.eventRuntime.flush(
			context,
			this.readRevision,
		);
		return commandBefore || wrote || commandAfter || jobs || published;
	}

	drainWriteFailures(): ReadonlyArray<ScribeWriteFailure> {
		const failures = new Array<ScribeWriteFailure>();
		while (this.writeFailures.size() > 0) {
			failures.push(this.writeFailures.shift()!);
		}
		return failures;
	}

	private changeSource(dataId: string): import("./events").ScribeChangeSource {
		if (this.boundary === "server") return "serverWrite";
		if (this.applyingWrites) return "clientLocalWrite";
		const active = this.bundleById.get(dataId)?.active as
			| Record<string, unknown>
			| undefined;
		const isReady = active?.IsReady;
		if (
			typeIs(isReady, "function") &&
			!(isReady as () => boolean)()
		) {
			return "initialSnapshot";
		}
		return "replication";
	}

	private assertBoundary(
		expected: ScribeRuntimeBoundary,
		service: string,
	): void {
		assert(
			this.boundary === expected,
			`[rovy/scribe] ${service} is only available on the ${expected}`,
		);
	}
}

function compileBundleOptions(
	binding: ScribeBinding,
	definition: RuntimeScribeDataDefinition,
	transport?: ScribeTransport,
	setup?: ScribeRuntimeServerSetup,
): CompiledScribeBundleOptions {
	const options: Record<string, unknown> = {
		...definition.options,
		Template: binding.compileTemplate(definition.template),
		ProfileStoreIndex: definition.profileStoreIndex,
		ProfileKeyPrefix: definition.profileKeyPrefix,
		TransportChannel:
			definition.options?.TransportChannel ??
			definition.options?.transportChannel ??
			`@rovy/scribe:${definition.id}`,
	};
	if (transport !== undefined) options.Transport = transport;
	if (setup !== undefined) {
		applyServerSetup(options, setup, binding, definition.template);
	}
	return options;
}

function applyServerSetup(
	options: Record<string, unknown>,
	setup: ScribeRuntimeServerSetup,
	binding: ScribeBinding,
	template: object,
): void {
	if (setup.migrations !== undefined) {
		const migrations: Record<number, (data: unknown) => unknown> = {};
		for (const migration of setup.migrations) {
			migrations[migration.version] = (data) => {
				const migrated = migration.migrate(data);
				if (migrated !== data) {
					assert(
						typeIs(data, "table") && typeIs(migrated, "table"),
						`[rovy/scribe] migration ${migration.version} must return a data table`,
					);
					for (const [key] of pairs(data as Record<string, unknown>)) {
						(data as Record<string, unknown>)[key] = undefined;
					}
					for (const [key, value] of pairs(
						migrated as Record<string, unknown>,
					)) {
						(data as Record<string, unknown>)[key] = value;
					}
				}
				return data;
			};
		}
		options.Migrations = migrations;
	}
	if (setup.onPlayerInit !== undefined) {
		options.OnPlayerInit = (
			player: Player,
			rawData: object,
			isNewProfile: boolean,
		) => {
			setup.onPlayerInit!(
				player,
				createScribeInitializationTree(
					template,
					rawData,
					binding.module,
				),
				isNewProfile,
			);
		};
	}
	if (setup.profileStore !== undefined) options.ProfileStore = setup.profileStore;
	if (setup.productGrants !== undefined) {
		const authored = (options.Products ?? {}) as Readonly<
			Record<string, Readonly<Record<string, unknown>>>
		>;
		const products: Record<string, Record<string, unknown>> = {};
		for (const [name, product] of pairs(authored)) {
			products[name] = { ...product };
		}
		for (const [name, grant] of pairs(setup.productGrants)) {
			const product = products[name] ?? {};
			product.Grant = (data: object) =>
				grant({
					data: createScribeNativeImmediateTree(template, data),
				});
			products[name] = product;
		}
		options.Products = products;
	}
	if (setup.economy !== undefined) {
		const economy = {
			...((options.Economy ?? {}) as Record<string, unknown>),
		};
		if (setup.economy.resolve !== undefined) {
			economy.Resolve = setup.economy.resolve;
		}
		if (setup.economy.logEconomyEvent !== undefined) {
			economy.LogEconomyEvent = setup.economy.logEconomyEvent;
		}
		if (setup.economy.currencyResolve !== undefined) {
			const currencies = {
				...((economy.Currencies ?? {}) as Record<
					string,
					Record<string, unknown>
				>),
			};
			for (const [name, resolve] of pairs(setup.economy.currencyResolve)) {
				currencies[name] = {
					...(currencies[name] ?? {}),
					Resolve: resolve,
				};
			}
			economy.Currencies = currencies;
		}
		options.Economy = economy;
	}
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
