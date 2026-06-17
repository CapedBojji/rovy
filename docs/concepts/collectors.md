# Collectors

## Why this exists

Rovy already has a clean story for ECS-native messages:

- `@event` + `EventReader` / `EventWriter` for scheduled buffered events
- `@observer` for reacting to triggered Rovy events
- `@monitor` for component lifecycle

What is still awkward is **external** input translation.

Roblox and Flamework APIs expose signals and callback surfaces like:

- `RemoteEvent.OnServerEvent`
- Flamework `connect(...)`
- `Tool.Activated`
- `Player.CharacterAdded`
- `UserInputService.InputBegan`

Today those sources usually get wired in ad hoc boot code, then some gameplay translation can drift into `@observer` handlers even though the real source was not a Rovy event to begin with. Collectors move those external hooks to an explicit ingress boundary while keeping gameplay translation in scheduled systems.

## Mental model

```txt
external Roblox / Flamework signal
  -> collector queue
  -> system drains queue
  -> commands / resources / Rovy events
```

Collectors are the bridge between the outside world and scheduled ECS systems.

## Shape

Use a decorator that matches the rest of the surface:

```ts
@collect
class FireWeaponCollect extends Collector<FireWeaponRequestPayload> {
	constructor() {
		super();
		const network = makeZombieNetworkServer();
		network.fireWeapon.connect((player, bytes) => {
			const request = decodeFireWeapon(player, bytes);
			this.enqueue(request);
		});
	}
}
```

The important authored structure is:

- constructor wires external callbacks and pushes plain payloads into `queue`
- `queue` is the actual collector state
- systems inspect queued data with `peek()` or consume it with `drain()`
- `Collector<T>` supplies `peek()` and `drain()` already; they should stay thin queue helpers, not hold domain logic

System usage stays Bevy-like:

```ts
@system({ schedule: Update, set: CombatSet })
class ConsumeFireRequests {
	run(fire: FireWeaponCollect, commands: Commands) {
		if (fire.peek().length === 0) return;
		for (const request of fire.drain()) {
			commands.send(new FireWeaponRequested(
				request.shooterUserId,
				request.origin,
				request.direction,
			));
		}
	}
}
```

## Semantics

- A collector instance is created once and owns its own external signal hookups.
- Collectors are instantiated once per `App` during `app.start()`.
- The same collector instance is injected anywhere that collector class appears as a param type in a system, observer, or monitor.
- A collector stores plain payload DTOs in an internal queue.
- The queue is the real contract. Constructor code fills it; systems inspect or consume it.
- Author collectors as `extends Collector<T>` so `peek()` and `drain()` come from base class.
- `peek()` is for non-consuming inspection; `drain()` is for single-consumer handoff.
- `drain()` should remain a thin queue-emptying wrapper, not a place for gameplay behavior.
- Queue draining is intentionally single-consumer.
- If two different consumers are needed, define two collectors bound to the same external source instead of sharing one drained queue.
- Collector classes must be zero-arg constructible at runtime, so constructor params must be optional or defaulted.

## Outbound work belongs in resources

Collectors are for ingress. If gameplay code needs a reusable outbound handle such as a Flamework client/server remote wrapper, keep that in a `@resource` and inject it where needed.

```ts
@resource
class ClientNetworkState {
	readonly events = GlobalEvents.createClient({});
}

@system({ schedule: Render })
class ApplyLocalIngress {
	run(fire: FireWeaponCollect, network: Res<ClientNetworkState>) {
		for (const request of fire.drain()) {
			network.events.fireWeapon.fire(encodeFireWeapon(request));
		}
	}
}
```

That keeps collector classes focused on external input capture, while reusable outbound APIs live in normal resource state.

## Boundary with existing tools

Collectors are for **external signal translation only**.

They are not a replacement for:

- `@event` when the message is already inside ECS space
- `@observer` when reacting to a triggered Rovy event
- `@monitor` when reacting to entity/component lifecycle

Collected payloads are plain DTOs by default, not `@event` classes. Once a system drains them, it can decide what ECS-facing shape to use:

