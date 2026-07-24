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
	ScribeCommandRequest,
	ScribeCommandResponder,
	ScribeCooldowns,
	ScribeDataOptions,
	ScribeJobCompleted,
	ScribeKeyAdded,
	ScribeKeyRemoved,
	ScribeLeaderboards,
	ScribeLocalWriter,
	ScribeMessaging,
	ScribeMonetization,
	ScribeOwnership,
	ScribePersistence,
	ScribePersistedShape,
	ScribePurchaseRecord,
	ScribeReady,
	ScribeReceipts,
	ScribeServerReader,
	ScribeServerWriter,
	ScribeSharedReader,
	ScribeSharedShape,
	ScribeNativeModule,
	ScribeUnsafe,
	ScribeValueChanged,
	configureScribeServer,
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
		leaderboards: {
			Coins: {
				stat: "Coins",
				limit: 25,
				replicate: true,
			},
		},
		products: {
			Coins100: {
				id: 123,
				category: "Currency",
				grants: "VIP",
			},
		},
		passes: {
			VIP: {
				id: 456,
				category: "Access",
			},
		},
		perks: ["VIP"],
		ownReceipts: true,
		purchaseLog: {
			robuxCap: 50,
			inGameCap: 50,
			replicateRobux: true,
		},
		gifting: {
			cooldown: 10,
			maxPending: 5,
			intentTtl: 300,
			allowDuplicate: false,
			noIntentPolicy: "grantOrCredit",
		},
		economy: {
			prefix: true,
			currencies: {
				Coins: {
					label: "Gold",
					fields: ["Region"],
				},
			},
		},
	},
});

declare const vector3Value: Vector3;
declare const vector2Value: Vector2;
declare const vector3int16Value: Vector3int16;
declare const vector2int16Value: Vector2int16;
declare const cframeValue: CFrame;
declare const color3Value: Color3;
declare const brickColorValue: BrickColor;
declare const udimValue: UDim;
declare const udim2Value: UDim2;
declare const rectValue: Rect;
declare const numberRangeValue: NumberRange;
declare const numberSequenceValue: NumberSequence;
declare const colorSequenceValue: ColorSequence;
declare const dateTimeValue: DateTime;
declare const enumItemValue: EnumItem;
declare const fontValue: Font;
declare const physicalPropertiesValue: PhysicalProperties;

export const DeclaratorCoverage = scribeData({
	name: "DeclaratorCoverage",
	profileStoreIndex: "DeclaratorCoverage",
	profileKeyPrefix: "DECLARATOR_",
	template: {
		Integer: s.int(0, { min: -10, max: 10 }),
		Number: s.number(0.5, { min: 0, max: 1 }),
		String: s.string("", { maxLength: 32 }),
		Enum: s.enum("A", ["A", "B"] as const),
		Timed: s.timed(0),
		Dynamic: s.dynamic(() => 1),
		Optional: s.optional(s.string("")),
		Array: s.arrayOf(s.int(0), { maxItems: 10 }),
		Dictionary: s.dictOf(s.string(""), {
			maxKeys: 10,
			maxKeyLength: 16,
		}),
		Vector3: s.vector3(vector3Value),
		Vector2: s.vector2(vector2Value),
		Vector3int16: s.vector3int16(vector3int16Value),
		Vector2int16: s.vector2int16(vector2int16Value),
		CFrame: s.cframe(cframeValue),
		Color3: s.color3(color3Value),
		BrickColor: s.brickColor(brickColorValue),
		UDim: s.udim(udimValue),
		UDim2: s.udim2(udim2Value),
		Rect: s.rect(rectValue),
		NumberRange: s.numberRange(numberRangeValue),
		NumberSequence: s.numberSequence(numberSequenceValue),
		ColorSequence: s.colorSequence(colorSequenceValue),
		DateTime: s.dateTime(dateTimeValue),
		EnumItem: s.enumItem(enumItemValue),
		Font: s.font(fontValue),
		PhysicalProperties: s.physicalProperties(physicalPropertiesValue),
		Server: s.serverOnly({ Hidden: true }),
		Shared: s.shared({ Visible: true }),
		Session: s.session({ Temporary: true }),
	},
	options: {
		mode: "Mock",
		targetUserId: 123,
	},
});

