import {
	EventReader,
	Res,
	SystemSet,
	client,
	observer,
	server,
	system,
} from "@rovy/core";
import {
	ScribeClientReader,
	ScribeClientShape,
	ScribeClientState,
	ScribeCommand,
	ScribeCommandCompleted,
	ScribeCommandReader,
	ScribeCommandResponder,
	ScribeDataOptions,
	ScribeJobCompleted,
	ScribeKeyAdded,
	ScribeKeyRemoved,
	ScribeLocalWriter,
	ScribePersistence,
	ScribePersistedShape,
	ScribeReady,
	ScribeReceipts,
	ScribeServerReader,
	ScribeServerWriter,
	ScribeSharedReader,
	ScribeSharedShape,
	ScribeNativeModule,
	ScribeValueChanged,
	s,
	scribeCommand,
	scribeData,
	scribeEvent,
} from "@rovy/scribe";

// Rovy core does not currently export a built-in Update schedule.
class Update {}

export const PlayerData = scribeData({
	name: "PlayerData",
	profileStoreIndex: "PlayerData",
	profileKeyPrefix: "PLAYER_",
	template: {
		Coins: s.int(0, {
			min: 0,
		}),
		EquippedItem: s.optional(
			s.string("", {
				maxLength: 64,
			}),
		),
		Inventory: s.dictOf(
			{
				Amount: s.int(1, {
					min: 1,
				}),
				Level: s.int(1, {
					min: 1,
					max: 100,
				}),
			},
			{
				maxKeys: 200,
				maxKeyLength: 64,
			},
		),
		ActiveBoost: s.timed(1),
		LastPosition: s.vector3(Vector3.zero),
		CreatedAt: s.dynamic(() => os.time()),
		Public: s.shared({
			DisplayName: s.string("", {
				maxLength: 32,
			}),
			Title: s.string("", {
				maxLength: 32,
			}),
		}),
		Secret: s.serverOnly({
			Flagged: false,
		}),
		Runtime: s.session({
			InCombat: false,
		}),
	},
	options: {
		saveInterval: 60,
		boundsPolicy: "clamp",
		wipeGuardPolicy: "block",
	},
});

@scribeEvent({
	data: PlayerData,
	kind: "ready",
})
export class PlayerDataReady extends ScribeReady<typeof PlayerData> {}

@scribeEvent({
	data: PlayerData,
	kind: "changed",
	path: "Coins",
})
export class CoinsChanged extends ScribeValueChanged<typeof PlayerData, "Coins"> {}

@scribeEvent({
	data: PlayerData,
	kind: "keyAdded",
	path: "Inventory",
})
export class InventoryItemAdded extends ScribeKeyAdded<typeof PlayerData, "Inventory"> {}

@scribeEvent({
	data: PlayerData,
	kind: "keyRemoved",
	path: "Inventory",
})
export class InventoryItemRemoved extends ScribeKeyRemoved<typeof PlayerData, "Inventory"> {}

export class EquipItemResult {
	constructor(
		public readonly equipped: boolean,
		public readonly reason?: "not-owned" | "invalid-item",
	) {}
}

@scribeCommand({
	data: PlayerData,
	result: EquipItemResult,
})
export class EquipItem {
	constructor(public readonly itemId: string) {}
}

@scribeEvent({
	command: EquipItem,
	kind: "commandCompleted",
})
export class EquipItemCompleted extends ScribeCommandCompleted<EquipItem, EquipItemResult> {}

class TextLabelLike {
	Visible = false;
	Text = "";
}

class PlayerHud {
	readonly loading = new TextLabelLike();
	readonly content = new TextLabelLike();
	readonly coins = new TextLabelLike();
	readonly swordLevel = new TextLabelLike();
	readonly boost = new TextLabelLike();

	showError(_message: string): void {}
	showEquipped(): void {}
}

@client
@system({ schedule: Update })
export class RenderHud {
	run(
		data: ScribeClientReader<typeof PlayerData>,
		state: ScribeClientState<typeof PlayerData>,
		hud: Res<PlayerHud>,
	): void {
		if (!state.ready) {
			hud.loading.Visible = true;
			hud.content.Visible = false;
			return;
		}
		hud.loading.Visible = false;
		hud.content.Visible = true;
		hud.coins.Text = tostring(data.Coins.get());
		const sword = data.Inventory.at("IronSword").get();
		hud.swordLevel.Text = sword === undefined ? "Not owned" : tostring(sword.Level);
		hud.boost.Visible = data.ActiveBoost.active().active;
	}
}

