# Scribe parity inventory

This is the Phase 0 parity snapshot for `@rovy/scribe`.

Baseline: `ericplane/scribe@1.0.11`, tag `v1.0.11`, commit
`4253d303f3ea9e70b362d9e1e498b805ac3a8d01` (2026-07-23).

Every row has exactly one primary classification:

- **first-class** — a typed synchronous read, buffered mutation, declaration, or
  feature service.
- **Rovy event** — a native signal/lifecycle callback bridged through immutable
  Rovy events.
- **Rovy job** — a yielding or flush-result operation represented by a
  non-yielding handle.
- **configuration pass-through** — validated wrapper configuration translated to
  native Scribe configuration/setup.
- **unsafe escape hatch** — available only through `ScribeUnsafe`.
- **intentionally unsupported** — absent from the selected upstream version or an
  implementation detail that must not be presented as covered.

Classification is not an implementation claim. In Phase 0, only type declarations,
compile fixtures, and negative type checks exist.

Phase 1 added the package-neutral core flush-participant prerequisite. Phase 2
added the partitioned package, native module resolver, binding seam, per-app
runtime isolation, native bundle construction, stable parameter IDs, custom
transport pass-through, and diagnostics proxy. It changes no primary parity
classification. Schema lowering, native accessors, writers, events, commands,
jobs, and native integration coverage remain incomplete.

Phase 3 added `scribeData`, `@scribeCommand`, and `@scribeEvent` lowering,
boundary-specific external parameter IDs, schema/configuration diagnostics,
one-to-one native declarator compilation, process configuration, and
construction-time server setup. Reader/writer/event/job runtime coverage remains
incomplete.

Phase 4 added committed client/server accessor projections, readiness state,
shared-only reads, zero-based typed container access, and per-flush frozen
snapshot caching. Writer/event/job runtime and native integration coverage remain
incomplete.

Phase 5 added signal-free buffered client-local and authoritative server writer
trees, ordered operation snapshots, automatic native batches, explicit native
transactions, economy metadata translation, and flush failure records. Event/job
bridges and native integration coverage remain incomplete.

Phase 6 added registry-driven native subscriptions, immutable callback ingress,
leaf coalescing, exact structural records, lifecycle/signal bridges, and deferred
Rovy `send`/`trigger` publication. Commands, general jobs, and native integration
coverage remain incomplete.

Phase 7 added stable non-yielding client command handles, native request tasks,
one-consumer server queues, flush-gated responders, request/result wire-shape
validation, cancellation/timeout handling, and command-completion events. The
unmodified pinned Scribe 1.0.11 dispatcher proves its `xpcall` path is yieldable
and runs the wrapper bridge end to end. General jobs and feature services were
completed in later phases.

Phase 8 added one post-write non-yielding job bridge, immutable polling and
completion results, player-session cancellation, persistence/offline/version/GDPR
services, native datatype projection for persisted snapshots, durable messaging,
readiness-gated client save state, and raw/ProfileStore unsafe handles.

Phase 9 added boundary-aware leaderboard, monetization, ownership, receipt, and
cooldown services; native atomic purchase delegation; typed immediate grant
facades; purchase-record normalization; and economy declaration/runtime
validation.

Phase 10 added normalized immutable diagnostics, buffered client edit-mode
seeding and typed mock commands, a complete unsafe datatype facade, exact custom
transport buffer-identity coverage, strict peer-version enforcement, and a real
Roblox Studio client-bundle test. The Studio test uses the unmodified pinned
Scribe peer, preserves its frozen `__ScribeTemplate`, and observes the native
`_ScribeClientDebugHook` with both endpoints attached.

Phase 11 added the public package and migration guides, compile-checked
documentation fixtures, the frozen `ScribeReason` constants, and release/package
navigation. The documentation fixture also caught and closed a strict-variance
hole in `ScribeServerPlugin.bundles`; typed `configureScribeServer(...)` results
now pass through a non-generic erased container contract without introducing
public `any`.

The final native acceptance gate constructs two wrapper-owned bundles on both
Roblox boundaries against the unmodified pinned peer. It runs Scribe's default
RemoteEvent transport, a deterministic injected ProfileStore implementation,
real client replication, buffered batches and rollback transactions, deferred
Rovy events, flush-gated commands, persistence/version/GDPR jobs, durable
messaging, leaderboards, economy analytics, ownership, purchases, receipts,
gift credits and delivery, shared init/diff/removal, cooldowns, diagnostics,
save/session lifecycle, and Studio hooks. The gate passes twice consecutively
and proves that, for the supported default transport, the authoritative command
diff is applied before command completion is published. Cloud DataStore
availability and Marketplace prompt UI remain external-service evidence limits;
the wrapper never substitutes their behavior.

