export { document, playerDocument, sharedDocument } from "./document";
export { rovyData } from "./registry";
export {
	DATASTORE_OPENER_PREFIX,
	DATASTORE_READER_PREFIX,
	DATASTORE_WRITER_PREFIX,
	documentEventId,
	openerParamId,
	readerParamId,
	writerParamId,
} from "./types";
export type {
	AnyDocument,
	DocumentChanged,
	DocumentClosed,
	DocumentCloseOptions,
	DocumentData,
	DocumentDef,
	DocumentFailureReason,
	DocumentKind,
	DocumentOpened,
	DocumentOpener,
	DocumentOpenFailed,
	DocumentOpenOptions,
	DocumentOptions,
	DocumentOwner,
	DocumentReader,
	DocumentSaved,
	DocumentSaveFailed,
	DocumentSaveOptions,
	DocumentStatus,
	DocumentUpdateOptions,
	DocumentUpdateResult,
	KeyedDocument,
	PlayerDocument,
	PlayerDocumentOptions,
	ReadonlyDeep,
	SharedDocument,
	SharedDocumentOptions,
} from "./types";

// Importing the package is enough to install runtime app-extension wiring.
export * from "./runtime/app-extension";
