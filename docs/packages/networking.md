# Networking (`@netEvent`)

Status: MVP implementation in progress
Target: Roblox-TS + Blink transport backend
Goal: add typed cross-network events without designing full entity/component replication yet.

This document defines the first networking API for Rovy.

Package boundary: networking lives in `@rovy/networking`, separate from `@rovy/core`. The core package provides the ECS event model and a package-extension injection hook; `@rovy/networking` owns `@netEvent`, `NetClient`, `NetServer`, `NetEventContext`, `NetRuntime`, and `rovyNet`.

It intentionally does **not** define automatic ECS entity/component replication yet. Component replication comes later once the ECS and network boundaries are clearer.

## Scope

This spec covers:

- `@netEvent`
- injected `NetServer` and `NetClient` system params
- `net.send(...)` and `net.trigger(...)`
- sender / receiver semantics
- Blink as the generated transport backend
- `package.json` `rovy-build` environment/project configuration
- compile-time and runtime boundary checks

This spec does **not** cover:

- automatic component replication
- automatic entity replication
- `Replicated`
- `NetworkEntity`
- `OwnedBy`
- `NetScope`
- scope membership APIs
- prediction/interpolation
- rollback
- snapshot replication

## Core idea

A `@netEvent` is a Rovy event that is allowed to cross the network.

Normal Rovy events are local-only messages. A `@netEvent` is still a normal Rovy event, but Rovy Net additionally knows how to serialize it, send it through the transport, receive it on the other side, deserialize it, and re-insert it into the receiving ECS world.

`@netEvent` implies `@event`. Users should not need both decorators.

```ts
import { netEvent, type NetId } from "@rovy/networking";

@netEvent({
	direction: "clientToServer",
	channel: "reliable",
	receive: "send",
})
class CastAbilityIntent {
	constructor(
		public caster: NetId,
		public abilityId: string,
		public target?: NetId,
	) {}
}
```

Conceptually the transformer treats this like:

```ts
rovy.__event(CastAbilityIntent, {});
rovyNet.__netEvent(CastAbilityIntent, {
	id: 0,
	direction: "clientToServer",
	channel: "reliable",
	receive: "send",
});
```

## Local event model still applies

Rovy already has two local event paths:

```txt
commands.send(event)
  -> buffered event
  -> consumed by EventReader<E>

commands.trigger(event)
  -> deferred observer event
  -> consumed by @observer

world.trigger(event)
  -> immediate observer event
  -> local-only escape hatch
```

Networking does not replace this model. It only transports an event across a runtime boundary and then re-enters it into the receiver's world.

## Receiver-side semantics

Important rule:

```txt
net.send(event)
  -> receiver performs commands.send(event)
  -> receiver handles it with EventReader<E>

net.trigger(event)
  -> receiver performs commands.trigger(event)
  -> receiver handles it with @observer
```

The `send` or `trigger` behavior happens on the **receiver** side, not the sender side.

If the sender wants both local and remote behavior, it should make both calls explicitly:

```ts
commands.trigger(new PlayHitEffect(targetId, "slash"));
net.trigger(player, new PlayHitEffect(targetId, "slash"));
```

## `@netEvent` options

```ts
interface NetEventOptions {
	direction: "clientToServer" | "serverToClient";
	channel?: "reliable" | "unreliable";
	receive?: "send" | "trigger";
}
```

### `direction`

`direction` controls which side may originate the event.

```ts
@netEvent({ direction: "clientToServer" })
class CastAbilityIntent {}

@netEvent({ direction: "serverToClient" })
class MatchStarted {}
```

Invalid:

```ts
@netEvent({ direction: "clientToServer" })
class CastAbilityIntent {}

class BadServerSystem {
	run(net: NetServer) {
		net.broadcast(new CastAbilityIntent()); // error
	}
}

@netEvent({ direction: "serverToClient" })
class MatchStarted {}

class BadClientSystem {
	run(net: NetClient) {
		net.send(new MatchStarted()); // error
	}
}
```

### `channel`

`channel` controls reliability.

Use `"reliable"` for gameplay-critical messages such as abilities, match state transitions, purchases, or ready-up flows.

Use `"unreliable"` for disposable messages such as VFX, footsteps, aim pings, animation hints, or other short-lived cosmetic events.

Default: `"reliable"`

### `receive`

`receive` controls how the receiver inserts the event into the Rovy event system.

`receive: "send"` means:

```ts
commands.send(event);
```

Consumed by:

```ts
EventReader<EventType>
```

`receive: "trigger"` means:

```ts
commands.trigger(event);
```

Consumed by observers.

Default: `"send"`

## Example: client intent

