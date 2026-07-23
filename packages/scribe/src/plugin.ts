import type { App } from "@rovy/core";
import type {
	AnyScribeData,
	ScribeFullSchema,
	ScribePersistedShape,
} from "./definitions";
import type { ScribeNativeModule, ScribeSerializable, ScribeTransport } from "./types";
import type { ScribeReadTree, ScribeWriteTree } from "./trees";

export interface ScribeProcessConfiguration {
	readonly autoSaveInterval?: number;
}

export type ScribeModuleResolver = () => ModuleScript | ScribeNativeModule | undefined;

export interface ScribePluginOptions {
	readonly module?: ModuleScript | ScribeNativeModule;
	readonly resolveModule?: ScribeModuleResolver;
	readonly configure?: ScribeProcessConfiguration;
	readonly transport?: ScribeTransport;
	readonly strict?: boolean;
}

export type ScribeImmediateTree<D extends AnyScribeData> =
	& ScribeReadTree<ScribeFullSchema<D>>
	& ScribeWriteTree<ScribeFullSchema<D>>;

export interface ScribeMigration<D extends AnyScribeData> {
	readonly version: number;
	readonly migrate: (data: ScribePersistedShape<D>) => ScribePersistedShape<D>;
}

export interface ScribeProductGrantContext<D extends AnyScribeData> {
	readonly player: Player;
	readonly data: ScribeImmediateTree<D>;
	readonly receiptId: string;
}

export interface ScribeServerSetup<D extends AnyScribeData> {
	readonly migrations?: ReadonlyArray<ScribeMigration<D>>;
	readonly onPlayerInit?: (player: Player, data: ScribeImmediateTree<D>, isNewProfile: boolean) => void;
	readonly productGrants?: Readonly<Record<string, (context: ScribeProductGrantContext<D>) => void>>;
	readonly economy?: {
		readonly resolve?: (player: Player) => Readonly<Record<string, ScribeSerializable>>;
		readonly currencyResolve?: Readonly<
			Record<string, (player: Player) => Readonly<Record<string, ScribeSerializable>>>
		>;
		readonly logEconomyEvent?: (...args: ReadonlyArray<ScribeSerializable>) => void;
	};
	readonly profileStore?: unknown;
}

export interface ConfiguredScribeServer<D extends AnyScribeData> {
	readonly definition: D;
	readonly setup: ScribeServerSetup<D>;
}

export declare function configureScribeServer<D extends AnyScribeData>(
	definition: D,
	setup: ScribeServerSetup<D>,
): ConfiguredScribeServer<D>;

export interface ScribeServerPluginOptions extends ScribePluginOptions {
	readonly bundles?: ReadonlyArray<ConfiguredScribeServer<AnyScribeData>>;
}

export interface ScribeClientPluginOptions extends ScribePluginOptions {}

export declare class ScribePlugin {
	constructor(options?: ScribePluginOptions);
	build(app: App): void;
}

export declare class ScribeClientPlugin {
	constructor(options?: ScribeClientPluginOptions);
	build(app: App): void;
}

export declare class ScribeServerPlugin {
	constructor(options?: ScribeServerPluginOptions);
	build(app: App): void;
}

export declare function scribeVersion(): string;