declare const selectedItemChanged: boolean;
declare const selectedItemId: string;

@client
@system({ schedule: Update })
export class PreviewSelection {
	run(
		data: ScribeClientReader<typeof PlayerData>,
		localWrites: ScribeLocalWriter<typeof PlayerData>,
	): void {
		if (!selectedItemChanged) {
			return;
		}
		localWrites.EquippedItem.set(selectedItemId);
		print(data.EquippedItem.get());
	}
}

class EquipItemPressed {
	constructor(public readonly itemId: string) {}
}

@client
@system({ schedule: Update })
export class RequestEquipItem {
	run(
		pressed: EventReader<EquipItemPressed>,
		equip: ScribeCommand<EquipItem>,
	): void {
		pressed.forEach((event) => {
			equip.call(new EquipItem(event.itemId));
		});
	}
}

@client
@observer({
	event: EquipItemCompleted,
})
export class ShowEquipItemResult {
	run(event: EquipItemCompleted, hud: Res<PlayerHud>): void {
		if (!event.result.ok) {
			hud.showError(event.result.error);
			return;
		}
		if (!event.result.value.equipped) {
			hud.showError(event.result.value.reason ?? "Unable to equip item");
			return;
		}
		hud.showEquipped();
	}
}

@server
@system({ schedule: Update })
export class HandleEquipItem {
	run(
		requests: ScribeCommandReader<EquipItem>,
		data: ScribeServerReader<typeof PlayerData>,
		writes: ScribeServerWriter<typeof PlayerData>,
		respond: ScribeCommandResponder,
	): void {
		requests.forEach((request) => {
			const profile = data.get(request.player);
			if (profile === undefined) {
				respond.reject(request, "profile-not-ready");
				return;
			}
			const item = profile.Inventory.at(request.value.itemId).get();
			if (item === undefined) {
				respond.resolve(request, new EquipItemResult(false, "not-owned"));
				return;
			}
			writes.for(request.player).EquippedItem.set(request.value.itemId);
			respond.resolve(request, new EquipItemResult(true));
		});
	}
}

class EnemyDefeated {
	constructor(
		public readonly player: Player,
		public readonly enemyType: string,
	) {}
}

@server
@system({ schedule: Update })
export class AwardCoins {
	run(
		defeated: EventReader<EnemyDefeated>,
		writes: ScribeServerWriter<typeof PlayerData>,
	): void {
		defeated.forEach((event) => {
			writes.for(event.player).Coins.increment(25, {
				flow: "source",
				transactionType: "EnemyReward",
				itemSku: event.enemyType,
			});
		});
	}
}

