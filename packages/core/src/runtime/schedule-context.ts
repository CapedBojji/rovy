import type { Ctor } from "../contract";

export class ScheduleContext {
	schedule?: Ctor;
	dt = 0;
	rawDt = 0;
	elapsed = 0;
	frame = 0;
}
