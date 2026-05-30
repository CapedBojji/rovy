# Agent Rules

This file is the source of truth for agents working in this game project.

## Core Rules

- Use Rovy authoring syntax and patterns from `@rovy/core`.
- Keep changes strictly inside the user's requested scope.
- Do not add speculative gameplay, networking, UI, schedules, systems, abstractions, docs folders, runtime hooks, or future support.
- If a future need is mentioned, implement only the current requested behavior unless the user asks for future support now.
- Use decorator-based Rovy classes such as `@component`, `@resource`, `@collect`, `@system`, `@observer`, `@monitor`, `@prefab`, and `@schedule`.
- Keep explicit imports for every runtime module that must register with Rovy.
- Prefer deferred writes through `commands`: `commands.spawn(...)`, `commands.insert(...)`, `commands.set(...)`, `commands.remove(...)`, `commands.despawn(...)`, `commands.trigger(...)`, and `commands.send(...)`.
- Use direct `world` writes only when the same system must read or react to that exact mutation immediately.
- Systems must declare resources and schedule context as `run(...)` params with `Res<T>`, `ResMut<T>`, and `ScheduleContext`.
- Helpers must receive concrete values they need; do not hide `world.resource(...)` lookups in helpers.

Good scoped change:

```ts
@system({ schedule: Update, set: MovementSet })
class ApplyVelocitySystem {
	run(commands: Commands, bodies: Query<[Entity, Position, Velocity]>, time: Res<FrameTime>) {
		bodies.forEach((entity, position, velocity) => {
			const next = position.translate(velocity.value.mul(time.dt));
			commands.set(entity, Position, next);
		});
	}
}
```

Bad scoped change:

```ts
// Bad: adds unrequested runtime hook and hides timing outside Rovy schedules.
RunService.Heartbeat.Connect((dt) => {
	app.runSchedule(Update, dt);
});
```

## File Structure

- `src/client/` is for client bootstrap and client-only runtime code.
- `src/server/` is for server bootstrap and server-only runtime code.
- `src/shared/` is for code safe to run on both client and server.
- `state.ts` is only for schedules and system sets.
- `components/` is only for `@component` classes.
- `resources/` is only for `@resource` classes.
- `events/` is only for `@event` classes.
- `collectors/` is only for `@collect` classes.
- `systems/` is only for `@system` classes.
- `observers/` is only for `@observer` classes.
- `monitors/` is only for `@monitor` classes.
- `prefabs/` is only for `@prefab` classes.
- Put exactly one decorated system, observer, monitor, collector, or prefab class in each runtime file.
- Components and resources may share a file only when they are directly related.
- Do not use gameplay barrel files such as `index.ts`; import concrete files directly.
- Runtime file names must end with their Rovy role: `.system.ts`, `.observer.ts`, `.monitor.ts`, `.collect.ts`, `.prefab.ts`, `.component.ts`, `.resource.ts`, or `.event.ts`.
- Use `state.ts` only for schedules and sets; do not add role suffixes to `state.ts`.
- Client/server folders may each have `collectors/`, `components/`, `events/`, `monitors/`, `observers/`, `prefabs/`, `resources/`, `systems/`, and `state.ts`.
- Shared code should use `components/`, `events/`, `prefabs/`, `resources/`, and shared `state.ts` only when both sides use it.
- Do not put side-specific Roblox service logic in `src/shared`.
- Do not add Roblox signal callbacks outside collectors.

Good file split:

```ts
// src/server/state.ts
@schedule
export class Update {}

export class MovementSet {}
```

```ts
// src/server/systems/move-characters.system.ts
@system({ schedule: Update, set: MovementSet })
class MoveCharactersSystem {}
```

Bad file split:

```ts
// src/server/runtime.ts
@component
class Position {}

@resource
class GameClock {}

@system({ schedule: Update })
class MoveCharactersSystem {}

export * from "./components";
```

## Components

- Components store durable data from constructor arguments.
- Component methods may derive values from stored data.
- Component methods must not mutate fields, enqueue events, write `world`, write `commands`, or touch Roblox Instances.
- Use method names that describe derived data, such as `getGroundSpeed()`, `getHealthRatio()`, or `isGrounded()`.
- One-shot facts such as input presses, impulses, and drain-cycle payloads do not belong in components.
- Do not add latch booleans such as `jumpRequested`, `wasPressed`, `didFire`, or `consumeJump()`.

Good component:

```ts
@component
export class MovementStats {
	constructor(
		public readonly horizontalVelocity: Vector3,
		public readonly grounded: boolean,
	) {}

	getGroundSpeed(): number {
		return new Vector3(this.horizontalVelocity.X, 0, this.horizontalVelocity.Z).Magnitude;
	}

	isGrounded(): boolean {
		return this.grounded;
	}
}
```