@client
@observer({
	event: CoinsChanged,
})
export class UpdateCoins {
	run(
		event: CoinsChanged,
		data: ScribeClientReader<typeof PlayerData>,
		hud: Res<PlayerHud>,
	): void {
		print("Coins:", event.before, "->", event.after);
		hud.coins.Text = tostring(data.Coins.get());
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

declare const player: Player;

class RewardSet extends SystemSet {}
class NextSet extends SystemSet {}

@server
@system({
	schedule: Update,
	set: RewardSet,
})
export class QueueReward {
	run(
		data: ScribeServerReader<typeof PlayerData>,
		writes: ScribeServerWriter<typeof PlayerData>,
	): void {
		const before = data.require(player).Coins.get();
		writes.for(player).Coins.increment(50);
		const during = data.require(player).Coins.get();
		print(before);
		print(during);
	}
}

@server
@system({
	schedule: Update,
	set: NextSet,
})
export class ReadReward {
	run(data: ScribeServerReader<typeof PlayerData>): void {
		print(data.require(player).Coins.get());
	}
}

function queueTransaction(writes: ScribeServerWriter<typeof PlayerData>): void {
	writes.transaction(player, (transaction) => {
		transaction.Coins.decrement(100);
		transaction.Inventory.at("HealthPotion").Amount.increment(1);
	});
}

declare const otherPlayer: Player;

@client
@system({ schedule: Update })
export class RenderOtherPlayerTitle {
	run(shared: ScribeSharedReader<typeof PlayerData>): void {
		const other = shared.get(otherPlayer);
		if (other === undefined) {
			return;
		}
		print(other.Public.DisplayName, other.Public.Title);
	}
}

class ForceSaveRequested {
	constructor(public readonly player: Player) {}
}

@server
@system({ schedule: Update })
export class ProcessForceSave {
	run(
		requests: EventReader<ForceSaveRequested>,
		persistence: ScribePersistence<typeof PlayerData>,
	): void {
		requests.forEach((request) => {
			const handle = persistence.saveNow(request.player, {
				force: true,
			});
			print(handle);
		});
	}
}

// Positive API assertions.
declare const clientData: ScribeClientReader<typeof PlayerData>;
declare const localWrites: ScribeLocalWriter<typeof PlayerData>;
declare const serverData: ScribeServerReader<typeof PlayerData>;
declare const inferredCommand: ScribeCommand<EquipItem>;
declare const typedCommand: ScribeCommand<EquipItem, EquipItemResult>;

clientData.Coins.get();
clientData.Coins.default();
clientData.Coins.min();
clientData.Coins.max();
clientData.Inventory.get();
clientData.Inventory.clone();
clientData.Inventory.count();
clientData.Inventory.at("IronSword").Level.get();
clientData.ActiveBoost.active();
localWrites.EquippedItem.set("IronSword");
serverData.require(player).Secret.Flagged.get();

const inferredHandle = inferredCommand.call(new EquipItem("IronSword"));
const inferredResult = inferredCommand.takeResult(inferredHandle);
if (inferredResult?.ok) {
	const decoratorCannotSupplyThisType: unknown = inferredResult.value;
	print(decoratorCannotSupplyThisType);
}

const typedHandle = typedCommand.call(new EquipItem("IronSword"));
const typedResult = typedCommand.takeResult(typedHandle);
if (typedResult?.ok) {
	const equipped: boolean = typedResult.value.equipped;
	print(equipped);
}

declare const completedJob: ScribeJobCompleted<boolean>;
const jobValue: boolean | undefined = completedJob.result.ok ? completedJob.result.value : undefined;
print(jobValue);
queueTransaction;

type Expect<T extends true> = T;
type ExpectFalse<T extends false> = T;
type Equal<Left, Right> =
	(<T>() => T extends Left ? 1 : 2) extends <T>() => T extends Right ? 1 : 2
		? true
		: false;

type ClientShape = ScribeClientShape<typeof PlayerData>;
type SharedShape = ScribeSharedShape<typeof PlayerData>;
type PersistedShape = ScribePersistedShape<typeof PlayerData>;
type ClientCoinsReader = (typeof clientData)["Coins"];

type _ClientCoins = Expect<Equal<ClientShape["Coins"], number>>;
type _ClientOptional = Expect<Equal<ClientShape["EquippedItem"], string | undefined>>;
type _ClientHasNoSecret = ExpectFalse<"Secret" extends keyof ClientShape ? true : false>;
type _ReaderHasNoSet = ExpectFalse<"set" extends keyof ClientCoinsReader ? true : false>;
type _ReaderHasNoObserve = ExpectFalse<"observe" extends keyof ClientCoinsReader ? true : false>;
type _ReaderHasNoChanged = ExpectFalse<"changed" extends keyof ClientCoinsReader ? true : false>;
type _SharedOnlyPublic = Expect<Equal<keyof SharedShape, "Public">>;
type _SessionNotPersisted = ExpectFalse<"Runtime" extends keyof PersistedShape ? true : false>;
type _NativeHasNoConfigure = ExpectFalse<"Configure" extends keyof ScribeNativeModule ? true : false>;
type _NativeHasNoReason = ExpectFalse<"Reason" extends keyof ScribeNativeModule ? true : false>;
type _ReceiptsHaveNoTryHandle = ExpectFalse<
	"tryHandleReceipt" extends keyof ScribeReceipts<typeof PlayerData> ? true : false
>;
type _OptionsHaveNoMode = ExpectFalse<"mode" extends keyof ScribeDataOptions ? true : false>;
type _OptionsHaveNoTargetUserId = ExpectFalse<"targetUserId" extends keyof ScribeDataOptions ? true : false>;
