import type { Ctor } from "@rovy/core";
import type { NetEventOptions, NetEventReg, NetFunctionOptions, NetFunctionReg, NetRuntimeConfig } from "./types";

const noop = (_ctor: Ctor): void => {};

/**
 * Marks a Rovy event as network-transportable. The transformer rewrites this
 * to `rovy.__event(...)` + `rovyNet.__netEvent(...)`; the decorator itself is
 * a no-op at runtime.
 */
export function netEvent(_options: NetEventOptions): (ctor: Ctor) => void {
	return noop;
}

/**
 * Marks a client→server request class as a non-blocking remote function. The
 * transformer registers metadata and rewrites NetClient.call sites with stable
 * compile-time ids; the decorator itself is a no-op at runtime.
 */
export function netFunction(_options: NetFunctionOptions): (ctor: Ctor) => void {
	return noop;
}

export const rovyNet = {
	registry: new Array<NetEventReg>(),
	functions: new Array<NetFunctionReg>(),
	runtimeConfig: {
		transport: "blink",
		strictBoundaryChecks: true,
	} as NetRuntimeConfig,

	__netEvent(ctor: Ctor, meta: Omit<NetEventReg, "ctor">): void {
		this.registry.push({ ctor, ...meta });
	},

	__netFunction(ctor: Ctor, meta: Omit<NetFunctionReg, "ctor">): void {
		this.functions.push({ ctor, ...meta });
	},

	__configureRuntime(config: Partial<NetRuntimeConfig>): void {
		this.runtimeConfig = {
			transport: config.transport ?? this.runtimeConfig.transport,
			strictBoundaryChecks: config.strictBoundaryChecks ?? this.runtimeConfig.strictBoundaryChecks,
		};
	},

	__reset(): void {
		while (this.registry.size() > 0) this.registry.pop();
		while (this.functions.size() > 0) this.functions.pop();
		this.runtimeConfig = {
			transport: "blink",
			strictBoundaryChecks: true,
		};
	},

	/** Look up registered metadata by wire name. */
	byName(name: string): NetEventReg | undefined {
		for (const entry of this.registry) {
			if (entry.name === name) return entry;
		}
		return undefined;
	},

	/** Look up registered metadata by event constructor. */
	byCtor(ctor: Ctor): NetEventReg | undefined {
		for (const entry of this.registry) {
			if (entry.ctor === ctor) return entry;
		}
		return undefined;
	},

	functionByName(name: string): NetFunctionReg | undefined {
		for (const entry of this.functions) {
			if (entry.name === name || entry.requestName === name || entry.resultWireName === name) return entry;
		}
		return undefined;
	},

	functionByCtor(ctor: Ctor): NetFunctionReg | undefined {
		for (const entry of this.functions) {
			if (entry.ctor === ctor) return entry;
		}
		return undefined;
	},
};