## Top-level Scribe module

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `Version` | first-class | `scribeVersion()` and binding version | Unit coverage Phase 2; pinned native Studio coverage Phase 10 |
| `new` | first-class | `scribeData` declaration plus plugin-owned bundle construction | Fake binding Phase 2; pinned two-boundary/two-bundle Studio gate |
| callable `Scribe(options)` | first-class | Same mapping as `new`; game code never constructs a second wrapper state | Fake binding Phase 2; pinned two-boundary/two-bundle Studio gate |
| `ServerOnly` | first-class | `s.serverOnly` | Type projection and native declarator coverage Phase 3 |
| `Shared` | first-class | `s.shared` | Type projection and native declarator coverage Phase 3 |
| `Session` | first-class | `s.session` | Type projection and native declarator coverage Phase 3 |
| `Int` | first-class | `s.int` | Type, transformer, and native declarator coverage Phase 3 |
| `Number` | first-class | `s.number` | Type and native declarator coverage Phase 3 |
| `String` | first-class | `s.string` | Type, transformer, and native declarator coverage Phase 3 |
| `Enum` | first-class | `s.enum` | Type and native declarator coverage Phase 3 |
| `Timed` | first-class | `s.timed` | Type and native declarator coverage Phase 3 |
| `Dynamic` | first-class | `s.dynamic` | Type and native declarator coverage Phase 3 |
| `Optional` | first-class | `s.optional` | Type and native declarator coverage Phase 3 |
| `ArrayOf` | first-class | `s.arrayOf` | Type and native declarator coverage Phase 3 |
| `DictOf` | first-class | `s.dictOf` | Type, transformer, and native declarator coverage Phase 3 |
| `Vector3` | first-class | `s.vector3` | Type and native declarator coverage Phase 3 |
| `Vector2` | first-class | `s.vector2` | Type and native declarator coverage Phase 3 |
| `Vector3int16` | first-class | `s.vector3int16` | Type and native declarator coverage Phase 3 |
| `Vector2int16` | first-class | `s.vector2int16` | Type and native declarator coverage Phase 3 |
| `CFrame` | first-class | `s.cframe` | Type and native declarator coverage Phase 3 |
| `Color3` | first-class | `s.color3` | Type and native declarator coverage Phase 3 |
| `BrickColor` | first-class | `s.brickColor` | Type and native declarator coverage Phase 3 |
| `UDim` | first-class | `s.udim` | Type and native declarator coverage Phase 3 |
| `UDim2` | first-class | `s.udim2` | Type and native declarator coverage Phase 3 |
| `Rect` | first-class | `s.rect` | Type and native declarator coverage Phase 3 |
| `NumberRange` | first-class | `s.numberRange` | Type and native declarator coverage Phase 3 |
| `NumberSequence` | first-class | `s.numberSequence` | Type and native declarator coverage Phase 3 |
| `ColorSequence` | first-class | `s.colorSequence` | Type and native declarator coverage Phase 3 |
| `DateTime` | first-class | `s.dateTime` | Type and native declarator coverage Phase 3 |
| `EnumItem` | first-class | `s.enumItem` | Type and native declarator coverage Phase 3 |
| `Font` | first-class | `s.font` | Type and native declarator coverage Phase 3 |
| `PhysicalProperties` | first-class | `s.physicalProperties` | Type and native declarator coverage Phase 3 |
| `Datatypes.IsSupported` | unsafe escape hatch | `ScribeUnsafe.datatypes.isSupported`; migration/tooling only | Type and direct runtime coverage Phase 10 |
| `Datatypes.Pack` | unsafe escape hatch | `ScribeUnsafe.datatypes.pack` | Type and direct runtime coverage Phase 8/10 |
| `Datatypes.Unpack` | unsafe escape hatch | `ScribeUnsafe.datatypes.unpack` | Type and direct runtime coverage Phase 8/10 |
| `Datatypes.NONFINITE` | intentionally unsupported | Internal validation prefix, not a documented game API; exposing it would couple Rovy to an implementation detail | Negative public-surface type coverage Phase 10 |
| `Reason` | first-class | Frozen `ScribeReason` constants and `ScribeLifecycleReason` union | Type and direct runtime coverage Phase 11 |
| `Configure` | configuration pass-through | `ScribePlugin.configure`, exactly once before bundle construction | Binding and conflict unit coverage Phase 3 |
| `GetStatus` | first-class | `ScribeDiagnostics.status` | Normalized unit and pinned native Studio coverage Phase 10 |
| `OnStatusChanged` | Rovy event | `ScribeStatusChanged` | Deferred signal/runtime Phase 6; pinned native degrade/recover Studio gate |
| `OnIssue` | Rovy event | `ScribeIssue` | Deferred normalization Phase 6; pinned native error-log Studio gate |
| `AddLogSink` | first-class | `ScribeDiagnostics.addSink`, installed during setup | Frozen-normalization unit and pinned native Studio coverage Phase 10 |
| `GetRecentLogs` | first-class | `ScribeDiagnostics.recentLogs` | Filter translation, normalization, and pinned native Studio coverage Phase 10 |
| `GetMetrics` | first-class | `ScribeDiagnostics.metrics` | Summary normalization and pinned native Studio coverage Phase 10 |

