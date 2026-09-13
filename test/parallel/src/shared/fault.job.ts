import { job } from "@rovy/parallel/worker";

export const FaultProbe = job<[number], number>()({
	run(input, output) {
		for (let row = 0; row < input.count; row++) {
			const value = input.columns[0][row];
			if (value === -1) error("expected parallel test error");
			if (value === -2) coroutine.yield();
			output[row] = value * 2;
		}
	},
});
