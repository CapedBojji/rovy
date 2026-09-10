import { schedule } from "@rovy/core";

// Rovy ships no built-in schedules; the place drives this one by hand so the
// assertions run at deterministic points rather than on a frame clock.
@schedule
export class Tick {}
