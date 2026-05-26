# Public API Reference

Full public surface. Authoring is decorator-based; the transformer reads decorators and `run`/`onEnter`/`onExit`/`onChange` param types and injects `rovy.__*` registration calls. `rovy.loadPaths(...)` runs them; `app.start()` finalizes.

## Decorators

```ts
@component
@collect
@prefab
@resource
@event(options?: { capacity?: number; label?: string })
@system(options: { schedule: ScheduleCtor; set?: typeof SystemSet; after?: SystemCtor[]; before?: SystemCtor[]; runIf?: () => boolean })
@observer(options: { event: EventCtor; priority?: number })
@monitor(options: { match: QueryToken })
@relation(options?: { exclusive?: boolean; onTargetDelete?: "cascade" | "remove" | "none"; onDelete?: "cascade" | "remove" | "none" })
@schedule(options?: { runOnStart?: boolean })
@set(options?: { label?: string })   // optional, on classes extending SystemSet
@plugin                              // on a class with build(app: App)
```

## Injection params

Available in `run` (systems/observers) and `onEnter`/`onExit`/`onChange` (monitors):

| Param type | Injected value |
|------------|----------------|
| Event class (observer first param) | the event instance |
| `Entity` | matched entity (monitors, query rows) |
| `Commands` | command buffer |
| `Query<[Terms], ...Filters>` | pre-built query handle |
| `CollectorClass` (`@collect`, usually `extends Collector<T>`) | app-scoped collector singleton |
| `Res<T>` | shallow-readonly resource (throws if missing) |
| `ResMut<T>` | mutable resource (write intent) |
| `OptRes<T>` | `T \| undefined` |
| `EventReader<E>` | buffered events of `E` this run |
| `EventWriter<E>` | typed `send` handle for `E` |
| `Local<T>` | per-instance persistent state |
| `World` | raw world (escape hatch) |

Datastore params:

| Param type | Injected value |
|------------|----------------|
| `DocumentReader<D>` | read-only handle for document `D` |
| `DocumentWriter<D>` | read/write/save handle for document `D` |
| `DocumentOpener<D>` | open/close/reopen handle for document `D` |

These come from `@rovy/datastore`, not `@rovy/core`. Core provides the package-extension injection hook; the datastore package owns document runtime handles and lifecycle events.

Draft networking params:

| Param type | Injected value |
|------------|----------------|
| `NetClient` | client-only outbound net handle |
| `NetServer` | server-only outbound net handle |
| `NetEventContext` | sender lookup for received client-to-server events |

These come from `@rovy/networking`, not `@rovy/core`. Core provides the package-extension injection hook; the networking package owns the net handles.
`App.start()` auto-installs networking when `@netEvent` metadata or injected net params are present, so normal user code does not add `NetPlugin` manually.

Planned prefab `build(...)` injection is narrower. See [Prefabs](/concepts/prefabs.md) for the proposed v1 allowed param list and exclusions.

Widget functions in `@rovy/ui` also use injected params, but with a function-first public surface instead of a class-based one. See [UI](/packages/ui.md).

## rovy (global registry)

Decorators inject these — you call only `loadPaths`.

```ts
rovy.loadPaths(...paths);   // `paths: string[]`; transformer lowers to Instance roots
rovy.traitToken<T>();           // value-position trait handle (see Traits)
// rovy.__component / __collect / __resource / __event / __system / __observer
// / __monitor / __relation / __schedule / __traitImpl / __query
//   are transformer-injected — never hand-written
```

UI discovery follows the same side-effect model: `rovy.loadPaths(...)` must require widget modules so injected widget registration/wrapping runs.

## App

```ts
new App();
app.addPlugin(PluginClass);

app.insertResource(resourceInstance);   // override auto-registered default
app.insertParam(stableId, value);       // package/plugin-owned injected param
app.configureSets(ScheduleCtor, [SetClass, ...]);

app.start();                 // finalize registries + fire @schedule({ runOnStart: true })
app.flush();                 // manual flush escape hatch
```

