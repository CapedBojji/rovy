import type {
	AnyScribeData,
} from "./definitions";
import type {
	ScribeMonetization,
	ScribePurchaseEntry,
	ScribePurchaseSpec,
} from "./services";
import type {
	ScribeJobHandle,
	ScribeJobResult,
	ScribePurchaseFilter,
	ScribePurchaseRecord,
	ScribeSerializable,
} from "./types";
import type {
	ScribeWriteTree,
} from "./trees";
import type {
	RuntimeScribeDataDefinition,
} from "./registry";
import {
	createScribeNativeImmediateTree,
} from "./immediate-tree";
import {
	cloneScribeValue,
	freezeScribeValue,
} from "./reader-tree";
import {
	failedJob,
	ScribeJobRuntime,
	type ScribeJobOwner,
} from "./job-runtime";
import type {
	ScribeWriteQueue,
} from "./write-queue";
import {
	assertScribeSerializable,
} from "./serialization";
import {
	assertPositiveInteger,
	assertScribeFeatureBoundary,
	assertScribeFeatureName,
	assertScribePlayer,
	booleanFeatureJob,
	callScribeFeature,
	callScribeFeatureTuple,
	isScribeClientReady,
	type ScribeFeatureBoundary,
	type UnknownTable,
} from "./feature-utils";

interface CompiledPurchaseSpec {
	readonly Cost: {
		readonly Path: string;
		readonly Amount: number;
	};
	readonly Category?: string;
	readonly ItemId: string;
	readonly Grant?: (nativeAccessor: object) => void;
	readonly Meta?: Readonly<Record<string, ScribeSerializable>>;
}

