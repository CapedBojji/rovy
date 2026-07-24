export const SCRIBE_CLIENT_READER_PREFIX = "@rovy/scribe/client-reader:";
export const SCRIBE_CLIENT_STATE_PREFIX = "@rovy/scribe/client-state:";
export const SCRIBE_LOCAL_WRITER_PREFIX = "@rovy/scribe/local-writer:";
export const SCRIBE_SHARED_READER_PREFIX = "@rovy/scribe/shared-reader:";
export const SCRIBE_SERVER_READER_PREFIX = "@rovy/scribe/server-reader:";
export const SCRIBE_SERVER_WRITER_PREFIX = "@rovy/scribe/server-writer:";
export const SCRIBE_PERSISTENCE_PREFIX = "@rovy/scribe/persistence:";
export const SCRIBE_LEADERBOARDS_PREFIX = "@rovy/scribe/leaderboards:";
export const SCRIBE_MONETIZATION_PREFIX = "@rovy/scribe/monetization:";
export const SCRIBE_OWNERSHIP_PREFIX = "@rovy/scribe/ownership:";
export const SCRIBE_RECEIPTS_PREFIX = "@rovy/scribe/receipts:";
export const SCRIBE_COOLDOWNS_PREFIX = "@rovy/scribe/cooldowns:";
export const SCRIBE_MESSAGING_PREFIX = "@rovy/scribe/messaging:";
export const SCRIBE_TESTING_PREFIX = "@rovy/scribe/testing:";
export const SCRIBE_UNSAFE_PREFIX = "@rovy/scribe/unsafe:";
export const SCRIBE_COMMAND_CLIENT_PREFIX = "@rovy/scribe/command-client:";
export const SCRIBE_COMMAND_READER_PREFIX = "@rovy/scribe/command-reader:";
export const SCRIBE_COMMAND_RESPONDER_PARAM = "@rovy/scribe/command-responder";
export const SCRIBE_DIAGNOSTICS_PARAM = "@rovy/scribe/diagnostics";

export type ScribeDataParamKind =
	| "client-reader"
	| "client-state"
	| "local-writer"
	| "shared-reader"
	| "server-reader"
	| "server-writer"
	| "persistence"
	| "leaderboards"
	| "monetization"
	| "ownership"
	| "receipts"
	| "cooldowns"
	| "messaging"
	| "testing"
	| "unsafe";

const DATA_PARAM_PREFIXES: Readonly<Record<ScribeDataParamKind, string>> = {
	"client-reader": SCRIBE_CLIENT_READER_PREFIX,
	"client-state": SCRIBE_CLIENT_STATE_PREFIX,
	"local-writer": SCRIBE_LOCAL_WRITER_PREFIX,
	"shared-reader": SCRIBE_SHARED_READER_PREFIX,
	"server-reader": SCRIBE_SERVER_READER_PREFIX,
	"server-writer": SCRIBE_SERVER_WRITER_PREFIX,
	persistence: SCRIBE_PERSISTENCE_PREFIX,
	leaderboards: SCRIBE_LEADERBOARDS_PREFIX,
	monetization: SCRIBE_MONETIZATION_PREFIX,
	ownership: SCRIBE_OWNERSHIP_PREFIX,
	receipts: SCRIBE_RECEIPTS_PREFIX,
	cooldowns: SCRIBE_COOLDOWNS_PREFIX,
	messaging: SCRIBE_MESSAGING_PREFIX,
	testing: SCRIBE_TESTING_PREFIX,
	unsafe: SCRIBE_UNSAFE_PREFIX,
};

export const SCRIBE_CLIENT_DATA_PARAM_KINDS: ReadonlyArray<ScribeDataParamKind> = [
	"client-reader",
	"client-state",
	"local-writer",
	"shared-reader",
	"leaderboards",
	"monetization",
	"ownership",
	"testing",
	"unsafe",
];

export const SCRIBE_SERVER_DATA_PARAM_KINDS: ReadonlyArray<ScribeDataParamKind> = [
	"server-reader",
	"server-writer",
	"persistence",
	"leaderboards",
	"monetization",
	"ownership",
	"receipts",
	"cooldowns",
	"messaging",
	"testing",
	"unsafe",
];

export function scribeDataParamId(kind: ScribeDataParamKind, dataId: string): string {
	return `${DATA_PARAM_PREFIXES[kind]}${dataId}`;
}

export function clientReaderParamId(dataId: string): string {
	return scribeDataParamId("client-reader", dataId);
}

export function clientStateParamId(dataId: string): string {
	return scribeDataParamId("client-state", dataId);
}

export function localWriterParamId(dataId: string): string {
	return scribeDataParamId("local-writer", dataId);
}

export function sharedReaderParamId(dataId: string): string {
	return scribeDataParamId("shared-reader", dataId);
}

export function serverReaderParamId(dataId: string): string {
	return scribeDataParamId("server-reader", dataId);
}

export function serverWriterParamId(dataId: string): string {
	return scribeDataParamId("server-writer", dataId);
}

export function persistenceParamId(dataId: string): string {
	return scribeDataParamId("persistence", dataId);
}

export function leaderboardsParamId(dataId: string): string {
	return scribeDataParamId("leaderboards", dataId);
}

export function monetizationParamId(dataId: string): string {
	return scribeDataParamId("monetization", dataId);
}

export function ownershipParamId(dataId: string): string {
	return scribeDataParamId("ownership", dataId);
}

export function receiptsParamId(dataId: string): string {
	return scribeDataParamId("receipts", dataId);
}

export function cooldownsParamId(dataId: string): string {
	return scribeDataParamId("cooldowns", dataId);
}

export function messagingParamId(dataId: string): string {
	return scribeDataParamId("messaging", dataId);
}

export function testingParamId(dataId: string): string {
	return scribeDataParamId("testing", dataId);
}

export function unsafeParamId(dataId: string): string {
	return scribeDataParamId("unsafe", dataId);
}

export function commandClientParamId(commandId: string): string {
	return `${SCRIBE_COMMAND_CLIENT_PREFIX}${commandId}`;
}

export function commandReaderParamId(commandId: string): string {
	return `${SCRIBE_COMMAND_READER_PREFIX}${commandId}`;
}

export function isScribeParamId(id: string): boolean {
	return id.sub(1, "@rovy/scribe/".size()) === "@rovy/scribe/";
}

export function dataParamKindAndId(
	id: string,
): { readonly kind: ScribeDataParamKind; readonly dataId: string } | undefined {
	for (const [kind, prefix] of pairs(DATA_PARAM_PREFIXES)) {
		if (id.sub(1, prefix.size()) === prefix) {
			return { kind, dataId: id.sub(prefix.size() + 1) };
		}
	}
	return undefined;
}
