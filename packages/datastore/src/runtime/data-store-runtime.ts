import type { EventRegistry } from "@rovy/core";
import type {
	DocumentCloseOptions,
	DocumentEventKind,
	DocumentFailureReason,
	DocumentOpenOptions,
	DocumentSaveOptions,
	DocumentStatus,
	DocumentUpdateOptions,
	DocumentUpdateResult,
	RuntimeDocumentDef,
} from "../types";
import { rovyData } from "../registry";
import type { DocumentHandle, DocumentServiceAdapter, DocumentStoreHandle } from "./document-service-adapter";
import { InMemoryDocumentServiceAdapter } from "./document-service-adapter";

interface DocumentSession<T = unknown> {
	readonly def: RuntimeDocumentDef<T>;
	readonly owner: unknown;
	readonly key: string;
	readonly document: DocumentHandle<T>;
	status: DocumentStatus;
	disconnectSignals?: () => void;
}

interface DocumentRequest {
	readonly documentId: string;
	readonly owner: unknown;
	readonly reason?: string;
}

interface DocumentOpenRequest extends DocumentRequest {
	readonly options?: DocumentOpenOptions;
}

interface DocumentCloseRequest extends DocumentRequest {
	readonly options?: DocumentCloseOptions;
}

interface DocumentSaveRequest extends DocumentRequest {
	readonly options?: DocumentSaveOptions;
}

export class DataStoreRuntime {
	readonly documentsById = new Map<string, RuntimeDocumentDef>();
	readonly storesByDocumentId = new Map<string, DocumentStoreHandle>();
	readonly sessionsByKey = new Map<string, DocumentSession>();
	readonly pendingOpens = new Array<DocumentOpenRequest>();
	readonly pendingCloses = new Array<DocumentCloseRequest>();
	readonly pendingImmediateSaves = new Array<DocumentSaveRequest>();

	constructor(
		documents: ReadonlyArray<RuntimeDocumentDef>,
		private readonly events: EventRegistry,
		private readonly adapter: DocumentServiceAdapter = new InMemoryDocumentServiceAdapter(),
	) {
		const stores = new Set<string>();
		for (const def of documents) {
			assert(!this.documentsById.has(def.id), `[rovy/datastore] Duplicate document id ${def.id}.`);
			assert(!stores.has(def.store), `[rovy/datastore] Duplicate DocumentStore for store ${def.store}. Stores must be centralized.`);
			stores.add(def.store);
			this.documentsById.set(def.id, def);
			this.storesByDocumentId.set(def.id, this.adapter.createStore(def));
			const defaultValue = def.default();
			assert(def.check(defaultValue), `[rovy/datastore] Document ${def.name} failed default validation.`);
		}
		this.connectPlayers();
	}

	keyOf(documentId: string, owner: unknown): string {
		const def = this.requireDef(documentId);
		return def.key(owner as never);
	}

	status(documentId: string, owner: unknown): DocumentStatus {
		return this.getSession(documentId, owner)?.status ?? "closed";
	}

	isOpen(documentId: string, owner: unknown): boolean {
		return this.status(documentId, owner) === "open";
	}

	get<T>(documentId: string, owner: unknown): T | undefined {
		const session = this.getSession<T>(documentId, owner);
		if (session === undefined || session.status !== "open") return undefined;
		return this.adapter.getCache(session.document);
	}

	require<T>(documentId: string, owner: unknown): T {
		const value = this.get<T>(documentId, owner);
		assert(value !== undefined, `[rovy/datastore] DocumentReader.require called before document opened for ${this.keyOf(documentId, owner)}.`);
		return value;
	}

	enqueueOpen(documentId: string, owner: unknown, options?: DocumentOpenOptions): void {
		this.pendingOpens.push({ documentId, owner, options, reason: options?.reason });
	}

	enqueueClose(documentId: string, owner: unknown, options?: DocumentCloseOptions): void {
		this.pendingCloses.push({ documentId, owner, options, reason: options?.reason });
	}

	enqueueSave(documentId: string, owner: unknown, options?: DocumentSaveOptions): void {
		this.pendingImmediateSaves.push({ documentId, owner, options, reason: options?.reason });
	}

