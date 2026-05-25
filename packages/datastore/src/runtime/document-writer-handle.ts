import type { DocumentSaveOptions, DocumentUpdateOptions, DocumentUpdateResult } from "../types";
import type { DataStoreRuntime } from "./data-store-runtime";
import { DocumentReaderHandle } from "./document-reader-handle";

export class DocumentWriterHandle<T = unknown> extends DocumentReaderHandle<T> {
	constructor(runtime: DataStoreRuntime, documentId: string) {
		super(runtime, documentId);
	}

	update(owner: unknown, transform: (data: T) => T, options?: DocumentUpdateOptions): DocumentUpdateResult {
		return this.runtime.update(this.documentId, owner, transform, options);
	}

	patch(owner: unknown, patch: Partial<T>, options?: DocumentUpdateOptions): DocumentUpdateResult {
		return this.runtime.patch<T & object>(this.documentId, owner, patch as Partial<T & object>, options);
	}

	save(owner: unknown, options?: DocumentSaveOptions): void {
		this.runtime.enqueueSave(this.documentId, owner, options);
	}
}
