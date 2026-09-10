import { s, scribeData, scribeEvent, ScribeValueChanged } from "@rovy/scribe";

/**
 * A real `scribeData` declaration and a real `@scribeEvent` class, so the UI
 * binding below is exercised against the genuine authoring surface rather than
 * a stand-in.
 *
 * The declaration only registers metadata; `ScribePlugin` is what reaches for
 * the native Scribe peer, and this place deliberately does not add it. Scribe's
 * own runtime is covered by `packages/scribe/test` and its Studio fixture.
 */
export const PlayerData = scribeData({
	name: "IntegrationPlayerData",
	profileStoreIndex: "IntegrationPlayerData",
	profileKeyPrefix: "PLAYER_",
	template: {
		Coins: s.int(0, { min: 0 }),
	},
});

@scribeEvent({
	data: PlayerData,
	kind: "changed",
	path: "Coins",
})
export class ScribeCoinsChanged extends ScribeValueChanged<typeof PlayerData, "Coins"> {}