```ts
@netEvent({
	direction: "clientToServer",
	channel: "reliable",
	receive: "send",
})
class CastAbilityIntent {
	constructor(
		public caster: NetId,
		public abilityId: string,
		public target?: NetId,
	) {}
}

@system({ schedule: Update })
class SendAbilityInput {
	run(net: NetClient) {
		if (pressedQ) {
			net.send(new CastAbilityIntent(unitId, "slime_bash", targetId));
		}
	}
}

@system({ schedule: Update })
class HandleCastAbilityIntent {
	run(events: EventReader<CastAbilityIntent>) {
		events.forEach((event) => {
			// validate sender, ownership, cooldown, range, target, etc.
		});
	}
}
```

## Example: server-to-client observer trigger

```ts
@netEvent({
	direction: "serverToClient",
	channel: "unreliable",
	receive: "trigger",
})
class PlayHitEffect {
	constructor(
		public target: NetId,
		public effectId: string,
	) {}
}

@system({ schedule: Update })
class SendHitEffects {
	run(net: NetServer) {
		net.trigger(player, new PlayHitEffect(targetId, "slash"));
	}
}

@observer()
class PlayHitEffectObserver {
	run(event: PlayHitEffect) {
		// spawn particles, sound, animation effect, etc.
	}
}
```

## Injected net params

`NetServer` and `NetClient` are injectable system params, like `Commands`, `Query`, `Res`, `EventReader`, and `EventWriter`.

They are exported by `@rovy/networking` and supplied by backend wiring at `App.start()` through the package extension hook. `NetPlugin` / `NetRuntime` still exist for advanced or test-only setup, but they are not the normal user path.

Users do not construct them manually:

```ts
const net = new NetClient(); // no
```

They declare them in system params:

```ts
import { NetClient, NetServer } from "@rovy/networking";

@system({ schedule: Update })
class ClientInputSystem {
	run(net: NetClient) {
		net.send(new CastAbilityIntent(unitId, "slash", targetId));
	}
}

@system({ schedule: Update })
class ServerBroadcastSystem {
	run(net: NetServer) {
		net.broadcast(new MatchStarted("match_123"));
	}
}
```

## `NetClient` API

`NetClient` exists only on the client. It can only send events whose direction is `clientToServer`.

```ts
class NetClient {
	send<E extends ClientToServerNetEvent>(event: E): void;
	trigger<E extends ClientToServerNetEvent>(event: E): void;
}
```

Preferred rule:

```txt
net.send(event)
  -> receiver commands.send(event)

net.trigger(event)
  -> receiver commands.trigger(event)
```

The event's `receive` metadata stays useful as validation and documentation.

## `NetServer` API

`NetServer` exists only on the server. It can only send events whose direction is `serverToClient`.

```ts
class NetServer {
	send<E extends ServerToClientNetEvent>(player: Player, event: E): void;
	trigger<E extends ServerToClientNetEvent>(player: Player, event: E): void;
	broadcast<E extends ServerToClientNetEvent>(event: E): void;
	broadcastTrigger<E extends ServerToClientNetEvent>(event: E): void;
	sendList<E extends ServerToClientNetEvent>(players: Player[], event: E): void;
	triggerList<E extends ServerToClientNetEvent>(players: Player[], event: E): void;
	broadcastExcept<E extends ServerToClientNetEvent>(except: Player, event: E): void;
	broadcastTriggerExcept<E extends ServerToClientNetEvent>(except: Player, event: E): void;
}
```

## Naming rule

Use `send` and `trigger` because they map directly to Rovy's local event semantics:

```txt
send
  means buffered event on receiver

trigger
  means observer event on receiver
```

There is no network equivalent of `world.trigger(...)` in MVP because networking is asynchronous.

## Transport backend

Blink is the default generated transport backend. `RemoteEvent` transport still exists as an explicit fallback when the active `rovy-build` environment selects `"transport": "remote"`.

```txt
user TypeScript
  -> @netEvent classes
  -> Rovy transformer
  -> embedded Blink schema metadata
  -> explicit Blink generator
  -> generated .blink schema
  -> Blink compiler
  -> generated Blink client/server modules
  -> Rovy Net runtime adapter
  -> user-facing NetClient / NetServer
```

Users should not call Blink directly:

```ts
Blink.CastAbilityIntent.Fire(...); // no
```

Rovy Net owns direction validation, receiver `send` / `trigger` behavior, schedule integration, runtime boundary checks, player sender context, serializer/deserializer mapping, and use of Blink polling.

## Generated Blink schema

Input:

