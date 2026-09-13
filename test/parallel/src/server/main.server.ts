import { verification, verifyPoolCleanup, verifySignalMode } from "../shared/configuration";
import { proof } from "../shared/proof";
import { runTimingProbe, runBenchmarks } from "../shared/benchmarks";
import { apiProof } from "../shared/api-proof";
import { faultProof } from "../shared/fault-proof";
import { HttpService } from "@rbxts/services";
const [ok, result] = pcall(() => {
	print(`ROVY_PARALLEL_BUILD ${verification.GetAttribute("ParallelBuildStamp")}`);
	print(`ROVY_PARALLEL_SIGNAL server ${verifySignalMode()}`);
	print(proof());
	print(`ROVY_PARALLEL_API ${HttpService.JSONEncode(apiProof())}`);
	print(`ROVY_PARALLEL_FAULTS server ${HttpService.JSONEncode(faultProof())}`);
	if (verification.GetAttribute("ParallelProbeSide") === "server") {
		task.wait(1);
		runTimingProbe();
		if (verification.GetAttribute("ParallelBenchmark") === true) runBenchmarks();
	}
	verifyPoolCleanup();
	return "ROVY_PARALLEL_SERVER_OK";
});
print(ok ? result : `ROVY_PARALLEL_SERVER_FAILED ${result}`);
verification.SetAttribute("ParallelServerResult", tostring(result));
verification.SetAttribute("ParallelServerOK", ok);
