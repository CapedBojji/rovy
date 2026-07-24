import type { Ctor } from "@rovy/core";

export type ReadonlyDeep<T> = T extends (...args: never[]) => unknown
	? T
	: T extends ReadonlyArray<infer Element>
		? ReadonlyArray<ReadonlyDeep<Element>>
		: T extends object
			? { readonly [Key in keyof T]: ReadonlyDeep<T[Key]> }
			: T;

export type DeepPartial<T> = T extends (...args: never[]) => unknown
	? T
	: T extends ReadonlyArray<infer Element>
		? ReadonlyArray<DeepPartial<Element>>
		: T extends object
			? { readonly [Key in keyof T]?: DeepPartial<T[Key]> }
			: T;

export type ScribePrimitive = string | number | boolean;

export type ScribeRobloxDatatype =
	| Vector3
	| Vector2
	| Vector3int16
	| Vector2int16
	| CFrame
	| Color3
	| BrickColor
	| UDim
	| UDim2
	| Rect
	| NumberRange
	| NumberSequence
	| ColorSequence
	| DateTime
	| EnumItem
	| Font
	| PhysicalProperties;

export type ScribeSerializable =
	| ScribePrimitive
	| buffer
	| ScribeRobloxDatatype
	| ReadonlyArray<ScribeSerializable>
	| { readonly [key: string]: ScribeSerializable | undefined };

export type ScribeStatus = "Healthy" | "Degraded" | "Outage";
export type ScribeSessionState = "Loading" | "Ready" | "SessionEnded";
export type ScribeLifecycleReason =
	| "load-failed"
	| "migration-failed"
	| "session-ended"
	| "player-left"
	| "shutdown"
	| "timeout";
export interface ScribeReasonConstants {
	readonly LoadFailed: "load-failed";
	readonly MigrationFailed: "migration-failed";
	readonly SessionEnded: "session-ended";
	readonly PlayerLeft: "player-left";
	readonly Shutdown: "shutdown";
	readonly Timeout: "timeout";
}
export type ScribeLogLevel = "Debug" | "Info" | "Warn" | "Error" | "Fatal";
export type ScribeLogCategory =
	| "Persistence"
	| "Replication"
	| "Transport"
	| "Commands"
	| "Leaderboards"
	| "Monetization"
	| "Gifting"
	| "Integrity"
	| "Lifecycle";

export interface ScribeLogEntry {
	readonly at: number;
	readonly level: ScribeLogLevel;
	readonly category: ScribeLogCategory;
	readonly code: string;
	readonly message: string;
	readonly context?: Readonly<Record<string, ScribeSerializable>>;
}

export interface ScribeNativeLogEntry {
	readonly At: number;
	readonly Level: ScribeLogLevel;
	readonly Category: ScribeLogCategory;
	readonly Code: string;
	readonly Message: string;
	readonly Context?: Readonly<Record<string, ScribeSerializable>>;
}

export interface ScribeStatusThresholds {
	readonly failWindow?: number;
	readonly failCount?: number;
	readonly recoverStreak?: number;
}

export interface ScribeSaveInfo {
	readonly lastSaveAt?: number;
	readonly lastResult?: "Ok" | "Fail";
	readonly dirty: boolean;
	readonly size?: number;
}

export interface ScribeVersionInfo {
	readonly versionId: string;
	readonly createdAt: number;
	readonly size?: number;
}

export interface ScribeLeaderboardEntry {
	readonly rank: number;
	readonly userId: number;
	readonly name: string;
	readonly score: number;
}

export interface ScribePurchaseFilter {
	readonly kind?: "Robux" | "InGame";
	readonly category?: string;
	readonly itemId?: string;
	readonly since?: number;
	readonly limit?: number;
}

export interface ScribePurchaseRecord {
	readonly kind: "Robux" | "InGame";
	readonly category?: string;
	readonly itemId: string;
	readonly timestamp: number;
	readonly metadata?: Readonly<Record<string, ScribeSerializable>>;
	readonly product?: string;
	readonly purchaseId?: string;
	readonly priceInRobux?: number;
	readonly from?: ScribeSerializable;
	readonly currency?: string;
	readonly amount?: number;
}

export interface ScribeEconomyMeta {
	readonly flow?: "source" | "sink";
	readonly transactionType?: string | EnumItem;
	readonly itemSku?: string;
	readonly currency?: string;
	readonly fields?: Readonly<Record<string, ScribeSerializable>>;
}

export interface ScribeTransport {
	readonly Name: string;
	SendToClient(player: Player, bytes: buffer): void;
	SendToAllClients?(bytes: buffer): void;
	ListenServer(callback: (player: Player, bytes: buffer) => void): void;
	SendToServer(bytes: buffer): void;
	ListenClient(callback: (bytes: buffer) => void): void;
}

