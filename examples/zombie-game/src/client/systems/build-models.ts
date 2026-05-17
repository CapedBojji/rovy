import { Entity, Query, ResMut, World, system } from "@rovy/core";
import type { Without } from "@rovy/core";
import { RenderRegistry } from "../resources";
import { Render, SnapshotSet, ensureRootFolder } from "../state";
import { Model, ModelData } from "../components";

@system({ schedule: Render, set: SnapshotSet })
export class BuildModels {
	run(world: World, reg: ResMut<RenderRegistry>, q: Query<[Entity, ModelData], Without<Model>>) {
		q.forEach((entity, modelData) => {
			const part = new Instance("Part");
			part.Anchored = true;
			part.CanCollide = false;
			part.CanQuery = false;
			part.CanTouch = false;
			part.Size = modelData.size;
			part.Color = modelData.color;
			part.Material = modelData.material;
			part.CFrame = new CFrame(new Vector3(0, modelData.yOffset, 0));
			part.Parent = ensureRootFolder(reg);
			world.set(entity, Model, new Model(part));
		});
	}
}
