import { Entity, Query, Res, World, system } from "@rovy/core";
import { SNAPSHOT_INTERVAL } from "shared/contracts";
import { ClientPosition, Model, ModelData, PreviousPosition } from "../components";
import { ClientClock } from "../resources";
import { ModelSet, Render } from "../state";
import { BuildModels } from "./build-models";

@system({ schedule: Render, set: ModelSet, after: [BuildModels] })
export class SyncPositions {
	run(clock: Res<ClientClock>, world: World, q: Query<[Entity, ClientPosition, Model, ModelData]>) {
		q.forEach((entity, pos, model, data) => {
			const prev = world.get(entity, PreviousPosition);
			const alpha = prev !== undefined ? math.clamp((clock.now - prev.receivedAt) / SNAPSHOT_INTERVAL, 0, 1) : 1;
			const renderPosition = prev !== undefined ? prev.value.Lerp(pos.value, alpha) : pos.value;
			model.part.CFrame = new CFrame(renderPosition.add(new Vector3(0, data.yOffset, 0)));
		});
	}
}
