import { job } from "@rovy/parallel/worker";

export function scoreNpc(position: Vector3, target: Vector3): number {
	const delta = target.sub(position);
	let score = 0;
	for (let sample = 0; sample < 32; sample++) {
		score += math.noise(delta.X * 0.01, delta.Z * 0.01, sample * 0.1);
	}
	return score;
}

export const NpcScore = job<[Vector3, Vector3], number>()({
	run(input, output) {
		const [positions, targets] = input.columns;
		for (let i = 0; i < input.count; i++) {
			output[i] = scoreNpc(positions[i], targets[i]);
		}
	},
});
