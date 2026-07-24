import type {
	AnyScribeData,
} from "./definitions";
import type {
	ScribeLeaderboards,
} from "./services";
import type {
	ScribeLeaderboardEntry,
} from "./types";
import {
	assertPositiveInteger,
	assertScribeFeatureName,
	assertScribePlayer,
	callScribeFeature,
	type ScribeFeatureBoundary,
	type UnknownTable,
} from "./feature-utils";

export class ScribeLeaderboardsRuntime
	implements ScribeLeaderboards<AnyScribeData>
{
	constructor(
		readonly definition: AnyScribeData,
		private readonly boundary: ScribeFeatureBoundary,
		private readonly native: object,
	) {}

	get(
		name: string,
		limit?: number,
	): ReadonlyArray<ScribeLeaderboardEntry> {
		assertScribeFeatureName(name, "leaderboards.get", "board name");
		if (limit !== undefined) {
			assertPositiveInteger(limit, "leaderboards.get", "limit");
		}
		const raw = callScribeFeature(
			this.native,
			"GetLeaderboard",
			this.boundary,
			name,
			limit,
		);
		assert(
			typeIs(raw, "table"),
			"[rovy/scribe] native GetLeaderboard returned a non-table result",
		);
		const entries = new Array<ScribeLeaderboardEntry>();
		for (const rawEntry of raw as ReadonlyArray<unknown>) {
			assert(
				typeIs(rawEntry, "table"),
				"[rovy/scribe] native GetLeaderboard returned a malformed entry",
			);
			const entry = rawEntry as UnknownTable;
			assert(
				typeIs(entry.Rank, "number") &&
					typeIs(entry.UserId, "number") &&
					typeIs(entry.Name, "string") &&
					typeIs(entry.Score, "number"),
				"[rovy/scribe] native leaderboard entry is missing Rank, UserId, Name, or Score",
			);
			entries.push(
				table.freeze({
					rank: entry.Rank,
					userId: entry.UserId,
					name: entry.Name,
					score: entry.Score,
				}),
			);
		}
		return table.freeze(entries);
	}

	getMyRank(
		name: string,
		player?: Player,
	): number | undefined {
		assertScribeFeatureName(name, "leaderboards.getMyRank", "board name");
		const rank = this.boundary === "server"
			? callScribeFeature(
					this.native,
					"GetMyRank",
					this.boundary,
					assertPlayerResult(player),
					name,
				)
			: callClientRank(this.native, name, player);
		assert(
			rank === undefined || typeIs(rank, "number"),
			"[rovy/scribe] native GetMyRank returned a non-number result",
		);
		return rank as number | undefined;
	}
}

function assertPlayerResult(player?: Player): Player {
	assertScribePlayer(player, "leaderboards.getMyRank");
	return player;
}

function callClientRank(
	native: object,
	name: string,
	player?: Player,
): unknown {
	assert(
		player === undefined,
		"[rovy/scribe] client leaderboards.getMyRank cannot target another player",
	);
	return callScribeFeature(native, "GetMyRank", "client", name);
}