## Exported Scribe contract types

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `ScribeTransport` | configuration pass-through | `ScribeTransport` preserves opaque buffers and sender identity | Type plus bidirectional exact-buffer identity coverage Phase 10 |
| `Op` / wire operations | intentionally unsupported | Scribe owns its wire protocol; Rovy must not decode/re-encode native operations | Same-object transport and unchanged-buffer runtime coverage Phase 10 |
| `LogEntry`, `LogLevel`, `LogCategory`, `Status` | first-class | Lower-camel immutable diagnostic records and literal unions | Type plus malformed/frozen normalization coverage Phase 10 |
| `LogCode` | first-class | Preserved as a stable string because native codes can expand inside a compatible peer release | Type and native diagnostic coverage Phase 10 |
| `SaveInfo` | first-class | `ScribeSaveInfo` | Client-state and persistence normalization runtime coverage Phase 8 |
| `LeaderboardEntry` | first-class | `ScribeLeaderboardEntry` | Boundary-native normalization and frozen result coverage Phase 9 |
| `LeaderboardConfig` | configuration pass-through | `ScribeLeaderboardConfig` with numeric-path validation | Type, transformer path, and native-key coverage Phase 3/9 |
| `ProductConfig`, `PassConfig` | configuration pass-through | Shared declarations plus server-only grant setup | Type, transformer, and grant-adapter coverage Phase 3/9 |
| `PurchaseSpec`, `PurchaseFilter` | first-class | `ScribePurchaseSpec`, `ScribePurchaseFilter` | Type, snapshot, filter-translation, and runtime coverage Phase 9 |
| `EconomyMeta` | first-class | `ScribeEconomyMeta` on numeric writes | Type, serializability, declaration, and native-key runtime coverage Phase 5/9 |
| `EconomyConfig`, `EconomyCurrencyConfig`, `EconomyFieldSpec`, `EconomyLogFn` | configuration pass-through | Shared declarations plus server setup callbacks | Transformer validation and setup callback coverage Phase 3/9 |

## Value/accessor API

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `Get` | first-class | Reader `get()` returns committed deep-read-only snapshot | Frozen revision cache Phase 4; pinned native same-set/client-server Studio gate |
| `Clone` | first-class | Reader `clone()` returns fresh mutable clone | Independence Phase 4; pinned native alias-isolation Studio gate |
| `Default` | first-class | Reader `default()` | Phase 4 plus pinned native client/server Studio gate |
| `Set` | first-class | Buffered writer `set`; client only through `ScribeLocalWriter` | Queue/snapshot Phase 5; pinned native local/authoritative Studio gate |
| `Update` | first-class | Buffered writer `update`, callback evaluated at flush | Ordered frozen-input Phase 5; pinned native latest-committed Studio gate |
| `Observe` | Rovy event | `@scribeEvent` plus observer/EventReader | Registry subscription Phase 6; pinned native one-subscription dual-publication gate |
| `Changed` | Rovy event | `ScribeValueChanged` | Coalescing/source Phase 6; pinned native server/local/replication Studio gate |
| `Increment` | first-class | Buffered numeric `increment` with economy metadata | Ordered batch Phase 5; pinned native tagged/command/transaction Studio gate |
| `Decrement` | first-class | Buffered numeric `decrement` with economy metadata | Transaction Phase 5; pinned native tagged sink Studio gate |
| `Min` | first-class | Number reader `min()` | Phase 4 plus pinned native client/server Studio gate |
| `Max` | first-class | Number reader `max()` | Phase 4 plus pinned native client/server Studio gate |
| `Toggle` | first-class | Buffered boolean `toggle()` | Phase 5 plus pinned native two-flush Studio gate |
| `Insert` | first-class | Buffered array `insert()` | Zero-based ordering Phase 5; pinned native ordered Studio gate |
| `Remove` | first-class | Buffered array/dictionary `remove()`; intentionally returns `void` | Zero-based container Phase 5; pinned native array/dictionary Studio gate |
| `RemoveValue` | first-class | Buffered array `removeValue()` | Phase 5 plus pinned native Studio gate |
| `Find` | first-class | Array reader `find()`; zero-based result | Phase 4 plus pinned native zero-based Studio gate |
| `Has` | first-class | Array reader `has()` | Phase 4 plus pinned native server/client Studio gate |
| `Count` | first-class | Array/dictionary reader `count()` | Phase 4 plus pinned native server/client Studio gate |
| `Clear` | first-class | Buffered array/dictionary `clear()` | Phase 5 plus pinned native bulk-clear gate; no fabricated per-entry events |
| `OnInsert` | Rovy event | `ScribeArrayInserted` | Exact value/index Phase 6; pinned native ordered Studio gate |
| `OnRemove` | Rovy event | `ScribeArrayRemoved` | Exact value/index Phase 6; pinned native remove/removeValue Studio gate |
| `OnKeyAdded` | Rovy event | `ScribeKeyAdded` | Exact key/value Phase 6; pinned native Studio gate |
| `OnKeyRemoved` | Rovy event | `ScribeKeyRemoved` | Exact key/value Phase 6; pinned native Studio gate |
| `SetTimed` | first-class | Buffered timed writer `setTimed()` | Phase 5 plus pinned native Studio gate |
| `ExtendTimed` | first-class | Buffered timed writer `extendTimed()` | Phase 5 plus pinned native Studio gate |
| `Active` | first-class | Timed reader `active()` returns named `{ active, remaining }` record | Phase 4 tuple normalization plus pinned native Studio gate |