export class ScribeMonetizationRuntime
	implements ScribeMonetization<AnyScribeData>
{
	readonly definition: AnyScribeData;
	private readonly owner: ScribeJobOwner;

	constructor(
		private readonly runtimeDefinition: RuntimeScribeDataDefinition,
		private readonly boundary: ScribeFeatureBoundary,
		private readonly native: object,
		private readonly jobs: ScribeJobRuntime,
		private readonly writes: ScribeWriteQueue,
	) {
		this.definition = runtimeDefinition.publicToken;
		this.owner = jobs.owner("monetization", runtimeDefinition.id);
	}

	promptGift(
		buyer: Player,
		productName: string,
		recipientUserId: number,
	): ScribeJobHandle<boolean> {
		this.assertServer("monetization.promptGift");
		assertScribePlayer(buyer, "monetization.promptGift");
		assertScribeFeatureName(
			productName,
			"monetization.promptGift",
			"product name",
		);
		assertPositiveInteger(
			recipientUserId,
			"monetization.promptGift",
			"recipientUserId",
		);
		return this.jobs.enqueue(
			this.owner,
			"promptGift",
			() => {
				const [ok, reason] = callScribeFeatureTuple(
					this.native,
					"PromptGift",
					this.boundary,
					buyer,
					productName,
					recipientUserId,
				);
				return booleanFeatureJob(
					ok,
					reason,
					"gift-prompt-failed",
				);
			},
			buyer,
		);
	}

	getGiftCredits(
		player?: Player,
	): Readonly<Record<string, number>> {
		let raw: unknown;
		if (this.boundary === "server") {
			assertScribePlayer(player, "monetization.getGiftCredits");
			raw = callScribeFeature(
				this.native,
				"GetGiftCredits",
				this.boundary,
				player,
			);
		} else {
			assert(
				player === undefined,
				"[rovy/scribe] client monetization.getGiftCredits cannot target another player",
			);
			if (!isScribeClientReady(this.native)) return table.freeze({});
			raw = callScribeFeature(
				this.native,
				"GetGiftCredits",
				this.boundary,
			);
		}
		assert(
			typeIs(raw, "table"),
			"[rovy/scribe] native GetGiftCredits returned a non-table result",
		);
		const credits: Record<string, number> = {};
		for (const [name, count] of pairs(raw as UnknownTable)) {
			assert(
				typeIs(name, "string") && typeIs(count, "number"),
				"[rovy/scribe] native GetGiftCredits returned a malformed credit",
			);
			credits[name] = count;
		}
		return table.freeze(credits);
	}

	purchase(
		player: Player,
		spec: ScribePurchaseSpec<AnyScribeData>,
	): ScribeJobHandle<boolean> {
		this.assertServer("monetization.purchase");
		assertScribePlayer(player, "monetization.purchase");
		const compiled = compilePurchaseSpec(
			spec,
			this.runtimeDefinition,
		);
		const handle = this.jobs.reserveBuffered<boolean>(
			this.owner,
			"purchase",
			player,
		);
		this.writes.enqueueCustom(
			this.runtimeDefinition.id,
			player,
			"purchase",
			() => {
				if (!this.jobs.canRunBuffered(this.owner, handle)) return;
				const [called, okOrError, reason] = pcall(() =>
					callScribeFeatureTuple(
						this.native,
						"Purchase",
						this.boundary,
						player,
						compiled,
					),
				);
				if (!called) {
					this.jobs.completeBuffered(
						this.owner,
						handle,
						failedJob(
							`purchase-error: ${tostring(okOrError)}`,
						),
					);
					error(okOrError);
				}
				const result = booleanFeatureJob(
					okOrError,
					reason,
					"purchase-failed",
				);
				this.jobs.completeBuffered(
					this.owner,
					handle,
					result,
				);
				if (!result.ok) return result.error;
			},
			(errorMessage) => {
				if (!this.jobs.canRunBuffered(this.owner, handle)) return;
				this.jobs.completeBuffered(
					this.owner,
					handle,
					failedJob(`purchase-write-failed: ${errorMessage}`),
				);
			},
		);
		return handle;
	}

	recordPurchase(
		player: Player,
		record: ScribePurchaseEntry,
	): void {
		this.assertServer("monetization.recordPurchase");
		assertScribePlayer(player, "monetization.recordPurchase");
		const nativeRecord = compilePurchaseEntry(record);
		this.writes.enqueueCustom(
			this.runtimeDefinition.id,
			player,
			"recordPurchase",
			() => {
				callScribeFeature(
					this.native,
					"RecordPurchase",
					this.boundary,
					player,
					nativeRecord,
				);
			},
		);
	}

	getPurchases(
		player?: Player,
		filter?: ScribePurchaseFilter,
	): ReadonlyArray<ScribePurchaseRecord> {
		const nativeFilter = compilePurchaseFilter(filter);
		let raw: unknown;
		if (this.boundary === "server") {
			assertScribePlayer(player, "monetization.getPurchases");
			raw = callScribeFeature(
				this.native,
				"GetPurchases",
				this.boundary,
				player,
				nativeFilter,
			);
		} else {
			assert(
				player === undefined,
				"[rovy/scribe] client monetization.getPurchases cannot target another player",
			);
			if (!isScribeClientReady(this.native)) return table.freeze([]);
			raw = callScribeFeature(
				this.native,
				"GetPurchases",
				this.boundary,
				nativeFilter,
			);
		}
		assert(
			typeIs(raw, "table"),
			"[rovy/scribe] native GetPurchases returned a non-table result",
		);
		const records = new Array<ScribePurchaseRecord>();
		for (const value of raw as ReadonlyArray<unknown>) {
			records.push(normalizePurchaseRecord(value));
		}
		return table.freeze(records);
	}

	hasResult<T>(handle: ScribeJobHandle<T>): boolean {
		return this.jobs.hasResult(this.owner, handle);
	}

	takeResult<T>(
		handle: ScribeJobHandle<T>,
	): ScribeJobResult<T> | undefined {
		return this.jobs.takeResult(this.owner, handle);
	}

	private assertServer(operation: string): void {
		assertScribeFeatureBoundary(
			this.boundary,
			"server",
			operation,
		);
	}
}

function compilePurchaseSpec(
	spec: ScribePurchaseSpec<AnyScribeData>,
	definition: RuntimeScribeDataDefinition,
): CompiledPurchaseSpec {
	assert(
		typeIs(spec, "table"),
		"[rovy/scribe] monetization.purchase requires a purchase spec",
	);
	assert(
		typeIs(spec.cost, "table"),
		"[rovy/scribe] monetization.purchase cost must be a table",
	);
	const path = spec.cost.path as string;
	assertScribeFeatureName(path, "monetization.purchase", "cost path");
	assert(
		typeIs(spec.cost.amount, "number") &&
			spec.cost.amount > 0 &&
			spec.cost.amount === spec.cost.amount &&
			spec.cost.amount < math.huge,
		"[rovy/scribe] monetization.purchase cost amount must be finite and positive",
	);
	assertScribeFeatureName(
		spec.itemId,
		"monetization.purchase",
		"itemId",
	);
	if (spec.category !== undefined) {
		assertScribeFeatureName(
			spec.category,
			"monetization.purchase",
			"category",
		);
	}
	if (spec.metadata !== undefined) {
		assertScribeSerializable(
			spec.metadata,
			"monetization.purchase metadata",
		);
	}
	const metadata = spec.metadata === undefined
		? undefined
		: freezeScribeValue(
				cloneScribeValue(spec.metadata),
			) as Readonly<Record<string, ScribeSerializable>>;
	const grant = spec.grant;
	return table.freeze({
		Cost: table.freeze({
			Path: path,
			Amount: spec.cost.amount,
		}),
		Category: spec.category,
		ItemId: spec.itemId,
		Grant:
			grant === undefined
				? undefined
				: (nativeAccessor: object) => {
						grant(
							createScribeNativeImmediateTree(
								definition.template,
								nativeAccessor,
							) as ScribeWriteTree<
								import("./definitions").ScribeFullSchema<AnyScribeData>
							>,
						);
					},
		Meta: metadata,
	});
}

