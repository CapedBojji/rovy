# Scribe (`@rovy/scribe`)

Status: implemented against the verified Scribe 1.0.11 peer; live-service
evidence limits are recorded in the compatibility and parity pages.

`@rovy/scribe` lets Rovy systems use Scribe player data without yielding,
leaking native signals, or bypassing Rovy's schedule. Scribe still owns the
profile, validation, persistence, session lock, replication, monetization, and
wire protocol. Rovy owns when game mutations commit and when game reactions
run.

The package is not a `@rovy/datastore` adapter. It does not copy Scribe profiles
into a second authoritative store, and it does not depend on
`@rovy/networking`.

## Install

Install the Rovy package:

```sh
npm i @rovy/scribe
```

Install the verified native peer with Wally:

```toml
# wally.toml
[dependencies]
Scribe = "ericplane/scribe@1.0.11"
```

Keep `@rovy/core`, `rovy-transformer`, and `rovy-build` configured normally.
The transformer lowers `scribeData`, `@scribeCommand`, `@scribeEvent`, and
injected Scribe parameters. Direct `rbxtsc` builds that bypass the transformer
are unsupported.

By default, the runtime resolves
`ReplicatedStorage.Packages.Scribe`. It rejects any version other than
`1.0.11` before constructing a bundle. See
[Scribe compatibility](/packages/scribe-compatibility) for the exact tag,
commit, native gates, custom-module setup, and the explicit unverified opt-out.

## Mental model

| Injected contract | Boundary | Meaning |
| --- | --- | --- |
| `ScribeClientReader<D>` | client | Committed client-visible profile data |
| `ScribeClientState<D>` | client | Flush-stable readiness, service status, and save state |
| `ScribeLocalWriter<D>` | client | Buffered writes to the local mirror only |
| `ScribeSharedReader<D>` | client | Deeply read-only `s.shared(...)` roots for other players |
| `ScribeServerReader<D>` | server | Committed authoritative profile data |
| `ScribeServerWriter<D>` | server | Buffered authoritative writes and transactions |
| `ScribeCommand<C, R>` | client | Non-yielding native command caller |
| `ScribeCommandReader<C, R>` | server | Authoritative command request queue |
| `ScribeCommandResponder` | server | Flush-gated command response writer |
| `@scribeEvent(...)` | both | Native Scribe change or signal translated to a Rovy event |

Readers contain no mutation or subscription methods. Writers contain no native
signals. Every native API that can yield is exposed as a non-yielding command
handle or job handle.

## Declare player data

The following example is imported directly from a fixture included in
`@rovy/scribe`'s type-check command:

<<< ../../packages/scribe/docs-examples/player-data.ts#player-data

The schema helpers map to native Scribe declarators:

| Rovy helper | Native declarator |
| --- | --- |
| `s.int`, `s.number`, `s.string`, `s.enum` | `Int`, `Number`, `String`, `Enum` |
| `s.timed`, `s.dynamic`, `s.optional` | `Timed`, `Dynamic`, `Optional` |
| `s.arrayOf`, `s.dictOf` | `ArrayOf`, `DictOf` |
| `s.serverOnly`, `s.shared`, `s.session` | `ServerOnly`, `Shared`, `Session` |
| `s.vector3`, `s.cframe`, and the other datatype helpers | Matching native Roblox datatype declarator |

Plain booleans, strings, numbers, objects, and arrays are also inferred.
Declarators retain native Scribe nesting rules. The transformer reports invalid
bounds, defaults, container limits, visibility placement, reserved accessor
names, excessive depth, and nonserializable schema content before runtime.

The inferred projections are different by design:

- `ScribeShape<typeof PlayerData>` contains every root.
- `ScribeClientShape<typeof PlayerData>` excludes `s.serverOnly(...)`.
- `ScribeSharedShape<typeof PlayerData>` contains only `s.shared(...)`.
- `ScribePersistedShape<typeof PlayerData>` excludes `s.session(...)`.

`PlayerData.Secret` therefore cannot be reached through a client reader, while
`PlayerData.Runtime` can be read at runtime but cannot appear in offline or
version snapshots.

## Read committed data

Client systems inject the reader and readiness state separately:

<<< ../../packages/scribe/docs-examples/read-write-events.ts#committed-client-read

Scribe supplies template defaults before its first replicated snapshot, so a
reader value alone does not prove readiness. Check `state.ready` when gameplay
requires authoritative data.

Reader nodes expose:

<<< ../../packages/scribe/docs-examples/read-write-events.ts#reader-surface

`get()` returns a deeply frozen clone cached for the current Rovy flush
revision. `clone()` returns a fresh mutable clone. Neither method exposes
Scribe's live table. Arrays use zero-based indexes on the Rovy side; the wrapper
translates to Scribe's native one-based accessors.

