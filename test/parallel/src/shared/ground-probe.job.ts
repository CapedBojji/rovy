import { Workspace } from "@rbxts/services";
import { job } from "@rovy/parallel/worker";

export const GroundProbe = job<[Vector3, Vector3], boolean, RaycastParams>()({
	setup() {
		const params = new RaycastParams();
		params.IgnoreWater = true;
		params.RespectCanCollide = true;
		return params;
	},
	run(input, output, params) {
		const [origins, directions] = input.columns;
		for (let i = 0; i < input.count; i++) {
			output[i] = Workspace.Raycast(origins[i], directions[i], params) !== undefined;
		}
	},
});
