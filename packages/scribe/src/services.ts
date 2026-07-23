import type {
	AnyScribeData,
	ScribeClientShape,
	ScribeNumericPath,
	ScribePersistedShape,
	ScribeShape,
} from "./definitions";
import type { ScribeCommandConstructor } from "./commands";
import type {
	DeepPartial,
	ReadonlyDeep,
	ScribeJobHandle,
	ScribeJobResults,
	ScribeLeaderboardEntry,
	ScribeLogEntry,
	ScribeMetricSummary,
	ScribeNativeModule,
	ScribePurchaseFilter,
	ScribePurchaseRecord,
	ScribeSaveInfo,
	ScribeSerializable,
	ScribeStatus,
	ScribeVersionInfo,
} from "./types";
import type { ScribeWriteTree } from "./trees";

export interface ScribeSaveNowOptions {
	readonly force?: boolean;
}

export interface ScribePersistence<D extends AnyScribeData> extends ScribeJobResults {
	getSaveInfo(player: Player): ScribeSaveInfo;
	saveNow(player: Player, options?: ScribeSaveNowOptions): ScribeJobHandle<boolean>;
	getOffline(userId: number): ScribeJobHandle<ReadonlyDeep<ScribePersistedShape<D>> | undefined>;
	updateOffline(
		userId: number,
		transform: (current: ReadonlyDeep<ScribePersistedShape<D>>) => ScribePersistedShape<D>,
	): ScribeJobHandle<boolean>;
	listVersions(userId: number, limit?: number): ScribeJobHandle<ReadonlyArray<ScribeVersionInfo>>;
	getVersion(
		userId: number,
		versionId: string,
	): ScribeJobHandle<ReadonlyDeep<ScribePersistedShape<D>> | undefined>;
	restoreVersion(userId: number, versionId: string): ScribeJobHandle<boolean>;
	erase(userId: number): ScribeJobHandle<boolean>;
	export(userId: number): ScribeJobHandle<string | undefined>;
}

export interface ScribeLeaderboards<D extends AnyScribeData> {
	readonly definition: D;
	get(name: string, limit?: number): ReadonlyArray<ScribeLeaderboardEntry>;
	getMyRank(name: string, player?: Player): number | undefined;
}

export interface ScribePurchaseSpec<D extends AnyScribeData> {
	readonly cost: {
		readonly path: ScribeNumericPath<D>;
		readonly amount: number;
	};
	readonly category?: string;
	readonly itemId: string;
	readonly grant?: (writes: ScribeWriteTree<import("./definitions").ScribeFullSchema<D>>) => void;
	readonly metadata?: Readonly<Record<string, ScribeSerializable>>;
}

export interface ScribeMonetization<D extends AnyScribeData> extends ScribeJobResults {
	promptGift(buyer: Player, productName: string, recipientUserId: number): ScribeJobHandle<boolean>;
	getGiftCredits(player?: Player): Readonly<Record<string, number>>;
	purchase(player: Player, spec: ScribePurchaseSpec<D>): ScribeJobHandle<boolean>;
	recordPurchase(player: Player, record: Omit<ScribePurchaseRecord, "kind" | "timestamp">): void;
	getPurchases(player?: Player, filter?: ScribePurchaseFilter): ReadonlyArray<ScribePurchaseRecord>;
}

export interface ScribeOwnership<D extends AnyScribeData> extends ScribeJobResults {
	readonly definition: D;
	owns(key: string, player?: Player): boolean;
	ownsAuthoritative(player: Player, key: string): ScribeJobHandle<boolean>;
	grantPerk(player: Player, key: string): void;
	revokePerk(player: Player, key: string): void;
}

export interface ScribeReceiptInfo {
	readonly PlayerId: number;
	readonly PlaceIdWherePurchased: number;
	readonly PurchaseId: string;
	readonly ProductId: number;
	readonly CurrencySpent: number;
}

export interface ScribeReceipts<D extends AnyScribeData> extends ScribeJobResults {
	readonly definition: D;
	handleReceipt(receipt: ScribeReceiptInfo): ScribeJobHandle<Enum.ProductPurchaseDecision>;
	tryHandleReceipt(
		receipt: ScribeReceiptInfo,
	): ScribeJobHandle<Enum.ProductPurchaseDecision | undefined>;
}

export interface ScribeCooldownState {
	readonly onCooldown: boolean;
	readonly remaining: number;
}

export interface ScribeCooldowns<D extends AnyScribeData> extends ScribeJobResults {
	readonly definition: D;
	onCooldown(player: Player, key: string, seconds: number): ScribeJobHandle<ScribeCooldownState>;
	peek(player: Player, key: string): ScribeCooldownState;
	clear(player: Player, key: string): void;
}

export interface ScribeMessaging<D extends AnyScribeData> extends ScribeJobResults {
	readonly definition: D;
	send<Payload extends ScribeSerializable>(userId: number, message: Payload): ScribeJobHandle<boolean>;
}

export interface ScribeMockState {
	readonly perks?: ReadonlyArray<string>;
	readonly giftCredits?: Readonly<Record<string, number>>;
	readonly leaderboards?: Readonly<Record<string, ReadonlyArray<ScribeLeaderboardEntry>>>;
	readonly purchases?: ReadonlyArray<ScribePurchaseRecord>;
}

export interface ScribeTestRuntime<D extends AnyScribeData> {
	seed(values?: DeepPartial<ScribeClientShape<D>>, state?: ScribeMockState): void;
	mockCommand<Command extends object, Result>(
		command: ScribeCommandConstructor<Command>,
		handler: (request: Command) => Result,
	): void;
}

export interface ScribeDiagnostics {
	status(): ScribeStatus;
	recentLogs(filter?: {
		readonly level?: string;
		readonly category?: string;
		readonly code?: string;
		readonly limit?: number;
	}): ReadonlyArray<ScribeLogEntry>;
	metrics(): Readonly<Record<string, number | ScribeMetricSummary>>;
	addSink(sink: (entry: ScribeLogEntry) => void): void;
}

export interface ScribeUnsafeDatatypes {
	pack(name: string, value: ScribeSerializable): buffer;
	unpack(name: string, bytes: buffer): unknown;
}

export interface ScribeUnsafe<D extends AnyScribeData> {
	readonly definition: D;
	readonly module: ScribeNativeModule;
	readonly client: unknown;
	readonly server: unknown;
	readonly profileStore: unknown;
	readonly datatypes: ScribeUnsafeDatatypes;
	readonly rawShape?: ScribeShape<D>;
}