Bad component:

```ts
@component
export class MovementStats {
	constructor(
		public horizontalVelocity: Vector3,
		public jumpRequested = false,
	) {}

	consumeJump(): boolean {
		const requested = this.jumpRequested;
		this.jumpRequested = false;
		return requested;
	}
}
```

## Collectors

- Collectors bridge external sources into scheduled ECS systems.
- Collectors may own signal connections and enqueue plain payload DTOs.
- Collectors must not store derived gameplay state.
- Collectors must not decide gameplay meaning.
- Collectors must not own outbound networking, UI, or reusable service handles.
- Use `peek()` for non-consuming inspection and `drain()` for one consumer handoff.
- If two systems need the same external source, create two collectors or convert one drain into ECS state in a system.

Good collector:

```ts
export interface JumpInputPayload {
	readonly pressedAt: number;
}

@collect
export class JumpInputCollect extends Collector<JumpInputPayload> {
	constructor() {
		super();
		UserInputService.JumpRequest.Connect(() => {
			this.enqueue({ pressedAt: os.clock() });
		});
	}
}
```

Bad collector:

```ts
@collect
export class JumpInputCollect extends Collector<JumpInputPayload> {
	private combo = 0;

	constructor(private readonly network = createClientNetwork()) {
		super();
		UserInputService.JumpRequest.Connect(() => {
			this.combo += 1;
			this.network.fireCombo(this.combo);
		});
	}
}
```

## Systems

- Systems own gameplay meaning.
- Systems drain collectors, read resources/components, and schedule world changes through `commands`.
- Put reusable ordering in `state.ts` sets instead of adding direct world writes.
- Do not make one-line runtime helper functions.
- Keep local helper functions multi-line and named by domain behavior.
- Move helpers into separate files only when reused by at least three callers.

Good system:

```ts
@system({ schedule: Update, set: InputSet })
class ApplyJumpInputSystem {
	run(commands: Commands, input: JumpInputCollect, players: Query<[Entity, PlayerMotor]>) {
		for (const payload of input.drain()) {
			players.forEach((entity, motor) => {
				const next = new PlayerMotor(payload.pressedAt, motor.getGroundSpeed());
				commands.set(entity, PlayerMotor, next);
			});
		}
	}
}
```

Bad system:

```ts
const isMoving = (velocity: Vector3) => velocity.Magnitude > 0;

@system({ schedule: Update })
class ApplyJumpInputSystem {
	run(input: JumpInputCollect, world: World) {
		for (const payload of input.drain()) {
			world.resource(PlayerState).jumpQueued = true;
		}
	}
}
```

## Resources

- Resources hold app-wide durable state or app-wide service handles.
- Inject resources with `Res<T>` or `ResMut<T>` in systems.
- Do not fetch resources inside helpers through `world.resource(...)`.
- If a collector needs an outbound handle, put that handle in a resource and inject it into the draining system.

Good resource usage:

```ts
@resource
export class FrameTime {
	constructor(public readonly dt = 0) {
	}
}

@system({ schedule: Update })
class TickClockSystem {
	run(clock: ResMut<GameClock>, time: Res<FrameTime>) {
		clock.elapsed += time.dt;
	}
}
```

Bad resource usage:

```ts
function tickClock(world: World) {
	const clock = world.resource(GameClock);
	const time = world.resource(FrameTime);
	clock.elapsed += time.dt;
}
```

## Events, Observers, Monitors, And Prefabs

- Events are for ECS-facing one-shot facts.
- Observers react to Rovy events and should stay small.
- Monitors react to lifecycle changes and should not become general systems.
- Prefabs describe spawn bundles and must not perform unrelated runtime work.
- Do not put Roblox signal callbacks in observers or monitors when a collector should own ingress.

Good event flow:

```ts
@event
export class PlayerJumped {
	constructor(public readonly entity: Entity) {}
}

@system({ schedule: Update })
class ApplyJumpInputSystem {
	run(commands: Commands, input: JumpInputCollect, players: Query<[Entity, PlayerMotor]>) {
		for (const _payload of input.drain()) {
			players.forEach((entity) => {
				commands.trigger(new PlayerJumped(entity));
			});
		}
	}
}
```

Bad event flow:

```ts
@observer({ event: PlayerJumped })
class ApplyJumpObserver {
	run(event: PlayerJumped, world: World) {
		world.set(event.entity, PlayerMotor, new PlayerMotor(true));
	}
}
```
