import { component } from "@rovy/core";

@component
export class Monster {}

@component
export class Projectile {}

@component
export class Position {
	constructor(public value: Vector3 = new Vector3()) {}
}

@component
export class Velocity {
	constructor(public value: Vector3 = new Vector3()) {}
}

@component
export class Health {
	constructor(
		public current = 0,
		public max = current,
	) {}
}

@component
export class Radius {
	constructor(public value: number = 1) {}
}

@component
export class MoveSpeed {
	constructor(public value: number = 0) {}
}

@component
export class Damage {
	constructor(public value: number = 0) {}
}

@component
export class ShotProfile {
	constructor(
		public spawnIndex: number = 0,
		public willBeHit: boolean = false,
		public shotTaken: boolean = false,
	) {}
}

@component
export class ProjectileTarget {
	constructor(public wireId: number = 0) {}
}

@component
export class Lifetime {
	constructor(public remaining: number = 0) {}
}

@component
export class WireId {
	constructor(public value: number = 0) {}
}
