import { verification, verifyPoolCleanup, verifySignalMode } from "../shared/configuration";
import { proof } from "../shared/proof";
import { runTimingProbe, runBenchmarks } from "../shared/benchmarks";
import { apiProof } from "../shared/api-proof";
import { faultProof } from "../shared/fault-proof";
import { HttpService } from "@rbxts/services";
const [ok, result] = pcall(() => {
	print(`ROVY_PARALLEL_SIGNAL client ${verifySignalMode()}`);
	print(proof());
	print(`ROVY_PARALLEL_API ${HttpService.JSONEncode(apiProof())}`);
	print(`ROVY_PARALLEL_FAULTS client ${HttpService.JSONEncode(faultProof())}`);
	if (verification.GetAttribute("ParallelProbeSide") === "client") {
		task.wait(1);
		runTimingProbe();
		if (verification.GetAttribute("ParallelBenchmark") === true) runBenchmarks();
	}
	verifyPoolCleanup();
	return "ROVY_PARALLEL_CLIENT_OK";
});
print(ok ? `CLIENT ${result}` : `ROVY_PARALLEL_CLIENT_FAILED ${result}`);
verification.SetAttribute("ParallelClientResult", tostring(result));
verification.SetAttribute("ParallelClientOK", ok);
