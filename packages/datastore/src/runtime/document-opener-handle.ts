import type { DocumentCloseOptions, DocumentOpenOptions, DocumentStatus } from "../types";
import type { DataStoreRuntime } from "./data-store-runtime";

export class DocumentOpenerHandle {
	constructor(
		private readonly runtime: DataStoreRuntime,
		private readonly documentId: string,
	) {}

	open(owner: unknown, options?: DocumentOpenOptions): void {
		this.runtime.enqueueOpen(this.documentId, owner, options);
	}

	close(owner: unknown, options?: DocumentCloseOptions): void {
		this.runtime.enqueueClose(this.documentId, owner, options);
	}

	reopen(owner: unknown, options?: DocumentOpenOptions): void {
		this.runtime.reopen(this.documentId, owner, options);
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
