import { WorkerPool } from "@rovy/parallel";
import { FaultProbe } from "./fault.job";

/** Real Actor failure/reuse checks; intentional errors never escape the pool. */
export function faultProof() {
	const pool = new WorkerPool({ jobs: [FaultProbe], workers: 1, chunkSize: 2, maxBatches: 1, maxRows: 4 });
	const [ok, report] = pcall(() => {
		assert(pool.ready(10), "fault-test worker not ready");
		const submit = (values: number[]) => {
			const ticket = pool.submit(FaultProbe.__id, { columns: [values], count: values.size() });
			assert(ticket !== undefined, "fault-test submission rejected");
			return ticket;
		};
		const success = (values: number[]) => {
			const ticket = submit(values);
			assert(pool.wait(ticket, 5).ok, "worker did not recover");
			assert(pool.poll(ticket, (result) => {
				assert(result.status === "success" && result.count === values.size());
				for (let row = 0; row < values.size(); row++) assert(result.output[row] === values[row] * 2, "stale scratch value");
			}));
		};
		success([]);
		success([1, 2, 3, 4]);
		success([9]);
		for (const mode of [-1, -2]) {
			const ticket = submit([1, mode]);
			assert(!pool.wait(ticket, 5).ok, "bad kernel unexpectedly succeeded");
			assert(pool.poll(ticket, (result) => {
				assert(result.status === "failed" && result.reason === "kernel");
				assert(result.output.size() === 0, "partial results escaped failed batch");
			}));
			success([7]);
		}
		const cancelled = submit([1, 2, 3, 4]);
		assert(pool.cancel(cancelled));
		assert(pool.stats().busyWorkers === 1, "cancel reused an active worker");
		assert(pool.poll(cancelled, (result) => assert(result.reason === "cancelled")));
		success([11]); // Must wait for the cancelled worker's late reply, then reuse it.
		const expired = submit([1, 2, 3, 4]);
		assert(!pool.wait(expired, 0).ok);
		assert(pool.poll(expired, (result) => assert(result.reason === "timeout")));
		success([12]);
		const retained = submit([1]);
		assert(pool.submit(FaultProbe.__id, { columns: [[2]], count: 1 }) === undefined, "capacity bound ignored");
		assert(pool.wait(retained, 5).ok);
		const [callbackOK] = pcall(() => pool.poll(retained, () => error("expected callback error")));
		assert(!callbackOK && pool.stats().retainedBatches === 0, "callback error leaked storage");
		success([13]);
		const stats = pool.stats();
		assert(stats.failed === 2 && stats.cancelled === 2 && stats.rejected === 1, "failure accounting differs");
		assert(stats.retainedBatches === 0 && stats.busyWorkers === 0);
		submit([1, 2, 3, 4]);
		pool.destroy();
		assert(pool.stats().retainedBatches === 0 && pool.stats().busyWorkers === 0, "teardown retained active work");
		return { kernelErrors: 2, cancellationAndTimeout: 2, exhaustion: 1, callbackErrors: 1, reuse: true, destructionDuringWork: true };
	});
	pool.destroy();
	if (!ok) error(tostring(report));
	return report;
}