- `commands.send(...)` for scheduled event fanout
- `commands.trigger(...)` for observer-style cause/effect chains
- direct `commands.set(...)`, `commands.spawn(...)`, or resource mutation

## Comparison

| Tool | Purpose | Source |
|------|---------|--------|
| `@collect` | translate external Roblox/Flamework input into a system-readable queue | outside ECS |
| `@event` | define an internal ECS message type | inside ECS |
| `@observer` | react to a triggered Rovy event | inside ECS |
| `@monitor` | react to enter/exit/change lifecycle | inside ECS state |

## Worked example: Flamework networking

This is the main bridge for projects that receive gameplay intents through an external networking layer.

```ts
@collect
class FireWeaponCollect extends Collector<FireWeaponRequestPayload> {
	constructor() {
		super();
		const server = GlobalEvents.createServer({});
		server.fireWeapon.connect((player: Player, bytes: buffer) => {
			const request = fireWeaponRequestSerializer.deserialize(bytes, []);
			this.enqueue(new FireWeaponRequestPayload(
				player.UserId,
				request.shotSequence,
				request.origin,
				request.direction,
			));
		});
	}
}

@system({ schedule: Update, set: CombatSet })
class QueueFireWeaponIntents {
	run(fire: FireWeaponCollect, commands: Commands) {
		for (const request of fire.drain()) {
			commands.send(new FireWeaponRequested(
				request.shooterUserId,
				request.origin,
				request.direction,
			));
		}
	}
}
```

Important point: the Flamework `connect(...)` callback is just the ingress. The actual gameplay translation happens in a normal scheduled system.

If that same feature also needs outbound remotes, put the reusable `createClient({})` / `createServer({})` handle in a `@resource`, not on the collector itself.

## Worked example: Roblox signals

Same idea for raw Roblox APIs.

```ts
interface ToolActivation {
	readonly userId: number;
	readonly origin: Vector3;
	readonly direction: Vector3;
}

@collect
class ToolActivatedCollect extends Collector<ToolActivation> {
	constructor() {
		super();
		const Players = game.GetService("Players");

		Players.PlayerAdded.Connect((player) => {
			player.CharacterAdded.Connect((character) => {
				character.ChildAdded.Connect((child) => {
					if (!child.IsA("Tool")) return;
					child.Activated.Connect(() => {
						const root = character.FindFirstChild("HumanoidRootPart");
						if (!root || !root.IsA("BasePart")) return;
						this.enqueue({
							userId: player.UserId,
							origin: root.Position,
							direction: root.CFrame.LookVector,
						});
					});
				});
			});
		});
	}
}
```

The collector owns the Roblox hookups; the system owns the gameplay meaning.

## Migration sketch

For a project with external engine and networking hooks, the split usually starts as:

- engine and networking hooks live in `main.server.ts` / `main.client.ts`
- some gameplay intent translation still lands in `@observer` handlers like fire/restart handling

The intended direction is:

1. keep the engine attachment code responsible only for bootstrapping the app
2. move external ingress into collectors such as `FireWeaponCollect` and `RestartRequestCollect`
3. add scheduled systems that `drain()` those collectors and translate payloads into ECS-facing work
4. keep `@observer` only for actual Rovy event chains after the message is already inside the ECS world

That keeps the Bevy-like rule intact: gameplay logic lives in systems, while Roblox/Flamework callbacks are just adapters.

## Runtime notes

- The transformer injects `rovy.__collect(CollectorClass, stableId)` after each `@collect` class.
- Runtime validation at `app.start()` currently checks that every collector instance exposes a callable `drain()`; `extends Collector<T>` is the intended way to satisfy that.
- There is no dedicated teardown lifecycle in v1. Collectors live for the lifetime of the `App`.

## See also

- [Events](/concepts/events.md)
- [Observers](/concepts/observers.md)
- [Systems and injection](/concepts/systems-and-injection.md)
- [Roadmap](/reference/roadmap.md)
