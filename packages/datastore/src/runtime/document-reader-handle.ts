import type { DocumentStatus, ReadonlyDeep } from "../types";
import type { DataStoreRuntime } from "./data-store-runtime";

export class DocumentReaderHandle<T = unknown> {
	constructor(
		protected readonly runtime: DataStoreRuntime,
		protected readonly documentId: string,
	) {}

	get(owner: unknown): ReadonlyDeep<T> | undefined {
		return this.runtime.get<T>(this.documentId, owner) as ReadonlyDeep<T> | undefined;
	}

	require(owner: unknown): ReadonlyDeep<T> {
		return this.runtime.require<T>(this.documentId, owner) as ReadonlyDeep<T>;
	}

	has(owner: unknown): boolean {
		return this.get(owner) !== undefined;
	}

	status(owner: unknown): DocumentStatus {
		return this.runtime.status(this.documentId, owner);
	}

	isOpen(owner: unknown): boolean {
		return this.runtime.isOpen(this.documentId, owner);
	}

	keyOf(owner: unknown): string {
		return this.runtime.keyOf(this.documentId, owner);
	}
}
