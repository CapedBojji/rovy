export interface InventoryItem {
	readonly id: string;
	readonly name: string;
	readonly kind: "gear" | "consumable" | "quest";
	readonly quantity: number;
	readonly description: string;
}

export const STARTER_ITEMS: ReadonlyArray<InventoryItem> = [
	{
		id: "bronze-sword",
		name: "Bronze Sword",
		kind: "gear",
		quantity: 1,
		description: "Reliable starter blade for close-range trouble.",
	},
	{
		id: "field-tonic",
		name: "Field Tonic",
		kind: "consumable",
		quantity: 3,
		description: "Bitter drink that keeps long runs from ending early.",
	},
	{
		id: "torch",
		name: "Torch",
		kind: "gear",
		quantity: 1,
		description: "Lights tunnels and makes the camp UI feel less lonely.",
	},
	{
		id: "vault-key",
		name: "Vault Key",
		kind: "quest",
		quantity: 1,
		description: "Quest item with no combat use, but too important to drop.",
	},
];

export function makeSmokeBanner(name: string) {
	return `Rovy UI inventory example loaded from ${name}`;
}
