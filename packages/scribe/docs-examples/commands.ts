// #region commands
import {
	EventReader,
	client,
	observer,
	server,
	system,
} from "@rovy/core";
import {
	ScribeCommand,
	ScribeCommandCompleted,
	ScribeCommandHandle,
	ScribeCommandReader,
	ScribeCommandResponder,
	ScribeServerReader,
	ScribeServerWriter,
	scribeCommand,
	scribeEvent,
} from "@rovy/scribe";
import { PlayerData } from "./player-data";
import { EquipItemPressed, Update } from "./support";

export class EquipItemResult {
	constructor(
		public readonly equipped: boolean,
		public readonly reason?:
			| "not-owned"
			| "invalid-item",
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
export class EquipItemCompleted
	extends ScribeCommandCompleted<
		EquipItem,
		EquipItemResult
	> {}

@client
@system({ schedule: Update })
export class RequestEquipItem {
	run(
		pressed: EventReader<EquipItemPressed>,
		equip: ScribeCommand<
			EquipItem,
			EquipItemResult
		>,
	): void {
		pressed.forEach((event) => {
			equip.call(new EquipItem(event.itemId));
		});
	}
}

@server
@system({ schedule: Update })
export class HandleEquipItem {
	run(
		requests: ScribeCommandReader<
			EquipItem,
			EquipItemResult
		>,
		data: ScribeServerReader<typeof PlayerData>,
		writes: ScribeServerWriter<typeof PlayerData>,
		respond: ScribeCommandResponder,
	): void {
		requests.forEach((request) => {
			const profile = data.get(request.player);
			const item = profile?.Inventory
				.at(request.value.itemId)
				.get();

			if (item === undefined) {
				respond.resolve(
					request,
					new EquipItemResult(
						false,
						"not-owned",
					),
				);
				return;
			}

			writes
				.for(request.player)
				.EquippedItem
				.set(request.value.itemId);
			respond.resolve(
				request,
				new EquipItemResult(true),
			);
		});
	}
}

@client
@observer({ event: EquipItemCompleted })
export class ShowEquipItemResult {
	run(event: EquipItemCompleted): void {
		if (!event.result.ok) {
			warn(event.result.error);
			return;
		}
		print(event.result.value.equipped);
	}
}
// #endregion commands

// #region command-polling
export function callOrPollEquip(
	equip: ScribeCommand<EquipItem, EquipItemResult>,
	pending?: ScribeCommandHandle<
		EquipItem,
		EquipItemResult
	>,
): ScribeCommandHandle<EquipItem, EquipItemResult> | undefined {
	if (pending === undefined) {
		return equip.call(new EquipItem("IronSword"));
	}

	const result = equip.takeResult(pending);
	if (result === undefined) return pending;
	print(result.ok ? result.value.equipped : result.error);
	return undefined;
}
// #endregion command-polling