function compilePurchaseEntry(
	record: ScribePurchaseEntry,
): Readonly<Record<string, unknown>> {
	assert(
		typeIs(record, "table"),
		"[rovy/scribe] monetization.recordPurchase requires a record",
	);
	assertScribeFeatureName(
		record.itemId,
		"monetization.recordPurchase",
		"itemId",
	);
	if (record.category !== undefined) {
		assertScribeFeatureName(
			record.category,
			"monetization.recordPurchase",
			"category",
		);
	}
	if (record.metadata !== undefined) {
		assertScribeSerializable(
			record.metadata,
			"monetization.recordPurchase metadata",
		);
	}
	return table.freeze({
		Category: record.category,
		ItemId: record.itemId,
		Meta:
			record.metadata === undefined
				? undefined
				: freezeScribeValue(
						cloneScribeValue(record.metadata),
					),
	});
}

function compilePurchaseFilter(
	filter?: ScribePurchaseFilter,
): Readonly<Record<string, unknown>> | undefined {
	if (filter === undefined) return undefined;
	assert(
		filter.kind === undefined ||
			filter.kind === "Robux" ||
			filter.kind === "InGame",
		"[rovy/scribe] monetization.getPurchases filter kind is invalid",
	);
	for (const [name, value] of [
		["category", filter.category],
		["itemId", filter.itemId],
	] as const) {
		if (value !== undefined) {
			assertScribeFeatureName(
				value,
				"monetization.getPurchases",
				name,
			);
		}
	}
	if (filter.since !== undefined) {
		assert(
			filter.since >= 0 &&
				filter.since === filter.since &&
				filter.since < math.huge,
			"[rovy/scribe] monetization.getPurchases filter since must be finite and non-negative",
		);
	}
	if (filter.limit !== undefined) {
		assertPositiveInteger(
			filter.limit,
			"monetization.getPurchases",
			"filter limit",
		);
	}
	return table.freeze({
		Kind: filter.kind,
		Category: filter.category,
		ItemId: filter.itemId,
		Since: filter.since,
		Limit: filter.limit,
	});
}

function normalizePurchaseRecord(
	value: unknown,
): ScribePurchaseRecord {
	assert(
		typeIs(value, "table"),
		"[rovy/scribe] native GetPurchases returned a malformed record",
	);
	const raw = value as UnknownTable;
	assert(
		raw.Kind === "Robux" || raw.Kind === "InGame",
		"[rovy/scribe] native purchase record has an invalid Kind",
	);
	const itemId = typeIs(raw.ItemId, "string")
		? raw.ItemId
		: raw.Product;
	assert(
		typeIs(itemId, "string") && typeIs(raw.Ts, "number"),
		"[rovy/scribe] native purchase record is missing ItemId/Product or Ts",
	);
	const metadata = typeIs(raw.Meta, "table")
		? freezeScribeValue(cloneScribeValue(raw.Meta)) as Readonly<
				Record<string, ScribeSerializable>
			>
		: undefined;
	const from = raw.From === undefined
		? undefined
		: freezeScribeValue(
				cloneScribeValue(raw.From),
			) as ScribeSerializable;
	return table.freeze({
		kind: raw.Kind,
		category: typeIs(raw.Category, "string")
			? raw.Category
			: undefined,
		itemId,
		timestamp: raw.Ts,
		metadata,
		product: typeIs(raw.Product, "string")
			? raw.Product
			: undefined,
		purchaseId: typeIs(raw.PurchaseId, "string")
			? raw.PurchaseId
			: undefined,
		priceInRobux: typeIs(raw.PriceInRobux, "number")
			? raw.PriceInRobux
			: undefined,
		from,
		currency: typeIs(raw.Currency, "string")
			? raw.Currency
			: undefined,
		amount: typeIs(raw.Amount, "number")
			? raw.Amount
			: undefined,
	});
}
