import { job } from "@rovy/parallel/worker";

export const FrameProbe = job<[number, Folder], { start: number; finish: number; frame: number; phase: string; checksum: number }>()({
	run(input, output) {
		for (let row = 0; row < input.count; row++) {
			const start = os.clock();
			const marker = input.columns[1][row];
			const frame = marker.GetAttribute("Frame") as number;
			const phase = marker.GetAttribute("Phase") as string;
			let checksum = 0;
			for (let i = 0; i < input.columns[0][row]; i++) checksum += math.noise(i * 0.01, 1, 2);
			output[row] = { start, finish: os.clock(), frame, phase, checksum };
		}
	},
});
