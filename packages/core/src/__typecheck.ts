/**
 * Compile-only fixture. Mirrors doc-13 authoring signatures to prove the
 * public type surface type-checks (Phase 1 exit). Not exported from index;
 * has no runtime behaviour. If `rbxtsc` compiles, the signatures are sound.
 */

import {
	component,
	event,
	system,
	observer,
	monitor,
	relation,
	schedule,
	trait,
	query,
	rovy,
} from ".";
import type {
	Query,
	Entity,
	Commands,
	Res,
	ResMut,
	EventReader,
	EventWriter,
	With,
	Without,
	Optional,
	Trait,
	HasTrait,
	AllTraits,
	Pair,
	Changed,
	Added,
	Removed,
	SystemSet,
} from ".";

@component
class Unit {}
@component
class Dead {}
@component
class Position {
	constructor(
		public x: number,
		public y: number,
	) {}
}
@component
class Health {
	constructor(
		public current: number,
		public max: number,
	) {}
}
@component
class Shield {
	constructor(public amount: number) {}
}

interface CrowdControl {
	blocksMovement(): boolean;
}
@component
class Stunned implements CrowdControl {
	blocksMovement() {
		return true;
	}
}

@relation
class ChildOf {}

@schedule
class Update {}

declare const MovementSet: typeof SystemSet;

@event({ capacity: 256 })
class DamageTaken {
	constructor(
		public target: Entity,
		public amount: number,
	) {}
}

@system({ schedule: Update, set: MovementSet })
class MoveUnits {
	run(
		_commands: Commands,
		_units: Query<[Entity, Position, Optional<Shield>], With<Unit>, Without<Dead>>,
		_clock: Res<Health>,
	) {
		_units.forEach((_e, _pos, _shield) => {});
	}
}

@system({ schedule: Update })
class ReactChange {
	run(_q: Query<[Entity, Health], Changed<Health>, Added<Position>, Removed<Dead>>) {}
}

@observer({ event: DamageTaken, priority: 10 })
class ApplyDamage {
	run(_e: DamageTaken, _commands: Commands, _hp: Query<[Entity, Health]>) {}
}

@monitor({ match: query<[Health, Position], With<Unit>, Without<Dead>>() })
class ValidTarget {
	onEnter(_entity: Entity, _h: Health, _p: Position, _c: Commands) {}
	onExit(_entity: Entity, _h: Health, _p: Position) {}
}

@system({ schedule: Update })
class TraitAndPairs {
	run(
		_cc: Query<[Entity, Trait<CrowdControl>]>,
		_all: Query<[Entity, AllTraits<CrowdControl>]>,
		_filtered: Query<[Entity, Health], HasTrait<CrowdControl>>,
		_pairs: Query<[Entity, Pair<ChildOf>]>,
		_writer: EventWriter<DamageTaken>,
		_reader: EventReader<DamageTaken>,
		_mut: ResMut<Health>,
	) {
		const token = trait<CrowdControl>();
		void token;
	}
}

export type __TypecheckOk = [
	typeof MoveUnits,
	typeof ReactChange,
	typeof ApplyDamage,
	typeof ValidTarget,
	typeof TraitAndPairs,
	typeof Stunned,
	typeof Unit,
	typeof Dead,
];

if (false) {
	rovy.loadPaths("src/client/systems");
}
