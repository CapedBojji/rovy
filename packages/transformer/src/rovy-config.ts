import fs from "node:fs";

export interface TransformerConfigInput {
	readonly [key: string]: unknown;
}

export interface RovyBlinkConfig {
	readonly enabled?: boolean;
	readonly remoteScope?: string;
	readonly manualReplication?: boolean;
	readonly usePolling?: boolean;
}

export interface RovyNetConfig {
	readonly strictBoundaryChecks?: boolean;
	readonly transport?: "blink" | "remote";
	readonly blink?: RovyBlinkConfig;
}

export interface RovyEditorConfig {
	readonly runtimeTypeChecks?: boolean;
}

export interface RovyEnvironmentConfig {
	readonly debug?: boolean;
	readonly rojo?: string;
	readonly sourcemap?: string;
	readonly boundaries?: {
		readonly server?: ReadonlyArray<string>;
		readonly client?: ReadonlyArray<string>;
		readonly shared?: ReadonlyArray<string>;
	};
	readonly editor?: RovyEditorConfig;
	readonly net?: RovyNetConfig;
}

interface MutableRovyEnvironmentConfig {
	debug?: boolean;
	rojo?: string;
	sourcemap?: string;
	boundaries?: RovyEnvironmentConfig["boundaries"];
	editor?: RovyEditorConfig;
	net?: RovyNetConfig;
}

export interface RovyConfigFile {
	readonly $schema?: string;
	readonly current?: string;
	readonly environments?: Record<string, RovyEnvironmentConfig>;
}

export interface ResolvedRovyConfig {
	readonly path?: string;
	readonly rootDirectory: string;
	readonly environmentName?: string;
	readonly environment: RovyEnvironmentConfig;
}

export function loadRovyConfig(
	currentDirectory: string,
	config: TransformerConfigInput,
	helpers: {
		readonly absolute: (value: string) => string;
		readonly exists?: (path: string) => boolean;
	} = { absolute: (value) => value },
): ResolvedRovyConfig | undefined {
	const exists = helpers.exists ?? ((path: string) => fs.existsSync(path));
	const configPathValue =
		typeof config.config === "string"
			? config.config
			: exists(helpers.absolute(".rovy.json"))
				? ".rovy.json"
				: undefined;

	if (configPathValue) {
		const path = helpers.absolute(configPathValue);
		const raw = JSON.parse(fs.readFileSync(path, "utf8")) as RovyConfigFile;
		const environments = raw.environments ?? {};
		const envName =
			(typeof process !== "undefined" ? process.env.ROVY_ENV : undefined) ??
			raw.current ??
			Object.keys(environments)[0];
		const environment = (envName ? environments[envName] : undefined) ?? {};
		return {
			path,
			rootDirectory: currentDirectory,
			environmentName: envName,
			environment,
		};
	}

	const legacyEnvironment: MutableRovyEnvironmentConfig = {};
	if (typeof config.debug === "boolean") legacyEnvironment.debug = config.debug;
	if (typeof config.rojo === "string") legacyEnvironment.rojo = config.rojo;
	if (typeof config.sourcemap === "string") legacyEnvironment.sourcemap = config.sourcemap;
	if (
		legacyEnvironment.debug === undefined &&
		legacyEnvironment.rojo === undefined &&
		legacyEnvironment.sourcemap === undefined &&
		config.boundaries === undefined &&
		config.editor === undefined &&
		config.runtimeTypeChecks === undefined &&
		config.net === undefined
	) {
		return undefined;
	}

	if (isRecord(config.editor)) {
		legacyEnvironment.editor = {
			runtimeTypeChecks:
				typeof config.editor.runtimeTypeChecks === "boolean"
					? config.editor.runtimeTypeChecks
					: undefined,
		};
	}
	if (typeof config.runtimeTypeChecks === "boolean") {
		legacyEnvironment.editor = {
			...legacyEnvironment.editor,
			runtimeTypeChecks: config.runtimeTypeChecks,
		};
	}
	if (isRecord(config.boundaries)) {
		legacyEnvironment.boundaries = {
			server: asStringArray(config.boundaries.server),
			client: asStringArray(config.boundaries.client),
			shared: asStringArray(config.boundaries.shared),
		};
	}
	if (isRecord(config.net)) {
		legacyEnvironment.net = {
			strictBoundaryChecks:
				typeof config.net.strictBoundaryChecks === "boolean" ? config.net.strictBoundaryChecks : undefined,
			transport: config.net.transport === "remote" ? "remote" : config.net.transport === "blink" ? "blink" : undefined,
			blink: isRecord(config.net.blink)
				? {
						enabled: typeof config.net.blink.enabled === "boolean" ? config.net.blink.enabled : undefined,
						remoteScope: typeof config.net.blink.remoteScope === "string" ? config.net.blink.remoteScope : undefined,
						manualReplication:
							typeof config.net.blink.manualReplication === "boolean"
								? config.net.blink.manualReplication
								: undefined,
						usePolling:
							typeof config.net.blink.usePolling === "boolean" ? config.net.blink.usePolling : undefined,
					}
				: undefined,
		};
	}
	return {
		rootDirectory: currentDirectory,
		environment: legacyEnvironment,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function asStringArray(value: unknown): ReadonlyArray<string> | undefined {
	if (!Array.isArray(value)) return undefined;
	return value.filter((item): item is string => typeof item === "string");
}