Dynamic dictionaries always use `.at(key)`. A game key named `"get"`,
`"remove"`, or `"count"` cannot collide with accessor methods.

Server readers select by player:

<<< ../../packages/scribe/docs-examples/read-write-events.ts#stable-server-read

`get` checks native state before reading and never calls a yielding wait path.

## Buffer writes

Authoritative server writes are queued in system call order:

<<< ../../packages/scribe/docs-examples/read-write-events.ts#authoritative-write

Writer methods return `void`; a return value would falsely imply that a queued
mutation had already committed. Numeric economy metadata is validated against
the declared currency leaf and custom field slots before native Scribe receives
it.

The boundary order is:

```text
run systems in the current set
  -> flush ordinary Rovy commands
  -> replay package writes through native Scribe
  -> collect immutable native changes
  -> send/trigger Rovy events
  -> repeat if an observer queued more work
  -> reconcile monitors
  -> advance to the next set
```

A reader is stable for the whole set. If `Coins` begins at `100`, a system can
queue `increment(50)` and still read `100`; the next set reads `150`.
`app.flush()` uses the same convergence path as scheduler set boundaries.

Ordinary writes for one player are replayed in native `Data.Batch`. This
coalesces replication but is not atomic rollback. Use an explicit transaction
when every operation must succeed together:

<<< ../../packages/scribe/docs-examples/read-write-events.ts#transaction

`update(transform)` runs at flush against the latest native committed value and
receives a frozen clone. The callback must not yield.

### Client-local writes

Local preview state requires the explicitly local writer:

<<< ../../packages/scribe/docs-examples/read-write-events.ts#local-write

The write applies to Scribe's client mirror at the Rovy flush point. It is never
persisted or sent to the server, and the next authoritative replication update
may replace it. There is deliberately no client type named `ScribeWriter`.

## React through Rovy events

Declare only the native changes the game consumes:

<<< ../../packages/scribe/docs-examples/read-write-events.ts#scribe-events

`@scribeEvent` implies the ordinary Rovy `@event` contract. At startup, the
runtime inspects actual consumers:

- an `EventReader<E>` causes buffered `commands.send`;
- an `@observer({ event: E })` causes deferred `commands.trigger`;
- both receive the same immutable event object;
- multiple contracts for one native field still create one native
  subscription.

There is no public `Observe`, `Changed`, `OnInsert`, `OnRemove`, `OnKeyAdded`,
or `OnKeyRemoved` method. Native callbacks only enter a package-owned ingress
queue; game observers run after the associated commit.

Supported `kind` values:

| Kind | Base event |
| --- | --- |
| `ready`, `unavailable` | `ScribeReady`, `ScribeUnavailable` |
| `changed` | `ScribeValueChanged` |
| `inserted`, `removed` | `ScribeArrayInserted`, `ScribeArrayRemoved` |
| `keyAdded`, `keyRemoved` | `ScribeKeyAdded`, `ScribeKeyRemoved` |
| `sessionEnded`, `save`, `anomaly` | Lifecycle base classes |
| `giftReceived`, `giftCredit`, `ownershipChanged` | Monetization/ownership base classes |
| `message`, `leaderboard`, `serviceStatus`, `sharedChanged`, `issue` | Matching signal base classes |
| `jobCompleted` | `ScribeJobCompleted` |
| `commandCompleted` | `ScribeCommandCompleted` |

Leaf changes include `before`, `after`, `source`, and `revision`. `before` is
optional because native Scribe does not provide a reliable previous whole-table
snapshot for every ancestor-container callback. Structural events preserve exact
keys or zero-based indexes and values instead of fabricating a whole-container
history.

## Call authoritative commands

Commands are shared class contracts, use Scribe's native command transport, and
remain non-yielding to game systems:

<<< ../../packages/scribe/docs-examples/commands.ts#commands

Always write the result generic explicitly:

```text
ScribeCommand<EquipItem, EquipItemResult>
ScribeCommandReader<EquipItem, EquipItemResult>
```

A TypeScript decorator cannot alter the structural type of the class it
decorates, so `ScribeCommand<EquipItem>` can only infer `unknown` for the result.

`call()` validates and snapshots one request object, allocates a stable handle,
and queues native `Client.Request` work for the next flush. A package-owned task
performs the native yield. Results support both styles:

<<< ../../packages/scribe/docs-examples/commands.ts#command-polling

The declared completion event fires exactly once even if no caller polls the
handle. Polling does not suppress that event.

Exactly one server `ScribeCommandReader` consumer may exist per command. A
second is a startup error because a command has one authoritative result. The
native handler retains sender identity, readiness gating, rate limiting,
request timeout, argument-shape validation, frame encoding, and unknown-command
rejection.