```ts
@netEvent({
	direction: "clientToServer",
	channel: "reliable",
	receive: "send",
})
class CastAbilityIntent {
	constructor(
		public caster: NetId,
		public abilityId: string,
		public target?: NetId,
	) {}
}
```

Generated Blink:

```txt
event CastAbilityIntent {
	From: Client,
	Type: Reliable,
	Call: Polling,
	Data: struct {
		caster: u32,
		abilityId: string,
		target: u32?
	}
}
```

The transformer keeps the generated struct fields comma-separated because Blink's parser requires commas between fields.

For server-to-client trigger:

```txt
event PlayHitEffect {
	From: Server,
	Type: Unreliable,
	Call: Polling,
	Data: struct {
		target: u32,
		effectId: string
	}
}
```

`receive` is not a Blink concept. It stays as Rovy metadata on the receive side.

## Blink options

Generated `.blink` should use options like:

```txt
option Casing = Pascal
option Typescript = true
option RemoteScope = "ROVY"
option ManualReplication = true
option UsePolling = true
option ClientOutput = "out/shared/net/generated/RovyBlinkClient.luau"
option ServerOutput = "out/shared/net/generated/RovyBlinkServer.luau"
option TypesOutput = "out/shared/net/generated/RovyBlinkTypes.luau"
```

Important options:

- `UsePolling = true`
- `ManualReplication = true`

Recommended schedule flow:

```txt
NetReceiveSet
  -> drain Blink polling queues
  -> insert Rovy events

SimulationSet
  -> gameplay systems run

NetFlushSet
  -> Rovy Net calls Blink.StepReplication()
```

Reliable Blink traffic can be packed per replication step. Unreliable calls may fire immediately per call. MVP can accept that difference.

## Runtime receive adapter

Server receiving client-to-server:

```ts
@system({ schedule: Update, set: NetReceiveSet })
class ReceiveClientNetEvents {
	run(commands: Commands, netRuntime: Res<NetRuntime>) {
		for (const [player, payload] of Blink.CastAbilityIntent.Iter()) {
			const event = new CastAbilityIntent(
				payload.caster,
				payload.abilityId,
				payload.target,
			);
			netRuntime.setCurrentSender(event, player);
			commands.send(event);
		}
	}
}
```

Client receiving server-to-client trigger:

```ts
@system({ schedule: Update, set: NetReceiveSet })
class ReceiveServerNetEvents {
	run(commands: Commands) {
		for (const [payload] of Blink.PlayHitEffect.Iter()) {
			const event = new PlayHitEffect(payload.target, payload.effectId);
			commands.trigger(event);
		}
	}
}
```

## Sender player context

For client-to-server events, the server must know which Roblox `Player` sent the event.

MVP recommendation:

```ts
class NetEventContext {
	senderOf(event: object): Player | undefined;
}
```

Only client-to-server received events have a sender.

## Transformer responsibilities

The transformer should:

1. Find `@netEvent` classes.
2. Treat each `@netEvent` as an implicit `@event`.
3. Validate constructor fields are serializable.
4. Assign stable protocol ids.
5. Register net event metadata with runtime.
6. Generate `.blink` schema.
7. Generate or reference serializers/deserializers.
8. Detect `NetServer` and `NetClient` injected system params.
9. Validate boundary usage when possible.
10. Validate event direction usage when possible.
11. Generate runtime guards.
12. Emit runtime config and backend-owned Blink artifacts.

## Type mapping to Blink

Initial mapping:

```txt
NetId              -> u32
number             -> f64 by default
string             -> string
boolean            -> boolean
T | undefined      -> T?
T[]                -> T[]
literal unions     -> enum
object payload     -> struct
```

## rovy-build configuration

Do not hardcode active Rojo project selection into `tsconfig.json`.

`tsconfig.json` should only register the transformer:

```json
{
	"compilerOptions": {
		"plugins": [
			{
				"transform": "rovy-transformer"
			}
		]
	}
}
```

`package.json` `rovy-build` owns build orchestration, environment/project selection, and network settings:

```json
{
	"rovy-build": {
		"$schema": "./node_modules/@rovy/core/schema/rovy-build.schema.json",
		"current": "dev",
		"placeFile": "game.rbxl",
		"rbxtscArgs": ["--type", "game"],
		"rojoBuildArgs": ["build", "default.project.json", "-o", "game.rbxl"],
		"watchOnOpen": true,
		"generateBlink": true,
		"environments": {
			"dev": {
				"rojo": "default.project.json",
				"sourcemap": "sourcemap.json",
				"boundaries": {
					"server": ["src/server"],
					"client": ["src/client"],
					"shared": ["src/shared"]
				},
				"net": {
					"strictBoundaryChecks": true,
					"transport": "blink",
					"blink": {
						"enabled": true,
						"remoteScope": "ROVY",
						"manualReplication": true,
						"usePolling": true
					}
				}
			}
		}
	}
}
```