## Server lifecycle, persistence, and command API

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `WaitForData` | Rovy event | Background lifecycle bridge plus ready/unavailable state/events | Phase 6 plus pinned native readiness/session-end Studio gate |
| `GetState` | first-class | `ScribeServerReader.state(player)` | Phase 4 plus pinned native Loading/Ready/SessionEnded Studio gate |
| `Get` | first-class | `get` returns optional; `require` supplies native error-style behavior | Phase 4 plus pinned native two-bundle Studio gate |
| player index access (`Data[player]`) | intentionally unsupported | Bracket access conflicts with injected service methods; use `get`/`require` | Negative type/runtime misuse test Phase 4 |
| `Batch` | first-class | Automatic ordinary-write batch segments per player at every Rovy flush | Phase 5 ordering/failure plus pinned native operation-order Studio gate |
| `Transaction` | first-class | `ScribeServerWriter.transaction` replays one native transaction | Phase 5 plus pinned native commit/rollback Studio gate |
| `Flush` | Rovy job | Renamed `ScribePersistence.saveNow` | Phase 8 jobs plus pinned native forced-save/event Studio gate |
| `GetSaveInfo` | first-class | `ScribePersistence.getSaveInfo` | Phase 8 normalization plus pinned native server/client Studio gate |
| `GetOffline` | Rovy job | `ScribePersistence.getOffline` | Phase 8 projection plus pinned native fake-ProfileStore Studio gate |
| `UpdateOffline` | Rovy job | `ScribePersistence.updateOffline` | Phase 8 transform/validation plus pinned native durable Studio gate |
| `ListVersions` | Rovy job | `ScribePersistence.listVersions` | Phase 8 normalization plus pinned native version-query Studio gate |
| `GetVersion` | Rovy job | `ScribePersistence.getVersion` | Phase 8 projection plus pinned native version-read Studio gate |
| `RestoreVersion` | Rovy job | `ScribePersistence.restoreVersion` | Phase 8 reason propagation plus pinned native restore Studio gate |
| `Erase` | Rovy job | `ScribePersistence.erase` | Phase 8 failure coverage plus pinned native erase Studio gate |
| `Export` | Rovy job | `ScribePersistence.export` | Phase 8 optional-result coverage plus pinned native JSON export Studio gate |
| `ProfileStore` | unsafe escape hatch | `ScribeUnsafe.profileStore` | Server-only runtime binding coverage Phase 8 |
| `Raw` | unsafe escape hatch | `ScribeUnsafe.server` | Boundary-native runtime binding coverage Phase 8 |
| `Command` | first-class | `@scribeCommand`, reader, responder, native handler bridge | Type, transformer, fake-runtime, and pinned native-dispatch coverage Phase 7 |

