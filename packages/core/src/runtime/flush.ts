/**
 * One package-neutral flush boundary. Ordinary Rovy commands drain first,
 * registered package participants run in registration order, and any commands
 * produced by observers or participants re-enter the same bounded loop.
 */

import type { Ctor } from "../contract";
import type { Commands, World } from "../types";
import type { App } from "./app";
import type { CommandsImpl } from "./commands";

export interface FlushContext {
	readonly app: App;
	readonly world: World;
	readonly commands: Commands;
	readonly schedule?: Ctor;
	readonly set?: Ctor;
}

export interface FlushParticipant {
	/**
	 * Apply package-owned buffered work. Return true when work was applied or
	 * exposed, so every participant gets another convergence pass.
	 */
	flush(context: FlushContext): boolean;
}

const MAX_CYCLES = 1_000;

export function flush(
	commands: CommandsImpl,
	participants: ReadonlyArray<FlushParticipant> = [],
	context?: FlushContext,
): void {
	assert(
		participants.size() === 0 || context !== undefined,
		"[rovy] flush participants require a FlushContext",
	);

	let cycles = 0;
	while (commands.hasPending() || participants.size() > 0) {
		cycles += 1;

		if (commands.hasPending()) commands.drain();

		let participantWork = false;
		if (context !== undefined) {
			for (const participant of participants) {
				if (participant.flush(context)) participantWork = true;
			}
		}

		if (!commands.hasPending() && !participantWork) return;

		assert(
			cycles < MAX_CYCLES,
			`[rovy] flush did not converge after ${MAX_CYCLES} cycles — commands or a flush participant kept producing work`,
		);
	}
}
