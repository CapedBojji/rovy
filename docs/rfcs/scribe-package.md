# RFC: `@rovy/scribe`

Status: **Phase 2 package skeleton complete — schema lowering next**

This RFC proposes a partitioned Rovy package that projects Scribe's field-oriented
player-data API into stable readers, buffered writers, Rovy events, and non-yielding
jobs. The Phase 0 source is declaration-only. It does not bind a Scribe module,
register a plugin, transform decorators, subscribe to signals, or write player data.

The compile-only contract is in
[`packages/scribe/__typecheck.ts`](../../packages/scribe/__typecheck.ts). The parity
snapshot is in [`docs/packages/scribe-parity.md`](../packages/scribe-parity.md).

## Inventory baseline

The inventory was made from the official `ericplane/scribe` tag:

- Version: `1.0.10`
- Tag: `v1.0.10`
- Commit: `75ca11285e631787ac4386aaef0e6f702893c165`
- Commit date: 2026-07-21
- Runtime dependency: `lm-loleris/profilestore@1.0.3`

The source files used were `src/init.luau`, `src/Types.luau`,
`src/Internal/Node.luau`, `src/Internal/Datatypes.luau`,
`src/Server/init.luau`, `src/Client/init.luau`, and the generated-documentation
inputs under `docgen/guides`.

This exact baseline matters because several surfaces in the implementation plan do
not exist in Scribe 1.0.10:

- `Scribe.Configure`
- `Scribe.Reason`
- `Server.TryHandleReceipt`
- the `Mode` option
- the `TargetUserId` option

The wrapper must not claim parity with those members unless a different Scribe
commit is selected or the functionality is added upstream.

## Goals

The package should:

1. Keep Scribe authoritative for profile state, validation, persistence,
   replication, transactions, monetization, and its wire protocol.
2. Keep Rovy authoritative for scheduling, buffering, flush ordering, and
   reactions.
3. Never yield a Rovy system or observer.
4. Project native accessors into separate read and write trees.
5. Translate native signals into immutable Rovy event records.
6. Convert yielding operations into handles plus polling/completion events.
7. Keep raw Scribe and ProfileStore access behind `ScribeUnsafe`.
8. Support multiple isolated Scribe bundles without vendoring Scribe.

## Proposed declaration

`scribeData({...})` declares one bundle. Schema helpers deliberately map to native
Scribe declarators:

```ts
export const PlayerData = scribeData({
	name: "PlayerData",
	profileStoreIndex: "PlayerData",
	profileKeyPrefix: "PLAYER_",
	template: {
		Coins: s.int(0, { min: 0 }),
		EquippedItem: s.optional(s.string("", { maxLength: 64 })),
		Inventory: s.dictOf(
			{
				Amount: s.int(1, { min: 1 }),
				Level: s.int(1, { min: 1, max: 100 }),
			},
			{ maxKeys: 200, maxKeyLength: 64 },
		),
		Public: s.shared({
			DisplayName: s.string("", { maxLength: 32 }),
		}),
		Secret: s.serverOnly({ Flagged: false }),
		Runtime: s.session({ InCombat: false }),
	},
});
```

The definition retains its schema type so these projections are computable:

```ts
ScribeShape<D>;          // all roots, visibility wrappers removed
ScribeClientShape<D>;    // excludes serverOnly roots
ScribeSharedShape<D>;    // only shared roots
ScribePersistedShape<D>; // excludes session roots
```

The Phase 0 declarations cover all 17 native datatype declarators, bounded numbers
and strings, enums, timed/dynamic/optional values, typed arrays/dictionaries, and
root visibility.

## Reader and writer split

Readers expose committed snapshots only. Native mutation and subscriptions are not
present:

```ts
data.Coins.get();
data.Coins.default();
data.Coins.min();
data.Inventory.at("IronSword").Level.get();
data.ActiveBoost.active();
```

`get()` returns a deeply read-only value. For tables, runtime implementation must
return a frozen clone cached by node revision; `clone()` returns a fresh mutable
clone. Neither may expose Scribe's live table.

Writers return `void` and enqueue operations:

```ts
writes.for(player).Coins.increment(25);
local.EquippedItem.set("IronSword");
```

Server writes are authoritative. Client writes are deliberately named
`ScribeLocalWriter` and only update the client's Scribe mirror after the Rovy flush
point.

Dynamic containers use `.at(key)` / `.at(index)`. This avoids collisions between
user keys and accessor methods. A missing dictionary entry's `.get()` is
`undefined`; its declared children remain addressable so a write can start from
the element default.

