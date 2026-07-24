import type {
	AnyScribeData,
} from "./definitions";
import type {
	ScribeMockState,
	ScribeTestRuntime,
} from "./services";
import type {
	ScribeCommandConstructor,
} from "./commands";
import type {
	RuntimeScribeDataDefinition,
} from "./registry";
import type {
	ScribeLeaderboardEntry,
	ScribePurchaseRecord,
	ScribeSerializable,
} from "./types";
import type {
	ScribeWriteQueue,
} from "./write-queue";
import type {
	ScribeCommandRuntime,
} from "./command-runtime";
import {
	cloneScribeValue,
	freezeScribeValue,
} from "./reader-tree";
import {
	isScribeSchemaDescriptor,
} from "./schema";
import {
	assertScribeSerializable,
} from "./serialization";

type UnknownTable = Record<string | number, unknown>;
type NativeMethod = (...args: ReadonlyArray<unknown>) => unknown;

export class ScribeTestingRuntime
	implements ScribeTestRuntime<AnyScribeData>
{
	readonly definition: AnyScribeData;

	constructor(
		private readonly runtimeDefinition: RuntimeScribeDataDefinition,
		private readonly boundary: "client" | "server",
		private readonly native: object,
		private readonly writes: ScribeWriteQueue,
		private readonly commands: ScribeCommandRuntime,
		private readonly editMode = detectClientEditMode(),
	) {
		this.definition = runtimeDefinition.publicToken;
	}

	seed(
		values?: Readonly<Record<string, unknown>>,
		state?: ScribeMockState,
	): void {
		this.assertClientEditMode("seed");
		const immutableValues = compileSeedValues(
			this.runtimeDefinition,
			values,
		);
		const immutableState = compileMockState(state);
		this.writes.enqueueCustom(
			this.runtimeDefinition.id,
			undefined,
			"testSeed",
			() => {
				callNative(
					this.native,
					"Mock",
					immutableValues,
					immutableState,
				);
			},
		);
	}

	mockCommand<Command extends object>(
		command: ScribeCommandConstructor<Command>,
		handler: (request: Command) => unknown,
	): void {
		this.assertClientEditMode("mockCommand");
		assert(
			typeIs(handler, "function"),
			"[rovy/scribe] testing.mockCommand requires a handler",
		);
		this.commands.registerClientMock(
			this.runtimeDefinition.id,
			command,
			handler as (request: object) => unknown,
		);
	}

	private assertClientEditMode(operation: string): void {
		assert(
			this.boundary === "client",
			`[rovy/scribe] ScribeTestRuntime.${operation} is only available on the client`,
		);
		assert(
			this.editMode,
			`[rovy/scribe] ScribeTestRuntime.${operation} is only available in edit mode (storybooks and command bar)`,
		);
	}
}

function detectClientEditMode(): boolean {
	const [hasRunService, runService] = pcall(() =>
		game.GetService("RunService"),
	);
	return !hasRunService || !(runService as RunService).IsRunning();
}

