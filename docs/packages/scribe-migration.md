# Migrating direct Scribe code to `@rovy/scribe`

Keep the Wally-installed Scribe module. `@rovy/scribe` wraps that same native
runtime; it does not replace ProfileStore, move the module, or introduce another
saved copy of player data.

The migration changes how game code reaches Scribe:

| Direct Scribe | Rovy wrapper |
| --- | --- |
| Construct a bundle module manually | `scribeData({...})`; active plugin constructs the bundle |
| `Data.WaitForData(player)` | `ScribeServerReader.state/get` plus ready/unavailable events |
| `Data.Get(player)` | `ScribeServerReader.get/require` |
| `Data.Coins.Get()` | `reader.Coins.get()` |
| `Data.Coins.Increment(25)` | `writer.for(player).Coins.increment(25)` |
| Client `Data.Coins.Set(...)` | Explicit `ScribeLocalWriter` |
| `Observe`, `Changed`, container signals | `@scribeEvent` plus observer/EventReader |
| `Data.Batch(...)` | Automatic batch per player at every Rovy flush |
| `Data.Transaction(...)` | `ScribeServerWriter.transaction(...)` |
| `Data.Flush(player)` | `ScribePersistence.saveNow(player)` job |
| `Client.Request(...)` | `ScribeCommand<C, R>.call(...)` |
| `Server.Command(...)` | `@scribeCommand`, reader, responder |
| Yielding offline/version/ownership APIs | Feature-service job handles |
| `Client.GetShared(...)` | `ScribeSharedReader.get(...)` |
| `Data.Raw` or `ProfileStore` | Explicit `ScribeUnsafe` |

## 1. Move the template into a declaration

Replace a shared Luau module that calls `Scribe({...})` with a transformer-backed
TypeScript declaration:

<<< ../../packages/scribe/docs-examples/player-data.ts#player-data

Use lower-camel option names. The transformer validates them and emits native
Pascal-case keys. Keep the profile store name and key prefix unchanged so the
wrapper opens the same saved profiles.

Visibility has compile-time consequences:

- `s.serverOnly` disappears from client types;
- `s.shared` is the only shape exposed for other players;
- `s.session` disappears from offline/version persisted shapes.

## 2. Replace immediate access with injected readers and writers

Direct Scribe accessors combine reads, writes, and signals. The wrapper projects
them into separate capabilities:

<<< ../../packages/scribe/docs-examples/read-write-events.ts#same-set-stability

This is the most important semantic change. Do not rewrite code assuming
read-after-write within one system. Pass derived values explicitly inside the
system when needed, or read the committed result in the next set/event.

Direct client mutations were already optimistic and server-overwritable in
Scribe. Migrate them only when that behavior is intentional, and spell the
capability `ScribeLocalWriter`.

## 3. Replace native callbacks with Rovy events

Do not retain calls to `Observe`, `Changed`, `OnInsert`, `OnRemove`,
`OnKeyAdded`, or `OnKeyRemoved`. Declare the paths game code needs and consume
them through normal Rovy scheduling:

<<< ../../packages/scribe/docs-examples/read-write-events.ts#scribe-events

Native callbacks now enqueue immutable records. Rovy observers run after commit,
and scheduled systems can read the same change through `EventReader`.

Structural events preserve exact key/index/value operations. Do not depend on a
fabricated whole-container previous snapshot; `ScribeValueChanged.before` is
optional when native Scribe cannot supply one reliably.

## 4. Move commands to class contracts

Replace `Client.Request("Equip", payload)` and `Server.Command(...)` with a
shared request class, explicit result class, and injected endpoints:

<<< ../../packages/scribe/docs-examples/commands.ts#commands

Use both request and result generics in injected parameters. Calls return
immediately. Convert code that awaited a response into either:

- state-machine polling with `hasResult` / `takeResult`; or
- a declared `commandCompleted` event and Rovy observer.

Server responders are flush-gated. If the request queues a write and resolves
success, the reply is held until the server mutation commits. Do not assume the
client mirror receives the replication frame before its completion event.

## 5. Convert yielding calls to jobs

Persistence, offline data, versions, GDPR, gifts, authoritative ownership,
receipt routing, durable messaging, and similar yielding calls return
`ScribeJobHandle<T>`.

<<< ../../packages/scribe/docs-examples/services.ts#persistence-job

Never wrap a native yield inside a Rovy system yourself. Poll the owning service
or declare a `jobCompleted` event. `takeResult` consumes only the polling copy;
the completion event still emits once.

Remember that `saveNow` is a DataStore save request. It is unrelated to
`app.flush()`, which commits Rovy command buffers and package participants.

## 6. Move construction-time callbacks to server setup

Migrations, `OnPlayerInit`, product grants, economy resolvers, economy logging,
and a custom ProfileStore must remain in Scribe's construction path:

<<< ../../packages/scribe/docs-examples/setup.ts#server-setup

Do not model these as scheduled systems. Scribe needs migrations and
initialization to finish before a profile reaches `Ready`, while product grants
must execute inside native receipt/purchase transactions.

## 7. Isolate remaining raw code

If migration cannot be completed immediately, inject `ScribeUnsafe<D>` only in
the smallest adapter system or tool. Record why the raw API is required and
remove it once a first-class mapping exists.

Avoid mixing raw writes with buffered writers. A raw mutation can become visible
inside a set, bypass wrapper failure accounting, and trigger native callbacks
outside the intended Rovy order.

## Suggested rollout

1. Pin Scribe `1.0.11` and add `@rovy/scribe`.
2. Declare one bundle with unchanged store/key names.
3. Migrate reads, then authoritative writes.
4. Replace native field subscriptions with Scribe events.
5. Move commands and yielding operations.
6. Move construction callbacks into `configureScribeServer`.
7. Test client readiness, session end, transaction rollback, and command/write
   failure paths.
8. Remove direct game imports of the Scribe bundle, leaving only plugin module
   resolution and intentionally unsafe tooling.

Use the [package guide](/packages/scribe) for the full API, the
[compatibility matrix](/packages/scribe-compatibility) for the verified peer,
and the [parity inventory](/packages/scribe-parity) when auditing a direct
native call.