## Client API

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `IsReady` | first-class | `ScribeClientState.ready` | Phase 4 plus pinned native two-bundle readiness Studio gate |
| `WaitForData` | Rovy event | Ready state plus ready/unavailable event; no yielding system call | Phase 6 background ingress plus pinned native ready Studio gate |
| `Request` | first-class | Non-yielding `ScribeCommand.call` plus native request task | Phase 7 plus pinned default-transport sender/write/reply/ordering Studio gate |
| `GetLeaderboard` | first-class | `ScribeLeaderboards.get` cached read | Phase 9 normalization plus pinned native replicated-board Studio gate |
| `GetMyRank` | first-class | `ScribeLeaderboards.getMyRank` cached read | Phase 9 signatures plus pinned native client/server rank Studio gate |
| `OnLeaderboard` | Rovy event | `ScribeLeaderboardChanged` | Phase 6 deferral plus pinned native replicated event Studio gate |
| `GetServiceStatus` | first-class | `ScribeClientState.serviceStatus` / diagnostics | Phase 4 plus pinned native degrade/recover Studio gate |
| `OnServiceStatus` | Rovy event | `ScribeStatusChanged` | Phase 6 deferral plus pinned native degrade/recover Studio gate |
| `GetShared` | first-class | `ScribeSharedReader.get` with shared-only shape | Phase 4 plus pinned native default-transport SharedInit/Diff/Gone Studio gate |
| `OnSharedChanged` | Rovy event | `ScribeSharedChanged` | Phase 6 plus pinned native immutable init/diff/removal Studio gate |
| `Owns` | first-class | Non-authoritative mirror read in `ScribeOwnership` | Readiness-gated non-yielding client runtime coverage Phase 9 |
| `OwnsAsync` | Rovy job | `ScribeOwnership.ownsSynced`; ownership-synced wait never yields a system | Phase 9 plus pinned native replicated ownership Studio gate |
| `ObserveOwned` | Rovy event | `ScribeOwnershipChanged` carries the changed key and value; no native subscription leaks | Deferred ownership-signal runtime coverage Phase 6 |
| `OnOwnershipChanged` | Rovy event | `ScribeOwnershipChanged` | Phase 6 plus pinned native grant/revoke client/server Studio gate |
| `GetSaveInfo` | first-class | `ScribeClientState.saveInfo` | Phase 8 plus pinned native forced-save replication Studio gate |
| `GetGiftCredits` | first-class | Readiness-gated client `ScribeMonetization.getGiftCredits` read | Frozen non-yielding client runtime coverage Phase 9 |
| `GetPurchases` | first-class | Readiness-gated client monetization read, subject to native replication config | Filter translation and immutable record normalization coverage Phase 9 |
| `Mock` | first-class | `ScribeTestRuntime.seed` | Buffered snapshot/state translation and edit-mode guard coverage Phase 10 |
| `MockCommand` | first-class | `ScribeTestRuntime.mockCommand` | Typed wire round-trip, unknown-contract, and edit-mode guard coverage Phase 10 |
| `Raw` | unsafe escape hatch | `ScribeUnsafe.client` | Boundary-native runtime binding coverage Phase 8 |

## Leaderboards

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| server `GetLeaderboard` | first-class | Cached `ScribeLeaderboards.get`; native call does not issue a live OrderedDataStore read | Native-shape call/normalization runtime coverage Phase 9 |
| server `GetMyRank` | first-class | Cached `ScribeLeaderboards.getMyRank(name, player)` | Server argument-order runtime coverage Phase 9 |
| client `GetLeaderboard` | first-class | Cached `ScribeLeaderboards.get` | Native-shape call/normalization runtime coverage Phase 9 |
| client `GetMyRank` | first-class | Cached `ScribeLeaderboards.getMyRank(name)` | Client argument-order and cross-player guard coverage Phase 9 |
| client `OnLeaderboard` | Rovy event | `ScribeLeaderboardChanged` | Phase 6 plus pinned native replicated event Studio gate |
| `Leaderboards` | configuration pass-through | Typed declaration keyed by numeric schema paths | Type and transformer native-key coverage Phase 3/9 |
| `Stat` | configuration pass-through | Static numeric schema path | Type plus transformer numeric-leaf diagnostic coverage Phase 3 |
| `Limit` | configuration pass-through | `limit` | Transformer native-key coverage Phase 3 |
| `Scale` | configuration pass-through | `scale` | Transformer native-key coverage Phase 3 |
| `Replicate` | configuration pass-through | `replicate` | Transformer native-key coverage Phase 3 |
| `StoreName` | configuration pass-through | `storeName`; present upstream but omitted from the initial plan | Transformer native-key coverage Phase 3 |