`respond.resolve` and `respond.reject` are buffered. A success reply is not
released until queued writes from that request have committed. A write failure
changes the response to failure. The wrapper does not currently promise that
the client replication diff is observed before the completion event; that
cross-frame order depends on the verified native/custom transport.

## Use non-yielding jobs

Every yielding Scribe operation returns `ScribeJobHandle<T>`. Services that
create jobs also expose:

```text
service.hasResult(handle);
service.takeResult(handle); // ScribeJobResult<T> | undefined
```

`takeResult` consumes the stored polling result. A declared
`ScribeJobCompleted` event still fires once:

<<< ../../packages/scribe/docs-examples/services.ts#job-event

Jobs begin after writes queued earlier in the same Rovy boundary commit.
Player-bound jobs are canceled when that player's Scribe session ends.

### Persistence

Scribe's native `Flush` means “force a DataStore save.” The wrapper names that
operation `saveNow()` so it cannot be confused with a Rovy command-buffer
flush:

<<< ../../packages/scribe/docs-examples/services.ts#persistence-job

`ScribePersistence<D>` is server-only:

| Method | Result |
| --- | --- |
| `getSaveInfo(player)` | Synchronous committed save metadata |
| `saveNow(player, { force? })` | `ScribeJobHandle<boolean>` |
| `getOffline(userId)` | Typed persisted snapshot or `undefined` job |
| `updateOffline(userId, transform)` | Validated offline update job |
| `listVersions(userId, limit?)` | Version metadata job |
| `getVersion(userId, versionId)` | Typed historical snapshot job |
| `restoreVersion(userId, versionId)` | Restore job |
| `erase(userId)` | GDPR erase job |
| `export(userId)` | GDPR export job |

Offline transforms receive a deeply frozen `ScribePersistedShape<D>`, must not
yield, and must return the complete persisted shape. Native Scribe remains
authoritative for active-session refusal, version behavior, and private profile
metadata.

## Feature services

Feature areas stay separate so authority and yield behavior remain visible.

### Leaderboards

<<< ../../packages/scribe/docs-examples/services.ts#leaderboards

`ScribeLeaderboards<D>` is available on both boundaries. `get` reads the native
cache. Client `getMyRank(name)` reads the local rank; server
`getMyRank(name, player)` requires the target player. Static leaderboard
declarations accept only numeric schema paths.

### Monetization and purchase logs

<<< ../../packages/scribe/docs-examples/services.ts#monetization

On the server, `ScribeMonetization<D>` exposes `promptGift`, atomic `purchase`,
buffered `recordPurchase`, `getGiftCredits`, and `getPurchases`. On the client,
only the replicated `getGiftCredits()` and `getPurchases()` reads are valid;
authoritative methods fail clearly.

Native Scribe owns durable gift intent, receipt-safe delivery, atomic purchase
rollback, and economy event suppression on rollback. A purchase grant receives
a typed immediate writer because the grant runs inside Scribe's native
transaction.

### Ownership and receipts

`ScribeOwnership<D>` provides:

- client mirror `owns(key)` and job-based `ownsSynced(key, timeout?)`;
- server cached `owns(key, player)` and job-based
  `ownsAuthoritative(player, key)`;
- buffered server `grantPerk(player, key)` and `revokePerk(player, key)`.

Client ownership is never authoritative. Use the server job before granting
anything security-sensitive.

`ScribeReceipts<D>` is server-only. `handleReceipt(receipt)` and
`tryHandleReceipt(receipt)` are jobs. Native receipt ownership, idempotency,
default `ProcessReceipt`, and fail-closed decisions remain unchanged.

### Cooldowns and durable messaging

`ScribeCooldowns<D>` is server-only:

- `onCooldown(player, key, seconds)` is a flush-gated check-and-arm job;
- `peek(player, key)` is a committed read;
- `clear(player, key)` is a buffered mutation.

`ScribeMessaging<D>.send(userId, payload)` is a server job over Scribe's durable
ProfileStore global-update path. Declare a `kind: "message"` Scribe event for
incoming payloads.

### Shared data

<<< ../../packages/scribe/docs-examples/read-write-events.ts#shared-read

`ScribeSharedReader<D>` returns a deeply frozen clone containing only
`s.shared(...)` roots. Unknown, session, and server-only roots are filtered even
if a malformed native binding returns them.

### Diagnostics

<<< ../../packages/scribe/docs-examples/services.ts#diagnostics

`ScribeDiagnostics` is process-wide and available on both boundaries:

