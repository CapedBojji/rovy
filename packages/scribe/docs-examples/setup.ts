// #region server-setup
import { App } from "@rovy/core";
import {
	ScribeServerPlugin,
	configureScribeServer,
} from "@rovy/scribe";
import { PlayerData } from "./player-data";

export const PlayerDataServerSetup =
	configureScribeServer(PlayerData, {
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
			if (data.CreatedAt.get() === 0) {
				data.CreatedAt.set(os.time());
			}
		},
		productGrants: {
			Coins100(context) {
				context.data.Coins.increment(100);
			},
		},
	});

const app = new App();
app.addPlugin(
	new ScribeServerPlugin({
		configure: {
			autoSaveInterval: 60,
		},
		bundles: [PlayerDataServerSetup],
	}),
);
app.start();
// #endregion server-setup
