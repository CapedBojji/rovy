import { event, schedule } from "@rovy/core";

@schedule
export class Update {}

@event()
export class EnemyDefeated {
	constructor(
		public readonly player: Player,
		public readonly enemyType: string,
	) {}
}

@event()
export class PreviewItemSelected {
	constructor(public readonly itemId: string) {}
}

@event()
export class EquipItemPressed {
	constructor(public readonly itemId: string) {}
}

@event()
export class ForceSaveRequested {
	constructor(public readonly player: Player) {}
}

@event()
export class PurchaseRequested {
	constructor(
		public readonly player: Player,
		public readonly itemId: string,
	) {}
}
