/**
 * Flush = apply queued commands to convergence. Observer-/system-produced
 * commands re-enter the loop until the queue is empty (Phase 6 adds the
 * trigger→observer path that makes convergence non-trivial; the loop shape is
 * established here). A cycle cap guards against pathological infinite chains.
 */

import type { CommandsImpl } from "./commands";

const MAX_CYCLES = 1_000;

export function flush(commands: CommandsImpl): void {
	let cycles = 0;
	while (commands.hasPending()) {
		commands.drain();
		cycles += 1;
		assert(
			cycles < MAX_CYCLES,
			`[rovy] flush did not converge after ${MAX_CYCLES} cycles — command-producing cycle?`,
		);
	}
}
