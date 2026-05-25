import type { Ctor } from "@rovy/core";

export type ReadonlyDeep<T> = T extends (...args: never[]) => unknown
	? T
	: T extends object
		? { readonly [K in keyof T]: ReadonlyDeep<T[K]> }
		: T;

export interface AnyDocument {
	readonly __rovyDocumentBrand?: unique symbol;
}

export interface DocumentDef<T, Owner, Kind extends string> extends AnyDocument {
	readonly id: string;
	readonly name: string;
	readonly __data?: T;
	readonly __owner?: Owner;
	readonly __kind?: Kind;
}

export type PlayerDocument<T> = DocumentDef<T, Player, "player">;
export type KeyedDocument<T, Owner> = DocumentDef<T, Owner, "keyed">;
export type SharedDocument<T> = DocumentDef<T, void, "shared">;

export type DocumentData<D extends AnyDocument> = D extends DocumentDef<infer T, infer _Owner, infer _Kind> ? T : never;
export type DocumentOwner<D extends AnyDocument> = D extends DocumentDef<infer _T, infer Owner, infer _Kind> ? Owner : never;
export type DocumentKind<D extends AnyDocument> = D extends DocumentDef<infer _T, infer _Owner, infer Kind> ? Kind : never;

export interface DocumentMigration<T = unknown> {
	readonly version?: number;
	readonly migrate: (data: T) => T;
	readonly backwardsCompatible?: boolean;
}

export interface PlayerDocumentOptions<T> {
	readonly name: string;
	readonly store: string;
	readonly key?: (player: Player) => string;
	readonly default: () => T;
	readonly migrations?: ReadonlyArray<DocumentMigration<T>>;
	readonly session?: {
		readonly lock?: boolean;
		readonly stealOnSessionLocked?: boolean;
	};
	readonly lifecycle?: {
		readonly autoOpen?: boolean;
		readonly autoClose?: boolean;
		readonly kickOnOpenFailure?: boolean;
	};
	readonly debug?: {
		readonly printLifecycle?: boolean;
		readonly printWrites?: boolean;
	};
	readonly unsafeCheckOverride?: (value: unknown) => boolean;
}

export interface DocumentOptions<T, Owner> {
	readonly name: string;
	readonly store: string;
	readonly key: (owner: Owner) => string;
	readonly default: () => T;
	readonly migrations?: ReadonlyArray<DocumentMigration<T>>;
	readonly session?: {
		readonly lock?: boolean;
		readonly stealOnSessionLocked?: boolean;
	};
	readonly lifecycle?: {
		readonly autoOpen?: false;
		readonly autoClose?: false;
	};
	readonly debug?: {
		readonly printLifecycle?: boolean;
		readonly printWrites?: boolean;
	};
	readonly unsafeCheckOverride?: (value: unknown) => boolean;
}

export interface SharedDocumentOptions<T> {
	readonly name: string;
	readonly store: string;
	readonly key: string;
	readonly default: () => T;
	readonly migrations?: ReadonlyArray<DocumentMigration<T>>;
	readonly session?: {
		readonly lock?: boolean;
	};
	readonly lifecycle?: {
		readonly autoOpen?: boolean;
		readonly autoClose?: boolean;
	};
	readonly debug?: {
		readonly printLifecycle?: boolean;
		readonly printWrites?: boolean;
	};
	readonly unsafeCheckOverride?: (value: unknown) => boolean;
}

export type DocumentStatus = "closed" | "opening" | "open" | "saving" | "closing" | "failed";
export type DocumentFailureReason =
	| "SessionLockedError"
	| "BackwardsCompatibilityError"
	| "RobloxAPIError"
	| "ValidationError"
	| "NotOpen"
	| "Closed"
	| "Unknown";

export interface DocumentUpdateOptions {
	readonly save?: "autosave" | "immediate";
	readonly reason?: string;
}

export interface DocumentSaveOptions {
	readonly reason?: string;
}

export type DocumentUpdateResult =
	| {
			readonly success: true;
			readonly status: "updated";
	  }
	| {
			readonly success: false;
			readonly reason: "NotOpen" | "Closed" | "ValidationError" | "SaveFailed" | "Unknown";
			readonly message?: string;
	  };

export interface DocumentOpenOptions {
	readonly stealOnSessionLocked?: boolean;
	readonly kickPlayerOnFailure?: boolean;
	readonly reason?: string;
}

export interface DocumentCloseOptions {
	readonly save?: boolean;
	readonly reason?: string;
}

export interface DocumentReader<D extends AnyDocument> {
	get(owner: DocumentOwner<D>): ReadonlyDeep<DocumentData<D>> | undefined;
	require(owner: DocumentOwner<D>): ReadonlyDeep<DocumentData<D>>;
	has(owner: DocumentOwner<D>): boolean;
	status(owner: DocumentOwner<D>): DocumentStatus;
	isOpen(owner: DocumentOwner<D>): boolean;
	keyOf(owner: DocumentOwner<D>): string;
}