## Monetization, gifting, ownership, and receipts

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `PromptGift` | Rovy job | `ScribeMonetization.promptGift`; native implementation waits for durable saves | Phase 9 plus pinned native credit-funded offline-delivery Studio gate |
| `GetGiftCredits` | first-class | `ScribeMonetization.getGiftCredits` | Frozen server/client and readiness-gated runtime coverage Phase 9 |
| `HandleReceipt` | Rovy job | `ScribeReceipts.handleReceipt`; native fail-closed decision remains authoritative and default Scribe ownership is untouched | Phase 9 plus pinned native known/unknown fail-closed Studio gate |
| `TryHandleReceipt` | Rovy job | `ScribeReceipts.tryHandleReceipt`; native 1.0.11 returns `nil` for unknown products | Unknown-product and immutable input runtime coverage Phase 9 |
| `Owns` | first-class | Cached ownership read; client remains non-authoritative | Client readiness gate and server signature runtime coverage Phase 9 |
| `OwnsAsync` | Rovy job | Server `ownsAuthoritative` / client `ownsSynced` | Boundary guards, job isolation, and server session cancellation coverage Phase 9 |
| `ObserveOwned` | Rovy event | `ScribeOwnershipChanged` | Deferred keyed payload bridge runtime Phase 6 |
| `OnOwnershipChanged` | Rovy event | `ScribeOwnershipChanged` | Phase 6 plus pinned native grant/revoke client/server Studio gate |
| `GrantPerk` | first-class | Buffered authoritative mutation | Per-player native `Batch`, order, and failure accounting runtime coverage Phase 9 |
| `RevokePerk` | first-class | Buffered authoritative mutation | Per-player native `Batch` runtime coverage Phase 9 |
| `Purchase` | Rovy job | Buffered native atomic purchase with result handle | Flush-gated native `Purchase`, typed grant facade, rollback reason, cancellation, and batch-failure coverage Phase 9 |
| `RecordPurchase` | first-class | Buffered purchase-log append | Immutable metadata snapshot and native-key translation coverage Phase 9 |
| `GetPurchases` | first-class | Immutable normalized purchase-log read | Server/client filter and Robux/InGame normalization runtime coverage Phase 9 |
| `OnGiftReceived` | Rovy event | `ScribeGiftReceived` | Phase 6 plus pinned native ProfileStore gift-delivery Studio gate |
| `OnGiftCredit` | Rovy event | `ScribeGiftCredit` | Phase 6 plus pinned native receipt-to-credit Studio gate |
| `Products` | configuration pass-through | Shared IDs/categories/grants plus server-only grant callbacks | Type, transformer, and setup callback adapter coverage Phase 3/9 |
| `Passes` | configuration pass-through | Pass declarations | Type and transformer coverage Phase 3/9 |
| `Perks` | configuration pass-through | Perk declarations | Type and transformer literal diagnostics Phase 3/9 |
| `OwnReceipts` | configuration pass-through | Native receipt ownership flag; default Scribe `ProcessReceipt` remains untouched | Type and transformer coverage Phase 3/9 |
| `PurchaseLog` | configuration pass-through | `ScribePurchaseLogConfig` | Type and transformer nested-key coverage Phase 3/9 |
| `GiftCooldown` | configuration pass-through | `gifting.cooldown` | Transformer top-level native-key coverage Phase 3 |
| `GiftMaxPending` | configuration pass-through | `gifting.maxPending` | Transformer top-level native-key coverage Phase 3 |
| `GiftIntentTTL` | configuration pass-through | `gifting.intentTtl` | Transformer top-level native-key coverage Phase 3 |
| `AllowDuplicateGifts` | configuration pass-through | `gifting.allowDuplicate` | Transformer top-level native-key coverage Phase 3 |
| `NoGiftIntentPolicy` | configuration pass-through | `gifting.noIntentPolicy` | Transformer enum/native-key coverage Phase 3 |

## Economy analytics

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| tagged `Increment` / `Decrement` | first-class | `ScribeEconomyMeta` on numeric writer operations | Phase 5 plus pinned native source/sink analytics callback Studio gate |
| `Economy.Resolve` | configuration pass-through | Server setup callback | Typed setup/native callback adapter coverage Phase 3 |
| `Economy.Prefix` | configuration pass-through | Shared economy declaration | Transformer native-key coverage Phase 3 |
| `Economy.Currencies` | configuration pass-through | Shared economy declaration keyed by numeric leaf name | Transformer numeric-leaf diagnostics and runtime metadata validation Phase 9 |
| currency `Label` | configuration pass-through | Currency declaration | Transformer native-key coverage Phase 3 |
| currency `Fields` | configuration pass-through | At most three declared custom field slots | Duplicate/limit transformer diagnostics and per-write declared-name validation Phase 9 |
| currency `Resolve` | configuration pass-through | Server setup callback | Typed setup/native callback adapter coverage Phase 3 |
| `LogEconomyEvent` | configuration pass-through | Server setup callback; native analytics remains authoritative | Typed setup/native callback adapter coverage Phase 3 |

