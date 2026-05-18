import { Entity, monitor, query } from "@rovy/core";
import { Model } from "../components";

/**
 * Destroys the Roblox Part when a Model component leaves an entity — whether
 * via explicit component removal or entity despawn.
 *
 * onExit params are undefined after despawn (reconcile runs post-deletion), so
 * we cache the Part reference in onEnter and look it up in onExit.
 */
@monitor({ match: query<[Model]>() })
export class DestroyModelOnExit {
	private readonly parts = new Map<Entity, Part>();

	onEnter(entity: Entity, model: Model): void {
		this.parts.set(entity, model.part);
	}

	onExit(entity: Entity, _model: Model): void {
		const part = this.parts.get(entity);
		if (part !== undefined) part.Destroy();
		this.parts.delete(entity);
	}
}