export const PlayerDataServerSetup = configureScribeServer(PlayerData, {
	migrations: [
		{
			version: 2,
			migrate(data) {
				return {
					...data,
					EquippedItem: undefined,
				};
			},
		},
	],
	onPlayerInit(_player, data) {
		const createdAt = data.CreatedAt.get();
		data.CreatedAt.set(createdAt === 0 ? os.time() : createdAt);
		data.Inventory.at("StarterSword").set({
			Amount: 1,
			Level: 1,
		});
	},
	productGrants: {
		Coins(context) {
			context.data.Coins.increment(100);
		},
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

@scribeEvent({
	data: PlayerData,
	kind: "jobCompleted",
})
export class PlayerDataJobCompleted extends ScribeJobCompleted<unknown> {}

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
		print(state.saveInfo.dirty);
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
		equip: ScribeCommand<EquipItem, EquipItemResult>,
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
		requests: ScribeCommandReader<EquipItem, EquipItemResult>,
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
declare const commandResponder: ScribeCommandResponder;
declare const typedRequest: ScribeCommandRequest<EquipItem, EquipItemResult>;
declare const persistenceService: ScribePersistence<typeof PlayerData>;
declare const messagingService: ScribeMessaging<typeof PlayerData>;
declare const leaderboardService: ScribeLeaderboards<typeof PlayerData>;
declare const monetizationService: ScribeMonetization<typeof PlayerData>;
declare const ownershipService: ScribeOwnership<typeof PlayerData>;
declare const cooldownService: ScribeCooldowns<typeof PlayerData>;
declare const receiptService: ScribeReceipts<typeof PlayerData>;
declare const unsafeService: ScribeUnsafe<typeof PlayerData>;

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
const offlineHandle = persistenceService.getOffline(123);
const offlineResult = persistenceService.takeResult(offlineHandle);
if (offlineResult?.ok && offlineResult.value !== undefined) {
	const offlineCoins: number = offlineResult.value.Coins;
	print(offlineCoins);
	// @ts-expect-error — session roots are not part of persisted snapshots.
	offlineResult.value.Runtime;
}
const messageHandle = messagingService.send(123, {
	kind: "award",
	amount: 5,
});
const messageResult = messagingService.takeResult(messageHandle);
print(messageResult, unsafeService.profileStore);
// @ts-expect-error — raw ProfileStore access is isolated to ScribeUnsafe.
persistenceService.profileStore;

const leaderboardEntries = leaderboardService.get("Coins", 10);
const leaderboardScore: number | undefined = leaderboardEntries[0]?.score;
const playerRank = leaderboardService.getMyRank("Coins", player);
const mirroredOwnership: boolean = ownershipService.owns("VIP", player);
const syncedOwnership = ownershipService.ownsSynced("VIP", 5);
const authoritativeOwnership = ownershipService.ownsAuthoritative(
	player,
	"VIP",
);
ownershipService.grantPerk(player, "VIP");
ownershipService.revokePerk(player, "VIP");
const giftCredits = monetizationService.getGiftCredits(player);
const gift = monetizationService.promptGift(player, "Coins100", 123);
const purchase = monetizationService.purchase(player, {
	cost: {
		path: "Coins",
		amount: 100,
	},
	category: "Potion",
	itemId: "HealthPotion",
	metadata: {
		Region: "US",
	},
	grant(writes) {
		writes.Inventory.at("HealthPotion").set({
			Amount: 1,
			Level: 1,
		});
	},
});
monetizationService.recordPurchase(player, {
	category: "Potion",
	itemId: "HealthPotion",
	metadata: {
		Region: "US",
	},
});
const purchaseRecords: ReadonlyArray<ScribePurchaseRecord> =
	monetizationService.getPurchases(player, {
		kind: "InGame",
		limit: 10,
	});
const cooldown = cooldownService.onCooldown(player, "Daily", 60);
const cooldownState = cooldownService.peek(player, "Daily");
cooldownService.clear(player, "Daily");
const receipt = receiptService.tryHandleReceipt({
	PlayerId: 123,
	PlaceIdWherePurchased: 456,
	PurchaseId: "receipt",
	ProductId: 789,
	CurrencySpent: 99,
});
print(
	leaderboardScore,
	playerRank,
	mirroredOwnership,
	syncedOwnership,
	authoritativeOwnership,
	giftCredits,
	gift,
	purchase,
	purchaseRecords,
	cooldown,
	cooldownState,
	receipt,
);
monetizationService.purchase(player, {
	cost: {
		// @ts-expect-error — purchase costs must reference a numeric schema leaf.
		path: "EquippedItem",
		amount: 1,
	},
	itemId: "Invalid",
});

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
commandResponder.resolve(typedRequest, new EquipItemResult(true));
// @ts-expect-error — result must match the explicit command result generic.
commandResponder.resolve(typedRequest, "not-a-result");

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
type _NativeHasConfigure = Expect<"Configure" extends keyof ScribeNativeModule ? true : false>;
type _NativeHasReason = Expect<"Reason" extends keyof ScribeNativeModule ? true : false>;
type _ReceiptsHaveTryHandle = Expect<
	"tryHandleReceipt" extends keyof ScribeReceipts<typeof PlayerData> ? true : false
>;
type _OptionsHaveMode = Expect<"mode" extends keyof ScribeDataOptions ? true : false>;
type _OptionsHaveTargetUserId = Expect<"targetUserId" extends keyof ScribeDataOptions ? true : false>;
