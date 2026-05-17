import { Entity, Query, Res, system } from "@rovy/core";
import { ClientClock } from "../resources";
import { Render, RenderSet, SNAPSHOT_INTERVAL } from "../state";
import { ClientPosition, Model, ModelData, PreviousPosition } from "../components";

@system({ schedule: Render, set: RenderSet })
export class SyncPositions {
	run(
		clock: Res<ClientClock>,
		q: Query<[Entity, ClientPosition, PreviousPosition, Model, ModelData]>,
	) {
		q.forEach((_entity, pos, prev, model, modelData) => {
			const alpha = math.clamp((clock.now - prev.receivedAt) / SNAPSHOT_INTERVAL, 0, 1);
			const interpolated = prev.value.Lerp(pos.value, alpha);
			model.part.CFrame = new CFrame(interpolated.add(new Vector3(0, modelData.yOffset, 0)));
		});
	}
}
