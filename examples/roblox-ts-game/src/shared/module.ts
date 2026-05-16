import {
	App,
	Commands,
	Entity,
	Query,
	ResMut,
	With,
	component,
	event,
	monitor,
	observer,
	query,
	resource,
	schedule,
	system,
	trait,
} from "@rovy/core";

export function makeSmokeBanner(name: string) {
	return `Rovy integration loaded from ${name}`;
}

export interface Mortal {
	readonly mortal: true;
}

@component
export class Unit implements Mortal {
	readonly mortal = true;

	constructor(public readonly name = "unit") {}
}

@component
export class Health {
	constructor(
		public current = 0,
		public max = current,
	) {}
}

@component
export class Dead {}

@resource
export class SmokeResult {
	spawned = 0;
	pulses = 0;
	observed = 0;
	deadEntered = 0;
	finalHealth = -1;
	traitId = "";
}

@event({ capacity: 4 })
export class DamageTaken {
	constructor(
		public readonly target: Entity,
		public readonly amount = 0,
	) {}
}

@schedule
export class Update {}

@system({ schedule: Update })
class DamagePulse {
	run(commands: Commands, units: Query<[Entity, Unit, Health]>, result: ResMut<SmokeResult>) {
		const token = trait<Mortal>();
		result.traitId = token.__rovyTraitId;

		units.forEach((entity, _unit, health) => {
			if (health.current > 0) {
				result.pulses += 1;
				commands.trigger(new DamageTaken(entity, 7));
			}
		});
	}
}

@observer({ event: DamageTaken, priority: 10 })
class ApplyDamage {
	run(event: DamageTaken, commands: Commands, result: ResMut<SmokeResult>) {
		result.observed += 1;
		const nextHealth = math.max(0, result.finalHealth === -1 ? 5 - event.amount : result.finalHealth - event.amount);
		result.finalHealth = nextHealth;

		commands.set(event.target, Health, new Health(nextHealth, 5));
		if (nextHealth <= 0) {
			commands.insert(event.target, new Dead());
		}
	}
}

@monitor({ match: query<[Entity, Dead], With<Unit>>() })
class DeadMonitor {
	onEnter(_entity: Entity, _dead: Dead, result: ResMut<SmokeResult>) {
		result.deadEntered += 1;
	}
}

export function seed(app: App): Entity {
	const result = app.world.resource(SmokeResult);
	result.spawned += 1;
	result.finalHealth = 5;
	return app.world.spawn(new Unit("integration-target"), new Health(5, 5));
}
