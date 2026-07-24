import {
	EventReader,
	client,
	observer,
	server,
	system,
} from "@rovy/core";
import {
	ScribeDiagnostics,
	ScribeJobCompleted,
	ScribeJobHandle,
	ScribeLeaderboards,
	ScribeMonetization,
	ScribePersistence,
	ScribeTestRuntime,
	scribeEvent,
} from "@rovy/scribe";
import { PlayerData } from "./player-data";
import {
	ForceSaveRequested,
	PurchaseRequested,
	Update,
} from "./support";

// #region persistence-job
@server
@system({ schedule: Update })
export class ProcessForceSave {
	private pending?: ScribeJobHandle<boolean>;

	run(
		requests: EventReader<ForceSaveRequested>,
		persistence: ScribePersistence<typeof PlayerData>,
	): void {
		requests.forEach((request) => {
			this.pending = persistence.saveNow(
				request.player,
				{ force: true },
			);
		});

		if (this.pending === undefined) return;
		const result = persistence.takeResult(this.pending);
		if (result === undefined) return;

		print(result.ok ? result.value : result.error);
		this.pending = undefined;
	}
}
// #endregion persistence-job

// #region job-event
@scribeEvent({
	data: PlayerData,
	kind: "jobCompleted",
})
export class PlayerDataJobCompleted
	extends ScribeJobCompleted<unknown> {}

@server
@observer({ event: PlayerDataJobCompleted })
export class LogPlayerDataJob {
	run(event: PlayerDataJobCompleted): void {
		print(
			event.handle.operation,
			event.result.ok,
		);
	}
}
// #endregion job-event

// #region leaderboards
@client
@system({ schedule: Update })
export class RenderCoinLeaderboard {
	run(
		leaderboards: ScribeLeaderboards<
			typeof PlayerData
		>,
	): void {
		for (const entry of leaderboards.get("Coins", 10)) {
			print(entry.rank, entry.name, entry.score);
		}
		print("My rank", leaderboards.getMyRank("Coins"));
	}
}
// #endregion leaderboards

// #region monetization
@server
@system({ schedule: Update })
export class BuyPotion {
	run(
		requests: EventReader<PurchaseRequested>,
		monetization: ScribeMonetization<
			typeof PlayerData
		>,
	): void {
		requests.forEach((request) => {
			monetization.purchase(request.player, {
				cost: {
					path: "Coins",
					amount: 100,
				},
				category: "Potion",
				itemId: request.itemId,
				metadata: {
					Region: "US",
				},
				grant(writes) {
					writes.Inventory
						.at(request.itemId)
						.set({
							Amount: 1,
							Level: 1,
						});
				},
			});
		});
	}
}
// #endregion monetization

// #region diagnostics
@server
@system({ schedule: Update })
export class ReportScribeHealth {
	run(diagnostics: ScribeDiagnostics): void {
		if (diagnostics.status() !== "Healthy") {
			warn(diagnostics.recentLogs({
				level: "Warn",
				limit: 10,
			}));
		}
	}
}
// #endregion diagnostics

// #region edit-mode
@client
@system({ schedule: Update })
export class SeedScribePreview {
	private seeded = false;

	run(testing: ScribeTestRuntime<typeof PlayerData>): void {
		if (this.seeded) return;
		this.seeded = true;
		testing.seed(
			{
				Coins: 500,
				Public: {
					DisplayName: "Preview",
				},
			},
			{
				perks: ["VIP"],
			},
		);
	}
}
// #endregion edit-mode
