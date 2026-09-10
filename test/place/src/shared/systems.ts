import { system, type Commands } from "@rovy/core";
import type { DocumentOpener, DocumentReader, DocumentWriter } from "@rovy/datastore";
import { OWNER, Profile, WorldConfig } from "./documents";
import { ProfileFieldChanged } from "./events";
import { ScribeCoinsChanged } from "./scribe-data";
import { Tick } from "./schedules";

type Action = "open" | "addCoins" | "save" | "sendFieldChanged" | "openShared" | "sendScribeChanged";

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
	sharedKey: "",
	sharedSeason: "",
};

@system({ schedule: Tick })
export class DriveDocument {
	run(
		commands: Commands,
		opener: DocumentOpener<typeof Profile>,
		writer: DocumentWriter<typeof Profile>,
		sharedOpener: DocumentOpener<typeof WorldConfig>,
		sharedReader: DocumentReader<typeof WorldConfig>,
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
			} else if (action === "sendScribeChanged") {
				// Exactly what ScribeEventRuntime.flush does for a profile change.
				commands.send(new ScribeCoinsChanged());
			} else if (action === "openShared") {
				// Calls def.key(owner) internally: a shared document whose string
				// key was emitted verbatim used to throw here.
				observed.sharedKey = sharedOpener.keyOf(undefined);
				sharedOpener.open(undefined);
			}
		}
		const data = writer.get(OWNER);
		observed.coins = data === undefined ? -1 : data.coins;
		const shared = sharedReader.get(undefined);
		observed.sharedSeason = shared === undefined ? "" : shared.season;
	}
}