## Events

`@scribeEvent` is a discriminated decorator and implies a normal Rovy event
registration:

```ts
@scribeEvent({ data: PlayerData, kind: "changed", path: "Coins" })
class CoinsChanged extends ScribeValueChanged<typeof PlayerData, "Coins"> {}
```

The runtime should subscribe once per `(definition, path, native signal)` and fan
one immutable record into:

- `commands.send` when an `EventReader<E>` exists;
- `commands.trigger` when an observer exists;
- both when both consumer forms exist.

Structural events carry exact keys/indexes and values. They do not promise a
whole-container `before` snapshot. Leaf records carry `before`, `after`, source,
and flush revision.

## Commands

Commands remain class contracts and native Scribe remains the transport:

```ts
@scribeCommand({ data: PlayerData, result: EquipItemResult })
class EquipItem {
	constructor(public readonly itemId: string) {}
}
```

Client calls return stable, non-yielding handles. Native `Client.Request` runs in
an internal task. Server requests enter a Rovy-owned queue, and a response is not
released until associated buffered writes finish.

### TypeScript result-association blocker

A decorator cannot change the structural type of the decorated class. Therefore
this form cannot make `ScribeCommandResultType<EquipItem>` resolve to
`EquipItemResult` during TypeScript checking:

```ts
@scribeCommand({ result: EquipItemResult, data: PlayerData })
class EquipItem {}
```

The one-generic form compiles in the fixture, but its polled result is `unknown`.
The recommended Phase 1 contract is explicit, matching the existing
`NetFunc<Request, Result>` convention:

```ts
ScribeCommand<EquipItem, EquipItemResult>
ScribeCommandReader<EquipItem, EquipItemResult>
```

Alternatives are a required phantom result field on every request class, a static
result constructor plus constructor-typed injection, or a declaration builder.
None is as small or as familiar as the second generic. This decision must be made
before transformer work.

## Jobs

Every yielding native call returns `ScribeJobHandle<T>`. Each feature service owns
the polling methods for handles it creates:

```ts
interface ScribeJobResults {
	hasResult<T>(handle: ScribeJobHandle<T>): boolean;
	takeResult<T>(handle: ScribeJobHandle<T>): ScribeJobResult<T> | undefined;
}
```

Completion is also emitted once through `ScribeJobCompleted<T>`. Polling consumes
the stored result; it does not suppress the completion event.

Native `Server.PromptGift` must be treated as yielding even though its public source
annotation lacks `@yields`: its implementation waits for durable saves. It is a
job in the proposed service.

## Phase 1 core flush participant

The Phase 0 contract was approved on 2026-07-23. Core now exposes the
package-neutral prerequisite:

```ts
export interface FlushParticipant {
	flush(context: FlushContext): boolean;
}

export interface FlushContext {
	readonly app: App;
	readonly world: World;
	readonly commands: Commands;
	readonly schedule?: Ctor;
	readonly set?: Ctor;
}

app.registerFlushParticipant(participant);
```

At each scheduler set boundary, and from both `app.flush()` and `world.flush()`,
core executes:

```text
run current set
  -> flush Rovy commands
  -> flush package participants
  -> Scribe applies writes
  -> native callbacks enqueue journal records
  -> dispatch observer events
  -> repeat while work remains (bounded)
  -> reconcile monitors
  -> next set
```

Participants run in registration order. Duplicate registration on one app fails,
and registration during a flush begins at the next boundary. Observer-generated
commands and participant work share one convergence loop capped at 1,000 cycles.
Monitors and legacy post-flush listeners run only after that loop settles.

## Binding and package boundary

Scribe is a Wally runtime peer, not an npm dependency and not vendored code.
Resolution order remains:

1. explicit module/module value;
2. configured resolver;
3. `ReplicatedStorage.Packages.Scribe`;
4. precise startup failure.

The native module remains in its original location so Scribe Studio can attach its
debug hook. A binding seam isolates runtime code and permits deterministic fakes.

The package has no dependency on `@rovy/datastore` or `@rovy/networking`.

## Decision review

