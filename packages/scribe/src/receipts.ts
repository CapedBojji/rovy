import type {
	AnyScribeData,
} from "./definitions";
import type {
	ScribeReceiptInfo,
	ScribeReceipts,
} from "./services";
import type {
	ScribeJobHandle,
	ScribeJobResult,
} from "./types";
import {
	ScribeJobRuntime,
	type ScribeJobOwner,
	successfulJob,
} from "./job-runtime";
import {
	assertPositiveInteger,
	assertScribeFeatureBoundary,
	callScribeFeature,
	immutableScribeFeatureValue,
	type ScribeFeatureBoundary,
} from "./feature-utils";

export class ScribeReceiptsRuntime
	implements ScribeReceipts<AnyScribeData>
{
	private readonly owner: ScribeJobOwner;

	constructor(
		readonly definition: AnyScribeData,
		private readonly boundary: ScribeFeatureBoundary,
		private readonly native: object,
		private readonly jobs: ScribeJobRuntime,
	) {
		this.owner = jobs.owner("receipts", definition.id);
	}

	handleReceipt(
		receipt: ScribeReceiptInfo,
	): ScribeJobHandle<Enum.ProductPurchaseDecision> {
		return this.receiptJob(
			"handleReceipt",
			"HandleReceipt",
			receipt,
		) as ScribeJobHandle<Enum.ProductPurchaseDecision>;
	}

	tryHandleReceipt(
		receipt: ScribeReceiptInfo,
	): ScribeJobHandle<Enum.ProductPurchaseDecision | undefined> {
		return this.receiptJob(
			"tryHandleReceipt",
			"TryHandleReceipt",
			receipt,
		);
	}

	hasResult<T>(handle: ScribeJobHandle<T>): boolean {
		return this.jobs.hasResult(this.owner, handle);
	}

	takeResult<T>(
		handle: ScribeJobHandle<T>,
	): ScribeJobResult<T> | undefined {
		return this.jobs.takeResult(this.owner, handle);
	}

	private receiptJob(
		operation: string,
		nativeName: "HandleReceipt" | "TryHandleReceipt",
		receipt: ScribeReceiptInfo,
	): ScribeJobHandle<Enum.ProductPurchaseDecision | undefined> {
		assertScribeFeatureBoundary(
			this.boundary,
			"server",
			`receipts.${operation}`,
		);
		const immutableReceipt = validateReceipt(receipt, operation);
		return this.jobs.enqueue(
			this.owner,
			operation,
			() =>
				successfulJob(
					callScribeFeature(
						this.native,
						nativeName,
						this.boundary,
						immutableReceipt,
					) as Enum.ProductPurchaseDecision | undefined,
				),
		);
	}
}

function validateReceipt(
	receipt: ScribeReceiptInfo,
	operation: string,
): ScribeReceiptInfo {
	assert(
		typeIs(receipt, "table"),
		`[rovy/scribe] receipts.${operation} requires a receipt table`,
	);
	assertPositiveInteger(
		receipt.PlayerId,
		`receipts.${operation}`,
		"PlayerId",
	);
	assertPositiveInteger(
		receipt.PlaceIdWherePurchased,
		`receipts.${operation}`,
		"PlaceIdWherePurchased",
	);
	assert(
		receipt.PurchaseId.size() > 0,
		`[rovy/scribe] receipts.${operation} PurchaseId must not be empty`,
	);
	assertPositiveInteger(
		receipt.ProductId,
		`receipts.${operation}`,
		"ProductId",
	);
	assert(
		receipt.CurrencySpent >= 0 &&
			receipt.CurrencySpent === receipt.CurrencySpent &&
			receipt.CurrencySpent < math.huge,
		`[rovy/scribe] receipts.${operation} CurrencySpent must be finite and non-negative`,
	);
	return immutableScribeFeatureValue(receipt);
}
