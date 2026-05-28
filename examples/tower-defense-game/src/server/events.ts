import { event } from "@rovy/core";

@event()
export class BaseDamaged {
	constructor(
		public monsterId: number = 0,
		public amount: number = 0,
		public tick: number = 0,
	) {}
}
