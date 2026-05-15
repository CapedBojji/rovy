/**
 * Deferred mutation buffer. Systems/observers/monitors mutate through
 * `Commands`; changes queue and apply at flush boundaries (Phase 4 sets the
 * boundaries). Phase 3 scope: structural ops real; send/trigger/relate/
 * unrelate/runSchedule queue but their apply is stubbed until their owning
 * phase (events 6, relations 10, scheduler 4).
 */

import type { Ctor } from "../contract";
import type { Commands, Entity } from "../types";
import type { RovyWorld } from "./world";

type Command =
	| { kind: "spawn"; bundle: ReadonlyArray<object> }
	| { kind: "despawn"; entity: Entity }
	| { kind: "insert"; entity: Entity; item: object | Ctor }
	| { kind: "set"; entity: Entity; component: Ctor; value: object }
	| { kind: "remove"; entity: Entity; component: Ctor }
	| { kind: "send"; event: object }
	| { kind: "trigger"; event: object }
	| { kind: "relate"; source: Entity; relation: Ctor; target: Entity; data?: object }
	| { kind: "unrelate"; source: Entity; relation: Ctor; target: Entity }
	| { kind: "runSchedule"; schedule: Ctor };

export class CommandsImpl implements Commands {
	private queue: Array<Command> = [];
	/** Set by later phases (events: Phase 6, scheduler: Phase 4). */
	deferredSend?: (event: object) => void;
	deferredTrigger?: (event: object) => void;
	deferredRelate?: (source: Entity, relation: Ctor, target: Entity, data?: object) => void;
	deferredUnrelate?: (source: Entity, relation: Ctor, target: Entity) => void;
	deferredRunSchedule?: (schedule: Ctor) => void;

	constructor(private world: RovyWorld) {}

	spawn(...bundle: ReadonlyArray<object>): void {
		this.queue.push({ kind: "spawn", bundle });
	}
	despawn(entity: Entity): void {
		this.queue.push({ kind: "despawn", entity });
	}
	insert(entity: Entity, item: object | Ctor): void {
		this.queue.push({ kind: "insert", entity, item });
	}
	set<T extends object>(entity: Entity, component: Ctor<T>, value: T): void {
		this.queue.push({ kind: "set", entity, component, value });
	}
	remove(entity: Entity, component: Ctor): void {
		this.queue.push({ kind: "remove", entity, component });
	}
	send(event: object): void {
		this.queue.push({ kind: "send", event });
	}
	trigger(event: object): void {
		this.queue.push({ kind: "trigger", event });
	}
	relate(source: Entity, relation: Ctor, target: Entity, data?: object): void {
		this.queue.push({ kind: "relate", source, relation, target, data });
	}
	unrelate(source: Entity, relation: Ctor, target: Entity): void {
		this.queue.push({ kind: "unrelate", source, relation, target });
	}
	runSchedule(schedule: Ctor): void {
		this.queue.push({ kind: "runSchedule", schedule });
	}

	/** Any pending work? Used by the flush convergence loop. */
	hasPending(): boolean {
		return this.queue.size() > 0;
	}

	/** Drain + apply the queue once. Returns count applied. */
	drain(): number {
		const batch = this.queue;
		this.queue = [];
		for (const cmd of batch) {
			this.apply(cmd);
		}
		return batch.size();
	}

	private apply(cmd: Command): void {
		switch (cmd.kind) {
			case "spawn":
				this.world.spawn(...cmd.bundle);
				break;
			case "despawn":
				this.world.despawn(cmd.entity);
				break;
			case "insert":
				this.world.insert(cmd.entity, cmd.item);
				break;
			case "set":
				this.world.set(cmd.entity, cmd.component, cmd.value);
				break;
			case "remove":
				this.world.remove(cmd.entity, cmd.component);
				break;
			case "send":
				if (this.deferredSend !== undefined) this.deferredSend(cmd.event);
				break;
			case "trigger":
				if (this.deferredTrigger !== undefined) this.deferredTrigger(cmd.event);
				break;
			case "relate":
				if (this.deferredRelate !== undefined)
					this.deferredRelate(cmd.source, cmd.relation, cmd.target, cmd.data);
				break;
			case "unrelate":
				if (this.deferredUnrelate !== undefined)
					this.deferredUnrelate(cmd.source, cmd.relation, cmd.target);
				break;
			case "runSchedule":
				if (this.deferredRunSchedule !== undefined) this.deferredRunSchedule(cmd.schedule);
				break;
		}
	}
}
