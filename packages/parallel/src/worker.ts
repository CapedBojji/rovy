/** Worker-safe definitions. This entry point never imports @rovy/core. */
export type Columns<I extends readonly unknown[]> = { readonly [K in keyof I]: ReadonlyArray<I[K]> };
export interface JobInput<I extends readonly unknown[]> {
	readonly columns: Columns<I>;
	readonly count: number;
}
export interface JobOptions<I extends readonly unknown[], O, S> {
	/** @internal Injected by rovy-transformer; never author these fields. */
	readonly __id?: string;
	/** @internal */
	readonly __module?: ModuleScript;
	/** @internal */
	readonly __exportName?: string;
	/** @internal */
	readonly __inputCount?: number;
	/** Serial worker initialization; must return without yielding. */
	setup?(): S;
	run(input: JobInput<I>, output: Array<O>, state: S): void;
	/** Run batches smaller than this locally. Disabled by default. */
	readonly serialBelow?: number;
}
export interface JobDefinition<I extends readonly unknown[], O, S = undefined> extends JobOptions<I, O, S> {
	readonly __id: string;
	readonly __module: ModuleScript;
	readonly __exportName: string;
	readonly __inputCount: number;
}
// Erased registration type. Consumers retain the concrete definition type.
export type AnyJob = JobDefinition<any, any, any>;
export type JobInputs<J> = J extends JobDefinition<infer I, any, any> ? I : never;
export type JobOutput<J> = J extends JobDefinition<any, infer O, any> ? O : never;

export function job<I extends readonly unknown[], O, S = undefined>() {
	return (options: JobOptions<I, O, S>): JobDefinition<I, O, S> => {
		const definition = options as JobDefinition<I, O, S>;
		assert(definition.__id !== undefined && definition.__module !== undefined,
			"[rovy/parallel] job() needs rovy-transformer; use an exported const in a .job.ts module");
		return table.freeze(definition);
	};
}
