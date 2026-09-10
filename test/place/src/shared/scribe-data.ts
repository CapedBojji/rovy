import { s, scribeData, scribeEvent, ScribeValueChanged } from "@rovy/scribe";

/**
 * A real `scribeData` declaration and a real `@scribeEvent` class, so the UI
 * binding below is exercised against the genuine authoring surface rather than
 * a stand-in.
 *
 * Declaring the schema is enough to make `@rovy/scribe` resolve the native
 * peer, so the place maps the vendored Scribe module to
 * `ReplicatedStorage.Packages.Scribe`, where the resolver looks by default.
 * That makes this run a real check that the supported Scribe version loads and
 * binds inside a DataModel.
 *
 * The place still does not add `ScribePlugin`: driving a live profile needs a
 * joined Player and both boundaries, which `packages/scribe/test/studio` covers
 * under a playtest.
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