## Timed fields and cooldowns

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `Timed` | first-class | `s.timed` | Type, transformer, and native declarator coverage Phase 3 |
| `SetTimed` | first-class | Buffered `ScribeTimedWriter.setTimed` | Phase 5 plus pinned native Studio gate |
| `ExtendTimed` | first-class | Buffered `ScribeTimedWriter.extendTimed` | Phase 5 plus pinned native Studio gate |
| `Active` | first-class | `ScribeTimedReader.active` | Phase 4 plus pinned native server/client Studio gate |
| `OnCooldown` | Rovy job | Buffered check-and-arm; result exists only after the native batch commits | Result, polling, cancellation, and batch-order runtime coverage Phase 9 |
| `PeekCooldown` | first-class | Committed `ScribeCooldowns.peek` | Native tuple normalization runtime coverage Phase 9 |
| `ClearCooldown` | first-class | Buffered `ScribeCooldowns.clear` | Native per-player batch runtime coverage Phase 9 |

## Messaging

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `SendMessage` | Rovy job | `ScribeMessaging.send`; native `MessageAsync` yields | Phase 8 plus pinned native online/offline ProfileStore Studio gate |
| `OnMessage` | Rovy event | `ScribeMessageReceived` | Phase 6 plus pinned native online message Studio gate |

## Signals and lifecycle callbacks

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `OnSave` | Rovy event | `ScribeSaveCompleted` | Phase 6 plus pinned native forced-save Studio gate |
| `SessionEnded` | Rovy event | `ScribeSessionEnded` | Phase 6 plus pinned native profile-end Studio gate |
| `OnAnomaly` | Rovy event | `ScribeAnomaly` | Phase 6 plus pinned native transaction-rejection Studio gate |
| `OnGiftReceived` | Rovy event | `ScribeGiftReceived` | Phase 6 plus pinned native gift-delivery Studio gate |
| `OnGiftCredit` | Rovy event | `ScribeGiftCredit` | Phase 6 plus pinned native receipt-to-credit Studio gate |
| `OnOwnershipChanged` | Rovy event | `ScribeOwnershipChanged` | Phase 6 plus pinned native client/server grant/revoke Studio gate |
| `OnMessage` | Rovy event | `ScribeMessageReceived` | Phase 6 plus pinned native ProfileStore message Studio gate |
| `OnLeaderboard` | Rovy event | `ScribeLeaderboardChanged` | Phase 6 plus pinned native replicated leaderboard Studio gate |
| `OnServiceStatus` | Rovy event | `ScribeStatusChanged` | Phase 6 plus pinned native degrade/recover Studio gate |
| `OnSharedChanged` | Rovy event | `ScribeSharedChanged` | Phase 6 plus pinned native default-transport init/diff/gone Studio gate |
| `Scribe.OnStatusChanged` | Rovy event | `ScribeStatusChanged` | Phase 6 plus pinned native server degrade/recover Studio gate |
| `Scribe.OnIssue` | Rovy event | `ScribeIssue` | Phase 6 plus pinned native normalized-log Studio gate |

## Testing and edit mode

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `UseMock` | configuration pass-through | `useMock` | Type and full native-key transformer coverage Phase 3/11 |
| `Mode` | configuration pass-through | `mode: "Live" | "Mock" | "NoSave"` | Type and transformer coverage Phase 3 |
| `TargetUserId` | configuration pass-through | `targetUserId` | Type and transformer coverage Phase 3 |
| `ViewedUserId` | configuration pass-through | `viewedUserId` | Type and full native-key transformer coverage Phase 3/11 |
| `OverriddenUserId` | configuration pass-through | `overriddenUserId` | Type and full native-key transformer coverage Phase 3/11 |
| `DontSave` | configuration pass-through | `dontSave` | Type and full native-key transformer coverage Phase 3/11 |
| `ResetData` | configuration pass-through | `resetData` | Type and full native-key transformer coverage Phase 3/11 |
| client `Mock` | first-class | `ScribeTestRuntime.seed` | Buffered committed-read stability, state translation, visibility validation, and edit-mode guard coverage Phase 10 |
| client `MockCommand` | first-class | `ScribeTestRuntime.mockCommand` | Request/result class validation and native mock round-trip coverage Phase 10 |

