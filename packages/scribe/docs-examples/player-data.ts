// #region player-data
import { s, scribeData } from "@rovy/scribe";

export const PlayerData = scribeData({
	name: "PlayerData",
	profileStoreIndex: "PlayerData",
	profileKeyPrefix: "PLAYER_",
	template: {
		Coins: s.int(0, { min: 0 }),
		EquippedItem: s.optional(
			s.string("", { maxLength: 64 }),
		),
		Inventory: s.dictOf(
			{
				Amount: s.int(1, { min: 1 }),
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
		perks: ["VIP"],
		economy: {
			currencies: {
				Coins: {
					label: "Gold",
					fields: ["Region"],
				},
			},
		},
	},
});
// #endregion player-data