function compileSeedValues(
	definition: RuntimeScribeDataDefinition,
	values?: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | undefined {
	if (values === undefined) return undefined;
	assert(
		typeIs(values, "table"),
		"[rovy/scribe] testing.seed values must be a table",
	);
	const template = definition.template as UnknownTable;
	for (const [key] of pairs(values as UnknownTable)) {
		assert(
			typeIs(key, "string") && template[key] !== undefined,
			`[rovy/scribe] testing.seed contains undeclared root field '${tostring(key)}'`,
		);
		const schema = template[key];
		assert(
			!(
				isScribeSchemaDescriptor(schema) &&
				schema.kind === "visibility" &&
				schema.visibility === "serverOnly"
			),
			`[rovy/scribe] testing.seed cannot write server-only root '${key}'`,
		);
	}
	assertScribeSerializable(values, "testing.seed values");
	return freezeScribeValue(
		cloneScribeValue(values),
	) as Readonly<Record<string, unknown>>;
}

function compileMockState(
	state?: ScribeMockState,
): Readonly<Record<string, unknown>> | undefined {
	if (state === undefined) return undefined;
	assert(
		typeIs(state, "table"),
		"[rovy/scribe] testing.seed state must be a table",
	);
	const output: Record<string, unknown> = {};
	if (state.perks !== undefined) {
		const perks = new Array<string>();
		for (const perk of state.perks) {
			assertNonemptyString(perk, "testing.seed perk");
			perks.push(perk);
		}
		output.Perks = table.freeze(perks);
	}
	if (state.giftCredits !== undefined) {
		const credits: Record<string, number> = {};
		for (const [name, count] of pairs(state.giftCredits)) {
			assertNonemptyString(name, "testing.seed gift-credit name");
			assert(
				typeIs(count, "number") &&
					count >= 0 &&
					count % 1 === 0,
				"[rovy/scribe] testing.seed gift-credit counts must be non-negative integers",
			);
			credits[name] = count;
		}
		output.GiftCredits = table.freeze(credits);
	}
	if (state.leaderboards !== undefined) {
		const boards: Record<string, ReadonlyArray<unknown>> = {};
		for (const [name, entries] of pairs(state.leaderboards)) {
			assertNonemptyString(name, "testing.seed leaderboard name");
			const nativeEntries = new Array<defined>();
			for (const entry of entries) {
				nativeEntries.push(compileLeaderboardEntry(entry));
			}
			boards[name] = table.freeze(nativeEntries);
		}
		output.Leaderboards = table.freeze(boards);
	}
	if (state.purchases !== undefined) {
		const robux = new Array<defined>();
		const inGame = new Array<defined>();
		for (const record of state.purchases) {
			const native = compilePurchaseRecord(record);
			(record.kind === "Robux" ? robux : inGame).push(native);
		}
		output.PurchaseLogs = table.freeze({
			Robux: table.freeze(robux),
			InGame: table.freeze(inGame),
		});
	}
	return table.freeze(output);
}

function compileLeaderboardEntry(
	entry: ScribeLeaderboardEntry,
): Readonly<Record<string, unknown>> {
	assert(
		typeIs(entry, "table") &&
			typeIs(entry.rank, "number") &&
			typeIs(entry.userId, "number") &&
			typeIs(entry.name, "string") &&
			typeIs(entry.score, "number"),
		"[rovy/scribe] testing.seed contains a malformed leaderboard entry",
	);
	return table.freeze({
		Rank: entry.rank,
		UserId: entry.userId,
		Name: entry.name,
		Score: entry.score,
	});
}

function compilePurchaseRecord(
	record: ScribePurchaseRecord,
): Readonly<Record<string, unknown>> {
	assert(
		typeIs(record, "table") &&
			(record.kind === "Robux" || record.kind === "InGame") &&
			typeIs(record.itemId, "string") &&
			typeIs(record.timestamp, "number"),
		"[rovy/scribe] testing.seed contains a malformed purchase record",
	);
	if (record.metadata !== undefined) {
		assertScribeSerializable(
			record.metadata,
			"testing.seed purchase metadata",
		);
	}
	const native: Record<string, unknown> = {
		Category: record.category,
		ItemId: record.itemId,
		Ts: record.timestamp,
		Meta:
			record.metadata === undefined
				? undefined
				: freezeScribeValue(
						cloneScribeValue(record.metadata),
					),
		Product: record.product,
		PurchaseId: record.purchaseId,
		PriceInRobux: record.priceInRobux,
		From:
			record.from === undefined
				? undefined
				: freezeScribeValue(
						cloneScribeValue(record.from),
					) as ScribeSerializable,
		Currency: record.currency,
		Amount: record.amount,
	};
	return table.freeze(native);
}

function assertNonemptyString(value: unknown, label: string): asserts value is string {
	assert(
		typeIs(value, "string") && value.size() > 0,
		`[rovy/scribe] ${label} must be a non-empty string`,
	);
}

function callNative(
	native: object,
	name: string,
	...args: ReadonlyArray<unknown>
): unknown {
	const method = (native as UnknownTable)[name];
	assert(
		typeIs(method, "function"),
		`[rovy/scribe] native client API does not expose ${name}`,
	);
	return (method as NativeMethod)(...args);
}
