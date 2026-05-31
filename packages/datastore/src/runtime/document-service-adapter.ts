import type {
	DocumentCloseOptions,
	DocumentFailureReason,
	DocumentOpenOptions,
	RuntimeDocumentDef,
} from "../types";

export interface DocumentStoreHandle<T = unknown> {
	readonly def: RuntimeDocumentDef<T>;
}

export interface DocumentHandle<T = unknown> {
	readonly store: DocumentStoreHandle<T>;
	readonly key: string;
}

export type DocumentBackendResult<T = unknown> =
	| {
			readonly success: true;
			readonly data?: T;
	  }
	| {
			readonly success: false;
			readonly reason: DocumentFailureReason;
			readonly message?: string;
	  };

export interface DocumentSignalSink<T> {
	readonly opened?: (result: DocumentBackendResult<T>) => void;
	readonly closed?: (result: DocumentBackendResult<T>) => void;
	readonly cacheChanged?: (data: T) => void;
	readonly saved?: (result: DocumentBackendResult<T>) => void;
}

export interface DocumentServiceAdapter {
	createStore<T>(def: RuntimeDocumentDef<T>): DocumentStoreHandle<T>;
	getDocument<T>(store: DocumentStoreHandle<T>, key: string): DocumentHandle<T>;
	open<T>(document: DocumentHandle<T>, options: DocumentOpenOptions): DocumentBackendResult<T>;
	steal<T>(document: DocumentHandle<T>): void;
	close<T>(document: DocumentHandle<T>, options: DocumentCloseOptions): DocumentBackendResult<T | undefined>;
	getCache<T>(document: DocumentHandle<T>): T;
	setCache<T>(document: DocumentHandle<T>, data: T): void;
	save<T>(document: DocumentHandle<T>): DocumentBackendResult<T>;
	connectSignals<T>(document: DocumentHandle<T>, sink: DocumentSignalSink<T>): () => void;
}

export type MockDocumentData = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

export interface MockDocumentServiceAdapterOptions {
	/** Initial mock contents by document id, then resolved datastore key. */
	readonly data?: MockDocumentData;
}

interface MemoryEntry<T> {
	data: T;
	open: boolean;
	locked: boolean;
}

class MemoryDocumentStore<T> implements DocumentStoreHandle<T> {
	readonly entries = new Map<string, MemoryEntry<T>>();

	constructor(readonly def: RuntimeDocumentDef<T>) {}
}

class MemoryDocument<T> implements DocumentHandle<T> {
	constructor(
		readonly store: MemoryDocumentStore<T>,
		readonly key: string,
	) {}
}

/** Runtime-only mock backend. Keeps data in memory and never calls Roblox datastore APIs. */
export class MockDocumentServiceAdapter implements DocumentServiceAdapter {
	private readonly stores = new Map<string, MemoryDocumentStore<unknown>>();

	constructor(private readonly options: MockDocumentServiceAdapterOptions = {}) {}

	createStore<T>(def: RuntimeDocumentDef<T>): DocumentStoreHandle<T> {
		let store = this.stores.get(def.id) as MemoryDocumentStore<T> | undefined;
		if (store === undefined) {
			store = new MemoryDocumentStore(def);
			this.seedStore(store);
			this.stores.set(def.id, store as MemoryDocumentStore<unknown>);
		}
		return store;
	}

	getDocument<T>(store: DocumentStoreHandle<T>, key: string): DocumentHandle<T> {
		return new MemoryDocument(store as MemoryDocumentStore<T>, key);
	}

	open<T>(document: DocumentHandle<T>, options: DocumentOpenOptions): DocumentBackendResult<T> {
		const memory = document as MemoryDocument<T>;
		let entry = memory.store.entries.get(memory.key);
		if (entry === undefined) {
			const data = memory.store.def.default();
			entry = { data, open: false, locked: false };
			memory.store.entries.set(memory.key, entry);
		}
		if (entry.locked && options.stealOnSessionLocked !== true) {
			return { success: false, reason: "SessionLockedError" };
		}
		entry.open = true;
		entry.locked = memory.store.def.session.lock;
		return { success: true, data: entry.data };
	}

	steal<T>(document: DocumentHandle<T>): void {
		const memory = document as MemoryDocument<T>;
		const entry = memory.store.entries.get(memory.key);
		if (entry !== undefined) entry.locked = false;
	}

	close<T>(document: DocumentHandle<T>, _options: DocumentCloseOptions): DocumentBackendResult<T | undefined> {
		const entry = (document as MemoryDocument<T>).store.entries.get(document.key);
		if (entry === undefined || !entry.open) return { success: false, reason: "NotOpen" };
		entry.open = false;
		entry.locked = false;
		return { success: true, data: entry.data };
	}

	getCache<T>(document: DocumentHandle<T>): T {
		const entry = (document as MemoryDocument<T>).store.entries.get(document.key);
		assert(entry !== undefined && entry.open, "[rovy/datastore] GetCache before document open.");
		return entry.data;
	}

	setCache<T>(document: DocumentHandle<T>, data: T): void {
		const entry = (document as MemoryDocument<T>).store.entries.get(document.key);
		assert(entry !== undefined && entry.open, "[rovy/datastore] SetCache before document open.");
		entry.data = data;
	}

	save<T>(document: DocumentHandle<T>): DocumentBackendResult<T> {
		const entry = (document as MemoryDocument<T>).store.entries.get(document.key);
		if (entry === undefined || !entry.open) return { success: false, reason: "NotOpen" };
		return { success: true, data: entry.data };
	}

	connectSignals<T>(_document: DocumentHandle<T>, _sink: DocumentSignalSink<T>): () => void {
		return () => {};
	}

	private seedStore<T>(store: MemoryDocumentStore<T>): void {
		const rows = this.options.data?.[store.def.id];
		if (rows === undefined) return;
		for (const [key, data] of pairs(rows as Record<string, T>)) {
			store.entries.set(key, { data, open: false, locked: false });
		}
	}
}

/**
 * Back-compat alias for older tests/imports. Prefer MockDocumentServiceAdapter
 * when intentionally avoiding real backend calls.
 */
export class InMemoryDocumentServiceAdapter extends MockDocumentServiceAdapter {}
