import type { DocumentReader, DocumentWriter } from "./types";
import { playerDocument } from "./document";

interface ProfileData {
	coins: number;
	pets: Record<string, { level: number }>;
}

export const TypecheckProfile = playerDocument<ProfileData>()({
	name: "TypecheckProfile",
	store: "TypecheckProfile",
	default: () => ({
		coins: 0,
		pets: {},
	}),
});

declare const player: Player;
declare const reader: DocumentReader<typeof TypecheckProfile>;
declare const writer: DocumentWriter<typeof TypecheckProfile>;

reader.get(player)?.coins;
writer.update(player, (data) => ({
	...data,
	coins: data.coins + 1,
}));