## Bundle options and setup callbacks

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `Template` | first-class | `scribeData.template` | Compile fixture, schema lowering, and native bundle coverage Phase 3/10/11 |
| `ProfileStoreIndex` | configuration pass-through | `profileStoreIndex` (required) | Required-literal transformer and native option coverage Phase 3 |
| `ProfileKeyPrefix` | configuration pass-through | `profileKeyPrefix` (required) | Required-literal transformer and native option coverage Phase 3 |
| `Transport` | configuration pass-through | Plugin `transport`; opaque buffer contract preserved | Same-object and unchanged-buffer runtime coverage Phase 10 |
| `TransportChannel` | configuration pass-through | `transportChannel`; derive from data ID when absent | Derived/explicit runtime coverage Phase 2/10 |
| `Migrations` | configuration pass-through | `configureScribeServer(...).migrations` | Typed replacement-to-native-mutation adapter coverage Phase 3 |
| `OnPlayerInit` | configuration pass-through | Dedicated synchronous `ScribeInitializationTree`; native callback still runs before Ready | Type and raw-table adapter coverage Phase 3 |
| `SaveInterval` | configuration pass-through | `saveInterval`; per-bundle native option | Compile fixture and native-key transformer coverage Phase 3/11 |
| `ProfileStore` option | unsafe escape hatch | Setup-only explicit ProfileStore binding; raw access remains unsafe | Typed setup and identity pass-through runtime coverage Phase 3 |
| `UseMock` | configuration pass-through | `useMock` | Type and full native-key transformer coverage Phase 3/11 |
| `ViewedUserId` | configuration pass-through | `viewedUserId` | Type and full native-key transformer coverage Phase 3/11 |
| `OverriddenUserId` | configuration pass-through | `overriddenUserId` | Type and full native-key transformer coverage Phase 3/11 |
| `DontSave` | configuration pass-through | `dontSave` | Type and full native-key transformer coverage Phase 3/11 |
| `ResetData` | configuration pass-through | `resetData` | Type and full native-key transformer coverage Phase 3/11 |
| `LoadFailurePolicy` | configuration pass-through | `loadFailurePolicy` | Enum validation/translation and native-key transformer coverage Phase 3/11 |
| `VersionAheadPolicy` | configuration pass-through | `versionAheadPolicy` | Enum validation/translation and native-key transformer coverage Phase 3/11 |
| `KickOnSessionEnd` | configuration pass-through | `kickOnSessionEnd` | Type and full native-key transformer coverage Phase 3/11 |
| `LoadFailureMessage` | configuration pass-through | `loadFailureMessage` | Type and full native-key transformer coverage Phase 3/11 |
| `SessionEndMessage` | configuration pass-through | `sessionEndMessage` | Type and full native-key transformer coverage Phase 3/11 |
| `CommandRateLimit` | configuration pass-through | `commandRateLimit` | Native-key transformer and native dispatcher coverage Phase 3/7/11 |
| `RequestTimeout` | configuration pass-through | `requestTimeout` | Native-key transformer and command timeout coverage Phase 3/7/11 |
| `MaxInboundBytes` | configuration pass-through | `maxInboundBytes` | Type and full native-key transformer coverage Phase 3/11 |
| `BoundsPolicy` | configuration pass-through | `boundsPolicy` | Enum validation/translation and native-key transformer coverage Phase 3/11 |
| `WipeGuardPolicy` | configuration pass-through | `wipeGuardPolicy` | Enum validation/translation and native-key transformer coverage Phase 3/11 |
| `WipeGuardShrinkRatio` | configuration pass-through | `wipeGuardShrinkRatio` | Type and full native-key transformer coverage Phase 3/11 |
| `LogLevel` | configuration pass-through | `logLevel` | Enum validation and native-key transformer coverage Phase 3/11 |
| `StatusThresholds` | configuration pass-through | `statusThresholds` | Nested-key transformer and diagnostic runtime coverage Phase 3/10/11 |
| `Banner` | configuration pass-through | `banner` | Type and full native-key transformer coverage Phase 3/11 |

## Studio and transport compatibility

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| Scribe Studio debug hook | configuration pass-through | Preserve the real module location and frozen native template metadata | Pinned two-boundary Roblox Studio integration Phase 10/final gate |
| custom `ScribeTransport` | configuration pass-through | Pass the same native transport object; never decode/re-encode buffers | Exact object and bidirectional buffer-identity runtime coverage Phase 10 |
| default native transport | configuration pass-through | Scribe remains transport owner | Pinned RemoteEvent replication/command/shared-frame Studio gate |

## Remaining parity gaps

The table has no unclassified member, type-only placeholder checkpoint, or
wrapper-native integration gap. The deterministic Studio gate runs the
unmodified pinned server and client bundles twice consecutively over Scribe's
default RemoteEvent transport. It uses Scribe's own deterministic ProfileStore
test implementation so persistence, version, messaging, receipt, gift, and
session behavior can be asserted without replacing the Scribe runtime.

Two environmental checks remain outside this repository: Roblox cloud
DataStore/ProfileStore availability in a published place, and the Marketplace
purchase-prompt UI. Those services remain wholly Scribe-owned. The pinned
default transport is verified to apply the authoritative diff before publishing
command completion. A custom transport inherits that ordering guarantee only if
it preserves Scribe frame order.

If the project chooses a Scribe commit other than the baseline, this inventory
must be regenerated from that exact source before runtime support is claimed.