No `addMetadata` / `addSystems` / `addObserver` / `onAdd*` / `step`. Systems/observers/monitors self-register via transformer-injected `rovy.__*` calls; `rovy.loadPaths(...)` takes authored TS string paths and must run before `app.start()`. Resources auto-register from `@resource` defaults — `insertResource` only needed to override. `app.step()` lives in the optional `StandardPlugin` (see [Schedules](/concepts/schedules.md#standardplugin-optional)).

## World

Escape hatch — prefer `commands` and injection.

```ts
world.spawn(...bundle);
world.despawn(entity);

world.insert(entity, componentOrTag);
world.set(entity, ComponentClass, value);
world.remove(entity, ComponentClass);

world.has(entity, ComponentClass);
world.get(entity, ComponentClass);
world.resource(ResourceClass);
world.insertResource(resourceInstance);

world.relate(source, RelationClass, target);
world.unrelate(source, RelationClass, target);
world.hasRelation(source, RelationClass, target);
world.getRelation(source, RelationClass, target);

world.trigger(eventInstance);     // immediate observer dispatch
world.runSchedule(ScheduleClass);
world.flush();
```

Planned prefab support treats prefab classes as bundle items:

```ts
world.spawn(SlimePrefab);
world.insert(entity, SlimePrefab);
```

## Commands

```ts
commands.spawn(...bundle);
commands.despawn(entity);

commands.insert(entity, componentOrTag);
commands.set(entity, ComponentClass, value);
commands.remove(entity, ComponentClass);

commands.send(eventInstance);
commands.trigger(eventInstance);

commands.relate(source, RelationClass, target);
commands.unrelate(source, RelationClass, target);

commands.runSchedule(ScheduleClass);
```

Planned prefab support also reuses this bundle surface:

```ts
commands.spawn(SlimePrefab);
commands.insert(entity, SlimePrefab);
```

## Query types

Param type — `Query<[Terms], ...Filters>`.

Terms (bind a value):

```ts
Entity
ComponentClass
Optional<C>      // C | undefined
Trait<T>         // one row per matching impl
AllTraits<T>     // T[] per entity
Pair<R>          // { target: Entity, data?: R }
```

Filters (no binding):

```ts
With<C>
Without<C>
HasTrait<T>
HasPair<R>
Changed<C>
Added<C>
Removed<C>
```

Query handle:

```ts
q.forEach((..bindings) => {});
q.size();
q.first();
for (const [..bindings] of q) {}
q.withTarget(entity);   // narrow Pair<R> to specific target
```

## Collector

Runtime base class for `@collect` authoring:

```ts
abstract class Collector<T> {
	protected enqueue(value: T): void;
	drain(): Array<T>;
}
```

## Prefab

> Planned, not shipped yet.

Planned runtime base for `@prefab` authoring:

```ts
abstract class Prefab {
	protected entity(): Entity;
	build(...injected): Entity;
}
```

Expected v1 semantics:

- app-owned singleton prefab instance per `@prefab` class
- zero-arg/default-constructible only
- used as a bundle item in `world.spawn`, `world.insert`, `commands.spawn`, and `commands.insert`
- `build(...)` must return the runtime-selected target entity
- prefab does not differentiate spawn vs insert; it only builds into `this.entity()`

## UI

Public authoring surface for `@rovy/ui`:

```ts
/** @widget */
export function Window(props: { title: string }): void;
export function Window(style: Style, props?: { title: string }): void {
	if (!props) return;
	print(style.windowBgColor, props.title);
}

Window({ title: "Inventory" });
```

Locked contract:

- one JSDoc-tagged widget function
- plain calls like `Window(args)`
- no widget classes as the public model
- no `new Window()`
- no `RovyUi.Window(...)` public surface
- widget-local `useState` and `useEffect` are available for UI-local storage
- gameplay state should still live in ECS resources/components/events or explicit external stores

Widget implementation rules:

- `style: Style` is special widget-runtime authoring sugar, not normal resource injection
- the runtime signature removes the `style` param and the lowered body reads `RovyUi.getActiveStyle()`
- overloads are the recommended way to keep a clean public call signature
- the transformer wraps the widget through `RovyUi.__widget(...)`
- later widget callsites lower through `RovyUi.__scope(...)` so `useState`/`useEffect` have stable callsite identity

Scoped style helper:

```ts
StyleScope(
	{
		patch: { textColor: Color3.fromRGB(255, 220, 120) },
		discriminator: item.id,
	},
	() => {
		Label({ text: "Rare Item" });
	},
);
```

Locked scope behavior:

- dedicated helper, not widget-class syntax
- callback-bounded lifetime
- partial merge onto current active style
- parent style restored automatically when callback exits
- optional discriminator for repeated scopes from the same callsite

The docs describe the wrapped-callable contract intentionally, even if some current in-repo experimental code or tests still mention older helper naming.

## Macros

Compile-time only — transformer rewrites them.

```ts
trait<T>();              // value position (decorator args, etc.)
query<[Terms], ...F>();  // @monitor match
```

## Wrappers

Decorators replace the old functional wrappers. There is no `system(fn)`, `observer(fn)`, or `plugin(fn)`. Use `@system`, `@observer`, `@monitor`, `@plugin` classes.

## Networking (`@rovy/networking`)

Networking lives in a separate package. The current MVP public surface is:

```ts
import { NetClient, NetServer, netEvent } from "@rovy/networking";

@netEvent(options: {
	direction: "clientToServer" | "serverToClient";
	channel?: "reliable" | "unreliable";
	receive?: "send" | "trigger";
})

class NetClient {
	send<E extends ClientToServerNetEvent>(event: E): void;
	trigger<E extends ClientToServerNetEvent>(event: E): void;
}

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

See [Networking](/packages/networking.md) for the full spec, current package boundary, explicit Blink generation, `rovy-build` config shape, scheduling, and boundary checks.

## Datastore (`@rovy/datastore`)

Datastore lives in a separate package. The v1 public surface is:

```ts
import {
  document,
  playerDocument,
  sharedDocument,
  type DocumentReader,
  type DocumentWriter,
  type DocumentOpener,
} from "@rovy/datastore";

const Profile = playerDocument<ProfileData>()({
  name: "Profile",
  store: "PlayerData",
  key: (player) => tostring(player.UserId),
  default: () => ({ coins: 0 }),
  session: {
    lock: true,
    stealOnSessionLocked: true,
  },
  lifecycle: {
    autoOpen: true,
    autoClose: true,
    kickOnOpenFailure: true,
  },
});
```

Declarations:

```ts
playerDocument<T>()(options: PlayerDocumentOptions<T>): PlayerDocument<T>;
document<T, Owner>()(options: DocumentOptions<T, Owner>): KeyedDocument<T, Owner>;
sharedDocument<T>()(options: SharedDocumentOptions<T>): SharedDocument<T>;
```

Common options:

```ts
{
  name: string;
  store: string;
  key: (owner) => string; // playerDocument has default UserId key; sharedDocument uses string key
  default: () => T;
  migrations?: DocumentMigration<T>[];
  session?: {
    lock?: boolean;
    stealOnSessionLocked?: boolean;
  };
  lifecycle?: {
    autoOpen?: boolean;
    autoClose?: boolean;
    kickOnOpenFailure?: boolean; // player documents only
  };
  debug?: {
    printLifecycle?: boolean;
    printWrites?: boolean;
  };
  unsafeCheckOverride?: (value: unknown) => boolean;
}
```

Handles:

```ts
interface DocumentReader<D> {
  get(owner: DocumentOwner<D>): ReadonlyDeep<DocumentData<D>> | undefined;
  require(owner: DocumentOwner<D>): ReadonlyDeep<DocumentData<D>>;
  has(owner: DocumentOwner<D>): boolean;
  status(owner: DocumentOwner<D>): DocumentStatus;
  isOpen(owner: DocumentOwner<D>): boolean;
  keyOf(owner: DocumentOwner<D>): string;
}

interface DocumentWriter<D> extends DocumentReader<D> {
  update(owner: DocumentOwner<D>, transform: (data) => nextData, options?: DocumentUpdateOptions): DocumentUpdateResult;
  patch(owner: DocumentOwner<D>, patch: Partial<DocumentData<D>>, options?: DocumentUpdateOptions): DocumentUpdateResult;
  save(owner: DocumentOwner<D>, options?: DocumentSaveOptions): void;
}

interface DocumentOpener<D> {
  open(owner: DocumentOwner<D>, options?: DocumentOpenOptions): void;
  close(owner: DocumentOwner<D>, options?: DocumentCloseOptions): void;
  reopen(owner: DocumentOwner<D>, options?: DocumentOpenOptions): void;
  status(owner: DocumentOwner<D>): DocumentStatus;
  isOpen(owner: DocumentOwner<D>): boolean;
  keyOf(owner: DocumentOwner<D>): string;
}
```

Statuses:

```ts
type DocumentStatus = "closed" | "opening" | "open" | "saving" | "closing" | "failed";
```

Failure reasons:

```ts
type DocumentFailureReason =
  | "SessionLockedError"
  | "BackwardsCompatibilityError"
  | "RobloxAPIError"
  | "ValidationError"
  | "NotOpen"
  | "Closed"
  | "Unknown";
```

Lifecycle event payload types:

```ts
DocumentOpened<D>
DocumentOpenFailed<D>
DocumentChanged<D>
DocumentSaved<D>
DocumentSaveFailed<D>
DocumentClosed<D>
```

See [Datastore](/packages/datastore.md) for examples, queue behavior, session-lock behavior, rate-limit failure handling, and current backend-adapter boundary.

## World Inspector (`@rovy/world-inspector`)

Optional debug package for live ECS inspection and editing:

```ts
import {
  WorldInspectorPlugin,
  WorldInspectorServerPlugin,
  ToggleWorldInspector,
} from "@rovy/world-inspector";

class WorldInspectorPlugin {
  constructor(options?: {
    uiRoot?: Instance | Node;
    renderSchedule?: Ctor;
    networkSchedule?: Ctor;
  });
}

class WorldInspectorServerPlugin {
  constructor(options: {
    schedule: Ctor;
    access?: (ctx: WorldInspectorAccessContext) => boolean;
  });
}

class ToggleWorldInspector {}
class ShowWorldInspector {}
class HideWorldInspector {}
```

Use `WorldInspectorPlugin` on the client to render and drive the inspector UI.
Use `WorldInspectorServerPlugin` on the server to expose remote snapshots and
edits with explicit access control.

See [World Inspector](/packages/world-inspector.md) for setup, target behavior,
and instance-expression syntax like `Workspace/Zombie/HumanoidRootPart`.

## See also

- [Queries](/concepts/queries.md)
- [Commands](/concepts/commands.md)
- [Observers](/concepts/observers.md)
- [Monitors](/concepts/monitors.md)
- [Systems and injection](/concepts/systems-and-injection.md)
- [Datastore](/packages/datastore.md)
- [Networking](/packages/networking.md)
- [Prefabs](/concepts/prefabs.md)
- [UI](/packages/ui.md)
- [World Inspector](/packages/world-inspector.md)