	reopen(documentId: string, owner: unknown, options?: DocumentOpenOptions): void {
		this.enqueueClose(documentId, owner, { save: true, reason: options?.reason });
		this.enqueueOpen(documentId, owner, options);
	}

	update<T>(
		documentId: string,
		owner: unknown,
		transform: (data: T) => T,
		options?: DocumentUpdateOptions,
	): DocumentUpdateResult {
		const def = this.requireDef<T>(documentId);
		const session = this.getSession<T>(documentId, owner);
		if (session === undefined) return { success: false, reason: "NotOpen" };
		if (session.status === "closed" || session.status === "closing") return { success: false, reason: "Closed" };
		if (session.status !== "open") return { success: false, reason: "NotOpen" };
		const before = this.adapter.getCache(session.document);
		const after = transform(before);
		if (!def.check(after)) {
			return { success: false, reason: "ValidationError", message: `${def.name} update returned invalid data.` };
		}
		this.adapter.setCache(session.document, after);
		this.emit("changed", def as RuntimeDocumentDef, {
			document: def.publicToken,
			key: session.key,
			owner,
			before,
			after,
			reason: options?.reason,
		});
		if (options?.save === "immediate") this.enqueueSave(documentId, owner, { reason: options.reason });
		return { success: true, status: "updated" };
	}

	patch<T extends object>(documentId: string, owner: unknown, patch: Partial<T>, options?: DocumentUpdateOptions): DocumentUpdateResult {
		return this.update<T>(
			documentId,
			owner,
			(data) => ({
				...(data as object),
				...(patch as object),
			}) as T,
			options,
		);
	}

	processQueues(): void {
		this.processOpenRequests();
		this.processCloseRequests();
		this.processSaveRequests();
	}

	processOpenRequests(): void {
		while (this.pendingOpens.size() > 0) {
			const request = this.pendingOpens.shift()!;
			this.executeOpen(request);
		}
	}

	processCloseRequests(): void {
		while (this.pendingCloses.size() > 0) {
			const request = this.pendingCloses.shift()!;
			this.executeClose(request);
		}
	}

	processSaveRequests(): void {
		while (this.pendingImmediateSaves.size() > 0) {
			const request = this.pendingImmediateSaves.shift()!;
			this.executeSave(request);
		}
	}

	private executeOpen(request: DocumentOpenRequest): void {
		const def = this.requireDef(request.documentId);
		const key = def.key(request.owner as never);
		const sessionKey = this.sessionKey(def.id, key);
		const existing = this.sessionsByKey.get(sessionKey);
		if (existing !== undefined && existing.status === "open") return;
		const store = this.storesByDocumentId.get(def.id);
		assert(store !== undefined, `[rovy/datastore] Missing store for document ${def.name}.`);
		const document = this.adapter.getDocument(store, key);
		const session: DocumentSession = { def, owner: request.owner, key, document, status: "opening" };
		this.sessionsByKey.set(sessionKey, session);
		const steal = request.options?.stealOnSessionLocked ?? def.session.stealOnSessionLocked;
		let result = this.adapter.open(document, { ...request.options, stealOnSessionLocked: steal });
		if (!result.success && result.reason === "SessionLockedError" && steal) {
			this.adapter.steal(document);
			result = this.adapter.open(document, { ...request.options, stealOnSessionLocked: true });
		}
		if (!result.success) {
			session.status = "failed";
			this.emitOpenFailed(def, key, request.owner, result.reason, result.message);
			this.maybeKick(def, request.owner, request.options, result.message);
			return;
		}
		if (!def.check(result.data)) {
			session.status = "failed";
			this.emitOpenFailed(def, key, request.owner, "ValidationError", `${def.name} loaded invalid data.`);
			this.maybeKick(def, request.owner, request.options, "Document data validation failed.");
			return;
		}
		session.status = "open";
		session.disconnectSignals = this.adapter.connectSignals(document, {});
		this.emit("opened", def, {
			document: def.publicToken,
			key,
			owner: request.owner,
			data: result.data,
		});
	}

