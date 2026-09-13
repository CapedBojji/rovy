import { RunService } from "@rbxts/services";
import { job } from "@rovy/parallel/worker";

export const FrameProbe = job<[number], { start: number; finish: number; frame: number; checksum: number }>()({
	run(input, output) {
		for (let row = 0; row < input.count; row++) {
			const start = os.clock();
			let checksum = 0;
			for (let i = 0; i < input.columns[0][row]; i++) checksum += math.noise(i * 0.01, 1, 2);
			output[row] = { start, finish: os.clock(), frame: RunService.FrameNumber, checksum };
		}
	},
});
