import {
	EventReader,
	client,
	observer,
	server,
	system,
} from "@rovy/core";
import {
	ScribeClientReader,
	ScribeClientState,
	ScribeKeyAdded,
	ScribeLocalWriter,
	ScribeServerReader,
	ScribeServerWriter,
	ScribeSharedReader,
	ScribeValueChanged,
	scribeEvent,
} from "@rovy/scribe";
import { PlayerData } from "./player-data";
import {
	EnemyDefeated,
	PreviewItemSelected,
	Update,
} from "./support";

// #region reader-surface
export function inspectClientReader(
	data: ScribeClientReader<typeof PlayerData>,
): void {
	data.Coins.get();
	data.Coins.clone();
	data.Coins.default();
	data.Coins.min();
	data.Coins.max();
	data.Inventory.get();
	data.Inventory.count();
	data.Inventory.at("IronSword").Level.get();
	data.ActiveBoost.active();
}
// #endregion reader-surface

// #region committed-client-read
@client
@system({ schedule: Update })
export class RenderHud {
	run(
		data: ScribeClientReader<typeof PlayerData>,
		state: ScribeClientState<typeof PlayerData>,
	): void {
		if (!state.ready) {
			print("Loading profile...");
			return;
		}

		print("Coins", data.Coins.get());
		const sword = data.Inventory
			.at("IronSword")
			.get();
		print(
			sword === undefined
				? "Not owned"
				: `Level ${sword.Level}`,
		);
		print("Boost active", data.ActiveBoost.active().active);
	}
}
// #endregion committed-client-read

// #region local-write
@client
@system({ schedule: Update })
export class PreviewSelection {
	run(
		selected: EventReader<PreviewItemSelected>,
		data: ScribeClientReader<typeof PlayerData>,
		localWrites: ScribeLocalWriter<typeof PlayerData>,
	): void {
		selected.forEach((event) => {
			localWrites.EquippedItem.set(event.itemId);

			// Still the committed value in this Rovy set.
			print(data.EquippedItem.get());
		});
	}
}
// #endregion local-write

// #region authoritative-write
@server
@system({ schedule: Update })
export class AwardCoins {
	run(
		defeated: EventReader<EnemyDefeated>,
		writes: ScribeServerWriter<typeof PlayerData>,
	): void {
		defeated.forEach((event) => {
			writes
				.for(event.player)
				.Coins
				.increment(25, {
					flow: "source",
					transactionType: "EnemyReward",
					itemSku: event.enemyType,
					fields: {
						Region: "US",
					},
				});
		});
	}
}
// #endregion authoritative-write

// #region transaction
export function craftPotion(
	player: Player,
	writes: ScribeServerWriter<typeof PlayerData>,
): void {
	writes.transaction(player, (transaction) => {
		transaction.Coins.decrement(100);
		transaction.Inventory
			.at("HealthPotion")
			.Amount
			.increment(1);
	});
}
// #endregion transaction

// #region scribe-events
@scribeEvent({
	data: PlayerData,
	kind: "changed",
	path: "Coins",
})
export class CoinsChanged
	extends ScribeValueChanged<
		typeof PlayerData,
		"Coins"
	> {}

@scribeEvent({
	data: PlayerData,
	kind: "keyAdded",
	path: "Inventory",
})
export class InventoryItemAdded
	extends ScribeKeyAdded<
		typeof PlayerData,
		"Inventory"
	> {}

@client
@observer({ event: CoinsChanged })
export class UpdateCoins {
	run(
		event: CoinsChanged,
		data: ScribeClientReader<typeof PlayerData>,
	): void {
		print(event.before, "->", event.after);
		print("Committed", data.Coins.get());
	}
}

@client
@system({ schedule: Update })
export class RecordCoinChanges {
	run(changes: EventReader<CoinsChanged>): void {
		changes.forEach((change) => {
			print(change.after);
		});
	}
}
// #endregion scribe-events

// #region shared-read
@client
@system({ schedule: Update })
export class RenderOtherPlayerTitle {
	run(shared: ScribeSharedReader<typeof PlayerData>): void {
		const other = shared.get(123456);
		if (other !== undefined) {
			print(
				other.Public.DisplayName,
				other.Public.Title,
			);
		}
	}
}
// #endregion shared-read

// #region stable-server-read
export function inspectServerReader(
	player: Player,
	data: ScribeServerReader<typeof PlayerData>,
): void {
	const profile = data.get(player);
	const required = data.require(player);
	const state = data.state(player);
	print(profile, required, state);
}
// #endregion stable-server-read

// #region same-set-stability
export function queueAndReadCoins(
	player: Player,
	data: ScribeServerReader<typeof PlayerData>,
	writes: ScribeServerWriter<typeof PlayerData>,
): readonly [number, number] {
	const before = data.require(player).Coins.get();
	writes.for(player).Coins.increment(25);
	const during = data.require(player).Coins.get();
	return [before, during] as const;
}
// #endregion same-set-stability