export interface ScribeDatatypes {
	isSupported(name: string): boolean;
	pack(name: string, value: ScribeRobloxDatatype): buffer;
	unpack(name: string, bytes: buffer): ScribeRobloxDatatype;
}

export interface ScribeNativeConnection {
	Disconnect(): void;
}

export interface ScribeNativeSignal<Arguments extends ReadonlyArray<unknown>> {
	Connect(callback: (...args: Arguments) => void): ScribeNativeConnection;
}

export interface ScribeNativeModule {
	(options: Readonly<Record<string, unknown>>): unknown;
	readonly Version: string;
	readonly new: (options: Readonly<Record<string, unknown>>) => unknown;
	readonly ServerOnly: <T>(value: T) => T;
	readonly Shared: <T>(value: T) => T;
	readonly Session: <T>(value: T) => T;
	readonly Int: (defaultValue: number, metadata?: Readonly<Record<string, number>>) => number;
	readonly Number: (defaultValue: number, metadata?: Readonly<Record<string, number>>) => number;
	readonly String: (defaultValue: string, metadata?: Readonly<Record<string, number>>) => string;
	readonly Enum: <Member extends string>(defaultValue: Member, members: ReadonlyArray<Member>) => Member;
	readonly Timed: <T>(defaultValue: T) => T;
	readonly Dynamic: <T>(factory: () => T) => T;
	readonly Optional: <T>(inner: T) => T | undefined;
	readonly ArrayOf: <T>(shape: T, options?: Readonly<Record<string, number>>) => Array<T>;
	readonly DictOf: <T>(shape: T, options?: Readonly<Record<string, number>>) => Record<string, T>;
	readonly Vector3: (defaultValue: Vector3) => Vector3;
	readonly Vector2: (defaultValue: Vector2) => Vector2;
	readonly Vector3int16: (defaultValue: Vector3int16) => Vector3int16;
	readonly Vector2int16: (defaultValue: Vector2int16) => Vector2int16;
	readonly CFrame: (defaultValue: CFrame) => CFrame;
	readonly Color3: (defaultValue: Color3) => Color3;
	readonly BrickColor: (defaultValue: BrickColor) => BrickColor;
	readonly UDim: (defaultValue: UDim) => UDim;
	readonly UDim2: (defaultValue: UDim2) => UDim2;
	readonly Rect: (defaultValue: Rect) => Rect;
	readonly NumberRange: (defaultValue: NumberRange) => NumberRange;
	readonly NumberSequence: (defaultValue: NumberSequence) => NumberSequence;
	readonly ColorSequence: (defaultValue: ColorSequence) => ColorSequence;
	readonly DateTime: (defaultValue: DateTime) => DateTime;
	readonly EnumItem: (defaultValue: EnumItem) => EnumItem;
	readonly Font: (defaultValue: Font) => Font;
	readonly PhysicalProperties: (defaultValue: PhysicalProperties) => PhysicalProperties;
	readonly Datatypes: {
		readonly IsSupported: (name: string) => boolean;
		readonly Pack: (name: string, value: ScribeRobloxDatatype) => buffer;
		readonly Unpack: (name: string, bytes: buffer) => ScribeRobloxDatatype;
	};
	readonly Reason: ScribeReasonConstants;
	readonly Configure: (config: { readonly AutoSaveInterval?: number }) => void;
	readonly GetStatus: () => ScribeStatus;
	readonly OnStatusChanged: ScribeNativeSignal<readonly [status: ScribeStatus]>;
	readonly OnIssue: ScribeNativeSignal<readonly [entry: ScribeNativeLogEntry]>;
	readonly AddLogSink: (sink: (entry: ScribeNativeLogEntry) => void) => void;
	readonly GetRecentLogs: (filter?: {
		readonly Level?: ScribeLogLevel;
		readonly Category?: ScribeLogCategory;
		readonly Code?: string;
		readonly Limit?: number;
	}) => ReadonlyArray<ScribeNativeLogEntry>;
	readonly GetMetrics: () => Readonly<Record<
		string,
		number | {
			readonly Count: number;
			readonly Average: number;
			readonly Max: number;
		}
	>>;
}

export interface ScribeMetricSummary {
	readonly count: number;
	readonly average: number;
	readonly max: number;
}

export interface ScribeJobHandle<T> {
	readonly id: number;
	readonly operation: string;
	readonly __result?: T;
}

export type ScribeJobResult<T> =
	| {
			readonly ok: true;
			readonly value: T;
	  }
	| {
			readonly ok: false;
			readonly error: string;
	  };

export interface ScribeJobResults {
	hasResult<T>(handle: ScribeJobHandle<T>): boolean;
	takeResult<T>(handle: ScribeJobHandle<T>): ScribeJobResult<T> | undefined;
}

export interface ScribeTransactionHandle {
	readonly id: number;
	readonly player: Player;
}

export type ScribeCtor<T extends object = object> = Ctor<T>;
