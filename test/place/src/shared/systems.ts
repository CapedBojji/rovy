import { system, type Commands } from "@rovy/core";
import type { DocumentOpener, DocumentWriter } from "@rovy/datastore";
import { OWNER, Profile } from "./documents";
import { ProfileFieldChanged } from "./events";
import { Tick } from "./schedules";

type Action = "open" | "addCoins" | "save" | "sendFieldChanged";

/**
 * Document handles are injected params, so writes have to happen inside a
 * system. The driver queues one action and pumps `Tick` to run it.
 */
const queued = new Array<Action>();

export function queueAction(action: Action): void {
	queued.push(action);
}

export const observed = {
	coins: -1,
};

@system({ schedule: Tick })
export class DriveDocument {
	run(
		commands: Commands,
		opener: DocumentOpener<typeof Profile>,
		writer: DocumentWriter<typeof Profile>,
	): void {
		while (queued.size() > 0) {
			const action = queued.shift();
			if (action === "open") {
				opener.open(OWNER);
			} else if (action === "addCoins") {
				writer.update(OWNER, (data) => ({ ...data, coins: data.coins + 10 }));
			} else if (action === "save") {
				writer.save(OWNER);
			} else if (action === "sendFieldChanged") {
				commands.send(new ProfileFieldChanged("coins"));
			}
		}
		const data = writer.get(OWNER);
		observed.coins = data === undefined ? -1 : data.coins;
	}
}
