import type {
	AnyScribeData,
} from "./definitions";
import type {
	ScribeOwnership,
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
import type {
	ScribeWriteQueue,
} from "./write-queue";
import {
	assertScribeFeatureBoundary,
	assertScribeFeatureName,
	assertScribePlayer,
	callScribeFeature,
	isScribeClientReady,
	type ScribeFeatureBoundary,
} from "./feature-utils";

export class ScribeOwnershipRuntime
	implements ScribeOwnership<AnyScribeData>
{
	private readonly owner: ScribeJobOwner;

	constructor(
		readonly definition: AnyScribeData,
		private readonly boundary: ScribeFeatureBoundary,
		private readonly native: object,
		private readonly jobs: ScribeJobRuntime,
		private readonly writes: ScribeWriteQueue,
	) {
		this.owner = jobs.owner("ownership", definition.id);
	}

	owns(key: string, player?: Player): boolean {
		assertScribeFeatureName(key, "ownership.owns", "key");
		if (this.boundary === "client") {
			assert(
				player === undefined,
				"[rovy/scribe] client ownership.owns cannot target another player",
			);
			if (!isScribeClientReady(this.native)) return false;
			return callScribeFeature(
				this.native,
				"Owns",
				this.boundary,
				key,
			) === true;
		}
		assertScribePlayer(player, "ownership.owns");
		return callScribeFeature(
			this.native,
			"Owns",
			this.boundary,
			player,
			key,
		) === true;
	}

	ownsSynced(
		key: string,
		timeout?: number,
	): ScribeJobHandle<boolean> {
		assertScribeFeatureBoundary(
			this.boundary,
			"client",
			"ownership.ownsSynced",
		);
		assertScribeFeatureName(key, "ownership.ownsSynced", "key");
		if (timeout !== undefined) {
			assert(
				timeout >= 0,
				"[rovy/scribe] ownership.ownsSynced timeout must be non-negative",
			);
		}
		return this.jobs.enqueue(
			this.owner,
			"ownsSynced",
			() =>
				successfulJob(
					callScribeFeature(
						this.native,
						"OwnsAsync",
						this.boundary,
						key,
						timeout,
					) === true,
				),
		);
	}

	ownsAuthoritative(
		player: Player,
		key: string,
	): ScribeJobHandle<boolean> {
		assertScribeFeatureBoundary(
			this.boundary,
			"server",
			"ownership.ownsAuthoritative",
		);
		assertScribePlayer(player, "ownership.ownsAuthoritative");
		assertScribeFeatureName(
			key,
			"ownership.ownsAuthoritative",
			"key",
		);
		return this.jobs.enqueue(
			this.owner,
			"ownsAuthoritative",
			() =>
				successfulJob(
					callScribeFeature(
						this.native,
						"OwnsAsync",
						this.boundary,
						player,
						key,
					) === true,
				),
			player,
		);
	}

	grantPerk(player: Player, key: string): void {
		this.queuePerkWrite(player, key, "GrantPerk", "grantPerk");
	}

	revokePerk(player: Player, key: string): void {
		this.queuePerkWrite(player, key, "RevokePerk", "revokePerk");
	}

	hasResult<T>(handle: ScribeJobHandle<T>): boolean {
		return this.jobs.hasResult(this.owner, handle);
	}

	takeResult<T>(
		handle: ScribeJobHandle<T>,
	): ScribeJobResult<T> | undefined {
		return this.jobs.takeResult(this.owner, handle);
	}

	private queuePerkWrite(
		player: Player,
		key: string,
		nativeName: "GrantPerk" | "RevokePerk",
		operation: string,
	): void {
		assertScribeFeatureBoundary(
			this.boundary,
			"server",
			`ownership.${operation}`,
		);
		assertScribePlayer(player, `ownership.${operation}`);
		assertScribeFeatureName(key, `ownership.${operation}`, "key");
		this.writes.enqueueCustom(
			this.definition.id,
			player,
			operation,
			() => {
				callScribeFeature(
					this.native,
					nativeName,
					this.boundary,
					player,
					key,
				);
			},
		);
	}
}