- `status()` returns `Healthy`, `Degraded`, or `Outage`;
- `recentLogs(filter?)` returns immutable normalized log records;
- `metrics()` returns immutable numeric counters and summaries;
- `addSink(callback)` installs a normalized log sink.

`ScribeStatusChanged` and `ScribeIssue` bridge the two top-level native signals
through normal Rovy events. `ScribeReason` exports frozen lifecycle reason
constants.

## Edit-mode data and commands

`ScribeTestRuntime<D>` is client-only and guarded by native edit mode:

<<< ../../packages/scribe/docs-examples/services.ts#edit-mode

`seed(values, state?)` buffers native `Client.Mock`; committed readers change at
the Rovy flush point. Optional state covers perks, gift credits, leaderboards,
and purchase logs. `mockCommand(CommandClass, handler)` uses the same request
and result class validators as a live command. Both methods throw outside edit
mode.

## Server construction hooks

Migrations, player initialization, product grants, economy resolvers, and a
custom `ProfileStore` run inside native Scribe construction or transactions.
They cannot be scheduled Rovy systems:

<<< ../../packages/scribe/docs-examples/setup.ts#server-setup

`onPlayerInit` receives a restricted synchronous initialization tree.
Migrations receive and return the complete typed persisted shape. Product grants
receive a typed immediate read/write tree inside the native transaction.
None of these facades exposes signals or a public flush.

Declarations and injected params normally auto-install the active-boundary
plugin. Add `ScribeServerPlugin` explicitly when supplying server setup. Add
`ScribeClientPlugin`, `ScribeServerPlugin`, or the active-boundary
`ScribePlugin` explicitly when supplying a custom module, resolver, process
configuration, transport, or compatibility option.

Native `Scribe.Configure` runs at most once and before the first bundle.
Conflicting process settings across apps fail startup. Several `scribeData`
declarations create isolated native bundles and parameter IDs.

## Full injection reference

| Type | Boundary | Synchronous surface |
| --- | --- | --- |
| `ScribeClientReader<D>` | client | Client-visible committed accessor tree |
| `ScribeClientState<D>` | client | `ready`, `serviceStatus`, `saveInfo` |
| `ScribeLocalWriter<D>` | client | Buffered local-mirror writer tree |
| `ScribeSharedReader<D>` | client | `get(playerOrUserId)` |
| `ScribeServerReader<D>` | server | `get`, `require`, `state` |
| `ScribeServerWriter<D>` | server | `for`, `transaction` |
| `ScribePersistence<D>` | server | Save/offline/version/GDPR reads and jobs |
| `ScribeLeaderboards<D>` | both | Cached board/rank reads |
| `ScribeMonetization<D>` | both | Boundary-appropriate gift/purchase reads and operations |
| `ScribeOwnership<D>` | both | Mirror reads, authoritative jobs, buffered perks |
| `ScribeReceipts<D>` | server | Receipt jobs |
| `ScribeCooldowns<D>` | server | Cooldown read, buffered clear, arm job |
| `ScribeMessaging<D>` | server | Durable message jobs |
| `ScribeTestRuntime<D>` | client | Edit-mode seed and mock command |
| `ScribeUnsafe<D>` | both | Explicit raw native boundary |
| `ScribeCommand<C, R>` | client | Command call and polling |
| `ScribeCommandReader<C, R>` | server | Request queue |
| `ScribeCommandResponder` | server | Buffered response |
| `ScribeDiagnostics` | both | Status, logs, metrics, sinks |

The transformer rejects an injected type on the wrong runtime boundary and
repeats critical checks at startup for handwritten metadata.

## Unsafe access

`ScribeUnsafe<D>` is the only raw escape hatch. It exposes the native module,
active native client or server object, server `ProfileStore`, and datatype
pack/unpack helpers. Use it for migrations, tooling, or a documented parity gap,
not routine gameplay.

Raw access does not become safe because it is injectable. Direct native writes
can violate same-set read stability and Rovy reaction order; direct native
subscriptions can run game code outside Rovy scheduling.

## Guarantees and limits

- No Rovy system or observer calls a yielding native API.
- Readers never mutate and writers never expose native signals.
- Server writes are authoritative and buffered; client writes are named
  local-only.
- The wrapper does not duplicate Scribe's authoritative profile state.
- Scribe's native protocol and custom transport buffers are not decoded or
  re-encoded.
- Strict support currently targets exactly Scribe `1.0.11`.
- Server writes commit before a command reply is released, but client diff
  arrival before command completion is not promised.
- Whole-container `before` snapshots are optional where native Scribe cannot
  prove them.

See the [migration guide](/packages/scribe-migration), the
[compatibility matrix](/packages/scribe-compatibility), and the exhaustive
[parity inventory](/packages/scribe-parity).
