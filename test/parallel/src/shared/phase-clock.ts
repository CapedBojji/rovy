import { RunService } from "@rbxts/services";

/** Public phase callbacks; a simulation-cycle marker, not internal FrameNumber. */
export class PhaseClock {
	readonly marker = new Instance("Folder");
	frame = 0;
	phase = "startup";
	private waiting?: thread;
	private readonly connections = new Array<RBXScriptConnection>();
	constructor() {
		// Unparented, side-local Instance: readable by Actors, never replicated.
		this.marker.Name = "ParallelPhaseClock";
		this.marker.SetAttribute("Frame", 0);
		this.marker.SetAttribute("Phase", this.phase);
		this.connections.push(RunService.PreSimulation.Connect(() => {
			this.frame++;
			this.marker.SetAttribute("Frame", this.frame);
			this.mark("PreSimulation");
			const waiting = this.waiting;
			this.waiting = undefined;
			if (waiting !== undefined) task.spawn(waiting);
		}));
		this.connections.push(RunService.PostSimulation.Connect(() => this.mark("PostSimulation")));
		this.connections.push(RunService.Heartbeat.Connect(() => this.mark("Heartbeat")));
		if (RunService.IsClient()) this.connections.push(RunService.PreRender.Connect(() => this.mark("PreRender")));
	}
	private mark(phase: string) { this.phase = phase; this.marker.SetAttribute("Phase", phase); }
	/** Resume only after this callback has published its phase/cycle marker. */
	waitPreSimulation() {
		assert(this.waiting === undefined, "phase clock already has a waiter");
		this.waiting = coroutine.running();
		coroutine.yield();
	}
	destroy() { for (const connection of this.connections) connection.Disconnect(); this.marker.Destroy(); }
}