| Decision | Phase 0 recommendation | Reason |
| --- | --- | --- |
| `scribeData` vs `defineScribeData` | Keep `scribeData` | Matches Rovy's concise declaration style and is unambiguous when imported from `@rovy/scribe`. |
| `.at(key)` vs bracket access | Keep `.at(key)` | Arbitrary keys cannot shadow `get`, `set`, `remove`, or `count`; it also gives a stable transformer/runtime surface. |
| `ScribeLocalWriter` | Keep, explicit opt-in | The name correctly denies authority. Documentation and event source metadata must repeat that it is local-only. |
| Class commands | Keep, but add explicit result generic | Decorator-only result inference is impossible in TypeScript. |
| One `@scribeEvent({ kind })` | Keep | A discriminated options union remains extensible and makes it easy for the transformer to imply `@event`. |
| Separate feature services | Keep | Persistence, ownership, receipts, monetization, cooldowns, diagnostics, and unsafe access have different authority/yield rules. |
| Wally Scribe peer | Keep | Avoids duplicate ProfileStore/Scribe state and preserves Studio hooks. |
| Native transport first | Keep | Preserves sender identity, validation, rate limits, framing, and reply encoding. |

## API differences requiring approval

1. The examples use a local `Update` class because `@rovy/core` does not export an
   `Update` schedule today. Adding standard schedules is a separate core decision.
2. The optimistic writer parameter is named `localWrites` in the fixture because
   `local` is a reserved Luau keyword and roblox-ts rejects it as an identifier.
3. Command polling is fully typed only with
   `ScribeCommand<Command, Result>` / `ScribeCommandReader<Command, Result>`.
4. `Scribe.Configure` and `Scribe.Reason` are omitted from the native binding
   because they are absent from 1.0.10.
5. `TryHandleReceipt` is omitted because 1.0.10 only exposes `HandleReceipt`.
   A wrapper must not infer whether an unknown receipt belongs to Scribe from a
   `NotProcessedYet` result.
6. `mode` and `targetUserId` are omitted from `ScribeDataOptions`; 1.0.10 exposes
   `useMock`, `viewedUserId`, `overriddenUserId`, `dontSave`, and `resetData`.
7. `ScribeProcessConfiguration` is only a proposed wrapper conflict model. There
   is no native `Scribe.Configure` call to make in 1.0.10. The actual global
   conflicts are ProfileStore's autosave constant and Scribe's process-global
   health configuration.
8. Receipt routing cannot be finalized until the target Scribe version is chosen.
   A `ProcessReceipt` callback is allowed to yield, but a Rovy system is not; the
   plugin needs a setup-time router, not only a scheduled feature service.
9. Command completion ordering relative to replication remains unpromised until a
   native ordered-frame integration test proves it.

## Phase 0 checkpoint (approved)

- The declaration fixture type-checks with no public `any`.
- Client types exclude `serverOnly` roots.
- Persisted types exclude `session` roots.
- Shared types contain only `shared` roots.
- Reader mutation/subscription calls fail type checking.
- Every inventoried native member has one parity classification.
- No Scribe runtime package or transformer lowering has started.

The selected target remains Scribe 1.0.10. Command callers and readers use the
explicit request/result generic pair described above.

## Phase 1 exit criteria

- A fake package write queued in one set commits before the next set.
- Readers remain stable within the producing set.
- An observer can queue another package write and converge in the same boundary.
- Monitors see the final converged state.
- Participant ordering is deterministic.
- `app.flush()`, `world.flush()`, and scheduler boundaries share one path.
- A non-converging participant fails with a named 1,000-cycle diagnostic.
- Existing core tests continue to pass.

## Phase 2 package boundary

`@rovy/scribe` now builds as a partitioned Rovy package. Shared declarations,
registry metadata, schema descriptors, parameter IDs, and the active-boundary
facade are emitted to both sides; `ScribeClientPlugin` and
`ScribeServerPlugin` are emitted only to their matching runtime boundary.

The runtime peer is resolved in this order:

1. `ScribePluginOptions.module`;
2. `ScribePluginOptions.resolveModule` or the package registry's configured
   resolver;
3. `ReplicatedStorage.Packages.Scribe`;
4. a named startup error.

Each app receives its own `ScribeRuntime`, native bundles, handle cache, and core
flush-participant registration. A process-level version guard rejects two
different Scribe versions. The native binding seam has a deterministic fake for
unit tests. Custom transport objects are passed into native bundle options by
identity.

Auto-install only activates when the registry contains a Scribe declaration or a
system, observer, monitor, or prefab requests a stable `@rovy/scribe/*` external
parameter. Explicit plugins always install. Two apps and multiple declarations
remain isolated.

Phase 2 deliberately does not project native accessors yet. Injected
definition-scoped values are identity-bearing skeleton handles until the reader
and writer phases replace them with their typed implementations.
