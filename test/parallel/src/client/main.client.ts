import { proof } from "../shared/proof";
import { runTimingProbe, runBenchmarks } from "../shared/benchmarks";
const [ok, result] = pcall(() => {
	print(proof());
	if (game.GetAttribute("ParallelProbeSide") === "client") {
		task.wait(1);
		runTimingProbe();
		if (game.GetAttribute("ParallelBenchmark") === true) runBenchmarks();
	}
	return "ROVY_PARALLEL_CLIENT_OK";
});
print(ok ? `CLIENT ${result}` : `ROVY_PARALLEL_CLIENT_FAILED ${result}`);
