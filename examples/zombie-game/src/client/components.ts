import { component } from "@rovy/core";

@component
export class ModelData {
	constructor(
		public size: Vector3,
		public color: Color3,
		public material: Enum.Material,
		public yOffset: number,
	) {}
}

@component
export class Model {
	constructor(public part: Part) {}
}

@component
export class ClientPosition {
	constructor(public value: Vector3) {}
}

@component
export class PreviousPosition {
	constructor(public value: Vector3, public receivedAt: number) {}
}

@component
export class ClientZombie {}

@component
export class ClientProjectile {}

@component
export class NetworkId {
	constructor(public value: number) {}
}
