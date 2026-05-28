import { Entity, monitor, query } from "@rovy/core";
import { Model } from "../components";

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
