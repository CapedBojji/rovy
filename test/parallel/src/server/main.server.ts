import { proof } from "../shared/proof";
import { runTimingProbe, runBenchmarks } from "../shared/benchmarks";
const [ok, result] = pcall(() => {
	print(`ROVY_PARALLEL_BUILD ${game.GetAttribute("ParallelBuildStamp")}`);
	print(proof());
	if (game.GetAttribute("ParallelProbeSide") === "server") {
		task.wait(1);
		runTimingProbe();
		if (game.GetAttribute("ParallelBenchmark") === true) runBenchmarks();
	}
	return "ROVY_PARALLEL_SERVER_OK";
});
print(ok ? result : `ROVY_PARALLEL_SERVER_FAILED ${result}`);