export interface DocumentWriter<D extends AnyDocument> extends DocumentReader<D> {
	update(
		owner: DocumentOwner<D>,
		transform: (data: ReadonlyDeep<DocumentData<D>>) => DocumentData<D>,
		options?: DocumentUpdateOptions,
	): DocumentUpdateResult;
	patch(owner: DocumentOwner<D>, patch: Partial<DocumentData<D>>, options?: DocumentUpdateOptions): DocumentUpdateResult;
	save(owner: DocumentOwner<D>, options?: DocumentSaveOptions): void;
}

export interface DocumentOpener<D extends AnyDocument> {
	open(owner: DocumentOwner<D>, options?: DocumentOpenOptions): void;
	close(owner: DocumentOwner<D>, options?: DocumentCloseOptions): void;
	reopen(owner: DocumentOwner<D>, options?: DocumentOpenOptions): void;
	status(owner: DocumentOwner<D>): DocumentStatus;
	isOpen(owner: DocumentOwner<D>): boolean;
	keyOf(owner: DocumentOwner<D>): string;
}

export interface DocumentOpened<D extends AnyDocument> {
	readonly document: D;
	readonly key: string;
	readonly owner: DocumentOwner<D>;
	readonly data: ReadonlyDeep<DocumentData<D>>;
}

export interface DocumentOpenFailed<D extends AnyDocument> {
	readonly document: D;
	readonly key: string;
	readonly owner: DocumentOwner<D>;
	readonly reason: DocumentFailureReason;
	readonly message?: string;
}

export interface DocumentChanged<D extends AnyDocument> {
	readonly document: D;
	readonly key: string;
	readonly owner: DocumentOwner<D>;
	readonly before: ReadonlyDeep<DocumentData<D>>;
	readonly after: ReadonlyDeep<DocumentData<D>>;
	readonly reason?: string;
}

export interface DocumentSaved<D extends AnyDocument> {
	readonly document: D;
	readonly key: string;
	readonly owner: DocumentOwner<D>;
	readonly data: ReadonlyDeep<DocumentData<D>>;
	readonly reason?: string;
}

export interface DocumentSaveFailed<D extends AnyDocument> {
	readonly document: D;
	readonly key: string;
	readonly owner: DocumentOwner<D>;
	readonly reason: DocumentFailureReason;
	readonly message?: string;
}

export interface DocumentClosed<D extends AnyDocument> {
	readonly document: D;
	readonly key: string;
	readonly owner: DocumentOwner<D>;
	readonly reason?: string;
}

export type RuntimeDocumentKind = "player" | "keyed" | "shared";
export type DocumentEventKind = "opened" | "openFailed" | "changed" | "saved" | "saveFailed" | "closed";

export interface RuntimeDocumentSessionOptions {
	readonly lock: boolean;
	readonly stealOnSessionLocked: boolean;
}

export interface RuntimeDocumentLifecycleOptions {
	readonly autoOpen: boolean;
	readonly autoClose: boolean;
	readonly kickOnOpenFailure: boolean;
}

export interface RuntimeDocumentDebugOptions {
	readonly printLifecycle: boolean;
	readonly printWrites: boolean;
}

export interface RuntimeDocumentDef<T = unknown, Owner = unknown> {
	readonly id: string;
	readonly kind: RuntimeDocumentKind;
	readonly name: string;
	readonly store: string;
	readonly key: (owner: Owner) => string;
	readonly default: () => T;
	readonly check: (value: unknown) => boolean;
	readonly migrations: ReadonlyArray<DocumentMigration<T>>;
	readonly session: RuntimeDocumentSessionOptions;
	readonly lifecycle: RuntimeDocumentLifecycleOptions;
	readonly debug: RuntimeDocumentDebugOptions;
	readonly publicToken: DocumentDef<T, Owner, string>;
}

export interface GeneratedDocumentEvent {
	readonly document: AnyDocument;
	readonly key: string;
	readonly owner: unknown;
	readonly data?: unknown;
	readonly before?: unknown;
	readonly after?: unknown;
	readonly reason?: DocumentFailureReason | string;
	readonly message?: string;
}

export type DocumentEventCtor = Ctor<GeneratedDocumentEvent>;

export const DATASTORE_READER_PREFIX = "@rovy/datastore/reader:";
export const DATASTORE_WRITER_PREFIX = "@rovy/datastore/writer:";
export const DATASTORE_OPENER_PREFIX = "@rovy/datastore/opener:";

export function readerParamId(documentId: string): string {
	return `${DATASTORE_READER_PREFIX}${documentId}`;
}

export function writerParamId(documentId: string): string {
	return `${DATASTORE_WRITER_PREFIX}${documentId}`;
}

export function openerParamId(documentId: string): string {
	return `${DATASTORE_OPENER_PREFIX}${documentId}`;
}

export function documentEventId(kind: DocumentEventKind, documentId: string): string {
	return `@rovy/datastore/event/${kind}:${documentId}`;
}