	private executeClose(request: DocumentCloseRequest): void {
		const def = this.requireDef(request.documentId);
		const session = this.getSession(def.id, request.owner);
		if (session === undefined) return;
		session.status = "closing";
		const result = this.adapter.close(session.document, { save: request.options?.save ?? true, reason: request.reason });
		if (!result.success) {
			session.status = "failed";
			this.emit("saveFailed", def, {
				document: def.publicToken,
				key: session.key,
				owner: request.owner,
				reason: result.reason,
				message: result.message,
			});
			return;
		}
		session.disconnectSignals?.();
		session.status = "closed";
		this.sessionsByKey.delete(this.sessionKey(def.id, session.key));
		this.emit("closed", def, {
			document: def.publicToken,
			key: session.key,
			owner: request.owner,
			reason: request.reason,
		});
	}

	private executeSave(request: DocumentSaveRequest): void {
		const def = this.requireDef(request.documentId);
		const session = this.getSession(def.id, request.owner);
		if (session === undefined || session.status !== "open") {
			this.emit("saveFailed", def, {
				document: def.publicToken,
				key: def.key(request.owner as never),
				owner: request.owner,
				reason: "NotOpen",
			});
			return;
		}
		session.status = "saving";
		const result = this.adapter.save(session.document);
		session.status = result.success ? "open" : "failed";
		if (result.success) {
			this.emit("saved", def, {
				document: def.publicToken,
				key: session.key,
				owner: request.owner,
				data: result.data,
				reason: request.reason,
			});
		} else {
			this.emit("saveFailed", def, {
				document: def.publicToken,
				key: session.key,
				owner: request.owner,
				reason: result.reason,
				message: result.message,
			});
		}
	}

	private connectPlayers(): void {
		const [ok, players] = pcall(() => game.GetService("Players"));
		if (!ok || players === undefined) return;
		const playerAdded = (players as unknown as { PlayerAdded?: RBXScriptSignal }).PlayerAdded;
		const playerRemoving = (players as unknown as { PlayerRemoving?: RBXScriptSignal }).PlayerRemoving;
		playerAdded?.Connect((player) => {
			for (const [, def] of this.documentsById) {
				if (def.kind === "player" && def.lifecycle.autoOpen) this.enqueueOpen(def.id, player);
			}
		});
		playerRemoving?.Connect((player) => {
			for (const [, def] of this.documentsById) {
				if (def.kind === "player" && def.lifecycle.autoClose) this.enqueueClose(def.id, player, { save: true, reason: "player-removing" });
			}
		});
	}

	private emitOpenFailed(
		def: RuntimeDocumentDef,
		key: string,
		owner: unknown,
		reason: DocumentFailureReason,
		message?: string,
	): void {
		this.emit("openFailed", def, {
			document: def.publicToken,
			key,
			owner,
			reason,
			message,
		});
	}

	private maybeKick(def: RuntimeDocumentDef, owner: unknown, options: DocumentOpenOptions | undefined, message?: string): void {
		const shouldKick = options?.kickPlayerOnFailure ?? def.lifecycle.kickOnOpenFailure;
		if (!shouldKick || def.kind !== "player") return;
		const kick = (owner as { Kick?: (self: unknown, message?: string) => void }).Kick;
		if (typeIs(kick, "function")) kick(owner, message ?? `[rovy/datastore] Failed to open ${def.name}.`);
	}

	private emit(kind: DocumentEventKind, def: RuntimeDocumentDef, payload: object): void {
		const ctor = rovyData.eventCtor(kind, def.id) as unknown as new (payload: object) => object;
		this.events.send(new ctor(payload));
	}

	private getSession<T = unknown>(documentId: string, owner: unknown): DocumentSession<T> | undefined {
		const key = this.keyOf(documentId, owner);
		return this.sessionsByKey.get(this.sessionKey(documentId, key)) as DocumentSession<T> | undefined;
	}

	private requireDef<T = unknown>(documentId: string): RuntimeDocumentDef<T> {
		const def = this.documentsById.get(documentId);
		assert(def !== undefined, `[rovy/datastore] Cannot find unregistered document ${documentId}.`);
		return def as RuntimeDocumentDef<T>;
	}

	private sessionKey(documentId: string, key: string): string {
		return `${documentId}:${key}`;
	}
}
