import type { NetEventReg } from "./types";

export type NetPayload = Record<string, unknown>;

/**
 * Generic, reflection-free codec. `@netEvent` fields are value types (the
 * transformer enforces serializable constructor params), so a flat
 * field-name → value table round-trips through any transport. No per-event
 * hand-written glue is required.
 */
export const NetCodec = {
	/** Class instance → flat payload table keyed by registered field names. */
	encode(meta: NetEventReg, event: object): NetPayload {
		const source = event as Record<string, unknown>;
		const payload: NetPayload = {};
		for (const field of meta.fields) {
			payload[field] = source[field];
		}
		return payload;
	},

	/** Payload table → new event instance via the registered constructor. */
	decode(meta: NetEventReg, payload: NetPayload): object {
		const args = new Array<defined>();
		for (const field of meta.fields) {
			args.push(payload[field] as defined);
		}
		const factory = meta.ctor as unknown as new (...rest: Array<defined>) => object;
		return new factory(...args);
	},
};