Active environment resolution order:

1. `process.env.ROVY_ENV`
2. `package.json` `rovy-build.current`
3. default environment, usually `"dev"`

When Blink transport is active, the explicit Blink generator writes build outputs here:

- `out/shared/net/generated/rovy.generated.blink`
- `out/shared/net/generated/RovyBlinkClient.luau`
- `out/shared/net/generated/RovyBlinkServer.luau`
- `out/shared/net/generated/RovyBlinkTypes.luau`

These are backend-owned build artifacts, not source files in `src/shared`.

## Boundary detection

Rovy Net needs to know whether a file belongs to `server`, `client`, `shared`, or `unknown`.

```ts
type RuntimeBoundary = "server" | "client" | "shared" | "unknown";
```

Detection order:

1. explicit `rovy-build` boundaries
2. Rojo project tree
3. Rojo sourcemap, if present
4. conventional paths
5. `unknown`

If boundary is `unknown` and `strictBoundaryChecks` is `true`, error. Otherwise warn and rely on runtime guards.

## Compile-time direction validation

The transformer should validate obvious direction mistakes.

Diagnostics should be clear:

```txt
Rovy Net error:
CastAbilityIntent is direction: "clientToServer",
but it is being sent from NetServer.broadcast(...).
Use NetClient on the client, or change the event direction.
```

## Runtime guards

Compile-time checks are not enough. Generated code and runtime APIs should assert boundaries too.

```ts
function __rovy_inject_NetServer(): NetServer {
	if (!RunService.IsServer()) {
		error("NetServer can only be injected on the server.");
	}
	return rovyNet.server;
}

function __rovy_inject_NetClient(): NetClient {
	if (!RunService.IsClient()) {
		error("NetClient can only be injected on the client.");
	}
	return rovyNet.client;
}
```

Do not silently skip bad calls. Misuse should fail loudly.

## Outbox model

Outbound methods enqueue events into a Rovy Net outbox.

```ts
class NetClient {
	send(event: object): void {
		this.outbox.push({ mode: "send", event });
	}

	trigger(event: object): void {
		this.outbox.push({ mode: "trigger", event });
	}
}
```

Internal flush then serializes and forwards through generated Blink events before calling `Blink.StepReplication()`.

## Mode consistency

Recommended MVP: let the method decide receiver behavior, but keep `receive` metadata for validation and documentation.

```ts
@netEvent({ receive: "send" })
class CastAbilityIntent {}

net.send(new CastAbilityIntent()); // valid
net.trigger(new CastAbilityIntent()); // should error or warn
```

## MVP public API

```ts
import { NetClient, NetServer, netEvent, type NetId } from "@rovy/networking";

export function netEvent(options: NetEventOptions): ClassDecorator;

export class NetClient {
	send<E extends ClientToServerNetEvent>(event: E): void;
	trigger<E extends ClientToServerNetEvent>(event: E): void;
}

export class NetServer {
	send<E extends ServerToClientNetEvent>(player: Player, event: E): void;
	trigger<E extends ServerToClientNetEvent>(player: Player, event: E): void;
	broadcast<E extends ServerToClientNetEvent>(event: E): void;
	broadcastTrigger<E extends ServerToClientNetEvent>(event: E): void;
	sendList<E extends ServerToClientNetEvent>(players: Player[], event: E): void;
	triggerList<E extends ServerToClientNetEvent>(players: Player[], event: E): void;
	broadcastExcept<E extends ServerToClientNetEvent>(except: Player, event: E): void;
	broadcastTriggerExcept<E extends ServerToClientNetEvent>(except: Player, event: E): void;
}

export type NetId = number;
```

## Final mental model

```txt
user writes @netEvent class
  -> transformer registers it as a normal Rovy event
  -> transformer registers network metadata
  -> transformer generates Blink schema

user writes system with NetClient or NetServer param
  -> transformer detects param type
  -> runtime injects correct net handle

user calls net.send or net.trigger
  -> Rovy Net validates direction and boundary
  -> Rovy Net enqueues outbound event
  -> Rovy Net flush system calls generated Blink Fire
  -> Blink transports event

receiver drains Blink polling queue
  -> Rovy Net deserializes event class
  -> if send: commands.send(event)
  -> if trigger: commands.trigger(event)

user receiver code handles event normally
  -> EventReader<E> for send
  -> @observer for trigger
```

This keeps the public API small and Bevy-like while using Blink as a generated Roblox transport backend.
