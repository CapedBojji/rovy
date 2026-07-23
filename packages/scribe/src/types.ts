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
}

export interface ScribeEconomyMeta {
	readonly flow?: "source" | "sink";
	readonly transactionType?: string;
	readonly itemSku?: string;
	readonly currency?: string;
	readonly fields?: Readonly<Record<string, ScribePrimitive>>;
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
	ServerOnly<T>(value: T): T;
	Shared<T>(value: T): T;
	Session<T>(value: T): T;
	Int(defaultValue: number, metadata?: Readonly<Record<string, number>>): number;
	Number(defaultValue: number, metadata?: Readonly<Record<string, number>>): number;
	String(defaultValue: string, metadata?: Readonly<Record<string, number>>): string;
	Enum<Member extends string>(defaultValue: Member, members: ReadonlyArray<Member>): Member;
	Timed<T>(defaultValue: T): T;
	Dynamic<T>(factory: () => T): T;
	Optional<T>(inner: T): T | undefined;
	ArrayOf<T>(shape: T, options?: Readonly<Record<string, number>>): Array<T>;
	DictOf<T>(shape: T, options?: Readonly<Record<string, number>>): Record<string, T>;
	Vector3(defaultValue: Vector3): Vector3;
	Vector2(defaultValue: Vector2): Vector2;
	Vector3int16(defaultValue: Vector3int16): Vector3int16;
	Vector2int16(defaultValue: Vector2int16): Vector2int16;
	CFrame(defaultValue: CFrame): CFrame;
	Color3(defaultValue: Color3): Color3;
	BrickColor(defaultValue: BrickColor): BrickColor;
	UDim(defaultValue: UDim): UDim;
	UDim2(defaultValue: UDim2): UDim2;
	Rect(defaultValue: Rect): Rect;
	NumberRange(defaultValue: NumberRange): NumberRange;
	NumberSequence(defaultValue: NumberSequence): NumberSequence;
	ColorSequence(defaultValue: ColorSequence): ColorSequence;
	DateTime(defaultValue: DateTime): DateTime;
	EnumItem(defaultValue: EnumItem): EnumItem;
	Font(defaultValue: Font): Font;
	PhysicalProperties(defaultValue: PhysicalProperties): PhysicalProperties;
	readonly Datatypes: {
		IsSupported(name: string): boolean;
		Pack(name: string, value: ScribeRobloxDatatype): buffer;
		Unpack(name: string, bytes: buffer): ScribeRobloxDatatype;
	};
	GetStatus(): ScribeStatus;
	readonly OnStatusChanged: ScribeNativeSignal<readonly [status: ScribeStatus]>;
	readonly OnIssue: ScribeNativeSignal<readonly [entry: ScribeLogEntry]>;
	AddLogSink(sink: (entry: ScribeLogEntry) => void): void;
	GetRecentLogs(filter?: {
		readonly level?: ScribeLogLevel;
		readonly category?: ScribeLogCategory;
		readonly code?: string;
		readonly limit?: number;
	}): ReadonlyArray<ScribeLogEntry>;
	GetMetrics(): Readonly<Record<string, number | ScribeMetricSummary>>;
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
