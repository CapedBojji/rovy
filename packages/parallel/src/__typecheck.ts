import type { Entity } from "@rovy/core";
import type { BatchWriter, JobReader, JobWriter } from "./index";
import type { JobDefinition, JobOutput } from "./worker";

type Example = JobDefinition<[Vector3, number], boolean>;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
type InputContract = Assert<Equal<Parameters<BatchWriter<Example>["push"]>, [Entity, Vector3, number]>>;
type OutputContract = Assert<Equal<JobOutput<Example>, boolean>>;
// Compile-only contract. Never invoked by package runtime.
function check(writer: JobWriter<Example>, reader: JobReader<Example>, entity: Entity) {
	writer.tryBatch((batch) => {
		batch.push(entity, Vector3.zero, 1);
	});
	reader.drain((target, value) => {
		const output: boolean = value;
		const handle: Entity = target;
	});
}
