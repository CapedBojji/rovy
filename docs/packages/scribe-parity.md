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
and runs the wrapper bridge end to end. General jobs and feature services remain
incomplete; client diff-before-completion ordering remains deliberately
unpromised pending an end-to-end Roblox transport test.

Phase 8 added one post-write non-yielding job bridge, immutable polling and
completion results, player-session cancellation, persistence/offline/version/GDPR
services, native datatype projection for persisted snapshots, durable messaging,
readiness-gated client save state, and raw/ProfileStore unsafe handles. Native
full-bundle integration remains pending.

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

## Top-level Scribe module

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `Version` | first-class | `scribeVersion()` and binding version | Unit coverage Phase 2; pinned native Studio coverage Phase 10 |
| `new` | first-class | `scribeData` declaration plus plugin-owned bundle construction | Fake-binding Phase 2; pinned native client bundle Phase 10 |
| callable `Scribe(options)` | first-class | Same mapping as `new`; game code never constructs a second wrapper state | Fake-binding Phase 2; pinned native client bundle Phase 10 |
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
| `OnStatusChanged` | Rovy event | `ScribeStatusChanged` | Deferred signal/runtime coverage Phase 6; native integration pending |
| `OnIssue` | Rovy event | `ScribeIssue` | Deferred normalized-signal/runtime coverage Phase 6; native integration pending |
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
| `Get` | first-class | Reader `get()` returns committed deep-read-only snapshot | Frozen revision-cache runtime coverage Phase 4; native integration pending |
| `Clone` | first-class | Reader `clone()` returns fresh mutable clone | Independence runtime coverage Phase 4; native integration pending |
| `Default` | first-class | Reader `default()` | Runtime coverage Phase 4; native integration pending |
| `Set` | first-class | Buffered writer `set`; client only through `ScribeLocalWriter` | Queue/snapshot/runtime coverage Phase 5; native integration pending |
| `Update` | first-class | Buffered writer `update`, callback evaluated at flush | Ordered frozen-input runtime coverage Phase 5; native integration pending |
| `Observe` | Rovy event | `@scribeEvent` plus observer/EventReader | Registry-driven subscription/runtime coverage Phase 6; native integration pending |
| `Changed` | Rovy event | `ScribeValueChanged` | Coalescing/source/dual-publication runtime coverage Phase 6; native integration pending |
| `Increment` | first-class | Buffered numeric `increment` with economy metadata | Ordered batch/runtime coverage Phase 5; native integration pending |
| `Decrement` | first-class | Buffered numeric `decrement` with economy metadata | Transaction/runtime coverage Phase 5; native integration pending |
| `Min` | first-class | Number reader `min()` | Runtime coverage Phase 4; native integration pending |
| `Max` | first-class | Number reader `max()` | Runtime coverage Phase 4; native integration pending |
| `Toggle` | first-class | Buffered boolean `toggle()` | Runtime coverage Phase 5; native integration pending |
| `Insert` | first-class | Buffered array `insert()` | Zero-based ordered runtime coverage Phase 5; native integration pending |
| `Remove` | first-class | Buffered array/dictionary `remove()`; intentionally returns `void` | Zero-based/container runtime coverage Phase 5; native integration pending |
| `RemoveValue` | first-class | Buffered array `removeValue()` | Runtime coverage Phase 5; native integration pending |
| `Find` | first-class | Array reader `find()`; zero-based result | Structural-value runtime coverage Phase 4; native integration pending |
| `Has` | first-class | Array reader `has()` | Runtime coverage Phase 4; native integration pending |
| `Count` | first-class | Array/dictionary reader `count()` | Runtime coverage Phase 4; native integration pending |
| `Clear` | first-class | Buffered array/dictionary `clear()` | Runtime coverage Phase 5; native integration pending |
| `OnInsert` | Rovy event | `ScribeArrayInserted` | Exact value/zero-based index runtime coverage Phase 6; native integration pending |
| `OnRemove` | Rovy event | `ScribeArrayRemoved` | Exact value/zero-based index runtime coverage Phase 6; native integration pending |
| `OnKeyAdded` | Rovy event | `ScribeKeyAdded` | Exact key/value runtime coverage Phase 6; native integration pending |
| `OnKeyRemoved` | Rovy event | `ScribeKeyRemoved` | Exact key/value runtime coverage Phase 6; native integration pending |
| `SetTimed` | first-class | Buffered timed writer `setTimed()` | Runtime coverage Phase 5; native integration pending |
| `ExtendTimed` | first-class | Buffered timed writer `extendTimed()` | Runtime coverage Phase 5; native integration pending |
| `Active` | first-class | Timed reader `active()` returns named `{ active, remaining }` record | Tuple-to-record runtime coverage Phase 4; native integration pending |

## Server lifecycle, persistence, and command API

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `WaitForData` | Rovy event | Background lifecycle bridge plus ready/unavailable state/events | Non-yielding system bridge/runtime coverage Phase 6; native integration pending |
| `GetState` | first-class | `ScribeServerReader.state(player)` | Non-yielding runtime coverage Phase 4; native integration pending |
| `Get` | first-class | `get` returns optional; `require` supplies native error-style behavior | Loading/ready/session-ended runtime coverage Phase 4; native integration pending |
| player index access (`Data[player]`) | intentionally unsupported | Bracket access conflicts with injected service methods; use `get`/`require` | Negative type/runtime misuse test Phase 4 |
| `Batch` | first-class | Automatic ordinary-write batch segments per player at every Rovy flush | Ordering/failure runtime coverage Phase 5; native integration pending |
| `Transaction` | first-class | `ScribeServerWriter.transaction` replays one native transaction | Position/rollback/failure runtime coverage Phase 5; native integration pending |
| `Flush` | Rovy job | Renamed `ScribePersistence.saveNow` | Post-write task, polling, completion-event, failure, and cancellation coverage Phase 8; native integration pending |
| `GetSaveInfo` | first-class | `ScribePersistence.getSaveInfo` | Normalized frozen runtime coverage Phase 8; native integration pending |
| `GetOffline` | Rovy job | `ScribePersistence.getOffline` | Persisted-root projection/private-root exclusion runtime coverage Phase 8; native integration pending |
| `UpdateOffline` | Rovy job | `ScribePersistence.updateOffline` | Frozen non-yielding transform, schema validation, private-metadata preservation, and active-session failure coverage Phase 8 |
| `ListVersions` | Rovy job | `ScribePersistence.listVersions` | Pascal-to-camel normalization runtime coverage Phase 8; native integration pending |
| `GetVersion` | Rovy job | `ScribePersistence.getVersion` | Typed persisted projection runtime coverage Phase 8; native integration pending |
| `RestoreVersion` | Rovy job | `ScribePersistence.restoreVersion` | Native reason propagation runtime coverage Phase 8; native integration pending |
| `Erase` | Rovy job | `ScribePersistence.erase` | Native active-session failure propagation runtime coverage Phase 8; native integration pending |
| `Export` | Rovy job | `ScribePersistence.export` | Optional string job runtime coverage Phase 8; native integration pending |
| `ProfileStore` | unsafe escape hatch | `ScribeUnsafe.profileStore` | Server-only runtime binding coverage Phase 8 |
| `Raw` | unsafe escape hatch | `ScribeUnsafe.server` | Boundary-native runtime binding coverage Phase 8 |
| `Command` | first-class | `@scribeCommand`, reader, responder, native handler bridge | Type, transformer, fake-runtime, and pinned native-dispatch coverage Phase 7 |

## Client API

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `IsReady` | first-class | `ScribeClientState.ready` | Flush-stable runtime coverage Phase 4; native integration pending |
| `WaitForData` | Rovy event | Ready state plus ready/unavailable event; no yielding system call | Background task/ingress runtime coverage Phase 6; native integration pending |
| `Request` | first-class | Non-yielding `ScribeCommand.call` plus native request task | Stable-handle, polling, rejection, and completion-event runtime coverage Phase 7; Roblox frame-order test pending |
| `GetLeaderboard` | first-class | `ScribeLeaderboards.get` cached read | Frozen normalization and client/server native-signature runtime coverage Phase 9; native integration pending |
| `GetMyRank` | first-class | `ScribeLeaderboards.getMyRank` cached read | Client/server native-signature runtime coverage Phase 9; native integration pending |
| `OnLeaderboard` | Rovy event | `ScribeLeaderboardChanged` | Deferred normalized-snapshot runtime coverage Phase 6; native integration pending |
| `GetServiceStatus` | first-class | `ScribeClientState.serviceStatus` / diagnostics | Flush-stable runtime coverage Phase 4; native integration pending |
| `OnServiceStatus` | Rovy event | `ScribeStatusChanged` | Deferred signal/runtime coverage Phase 6; native integration pending |
| `GetShared` | first-class | `ScribeSharedReader.get` with shared-only shape | Deep-freeze and visibility-filter runtime coverage Phase 4; native integration pending |
| `OnSharedChanged` | Rovy event | `ScribeSharedChanged` | Frozen clone/removal runtime coverage Phase 6; native integration pending |
| `Owns` | first-class | Non-authoritative mirror read in `ScribeOwnership` | Readiness-gated non-yielding client runtime coverage Phase 9 |
| `OwnsAsync` | Rovy job | `ScribeOwnership.ownsSynced`; ownership-synced wait never yields a system | Client job/runtime coverage Phase 9; native integration pending |
| `ObserveOwned` | Rovy event | `ScribeOwnershipChanged` carries the changed key and value; no native subscription leaks | Deferred ownership-signal runtime coverage Phase 6 |
| `OnOwnershipChanged` | Rovy event | `ScribeOwnershipChanged` | Client/server signal runtime coverage Phase 6; native integration pending |
| `GetSaveInfo` | first-class | `ScribeClientState.saveInfo` | Readiness-gated flush-stable runtime coverage Phase 8; native integration pending |
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
| client `OnLeaderboard` | Rovy event | `ScribeLeaderboardChanged` | Deferred normalized-snapshot runtime coverage Phase 6; native integration pending |
| `Leaderboards` | configuration pass-through | Typed declaration keyed by numeric schema paths | Type and transformer native-key coverage Phase 3/9 |
| `Stat` | configuration pass-through | Static numeric schema path | Type plus transformer numeric-leaf diagnostic coverage Phase 3 |
| `Limit` | configuration pass-through | `limit` | Transformer native-key coverage Phase 3 |
| `Scale` | configuration pass-through | `scale` | Transformer native-key coverage Phase 3 |
| `Replicate` | configuration pass-through | `replicate` | Transformer native-key coverage Phase 3 |
| `StoreName` | configuration pass-through | `storeName`; present upstream but omitted from the initial plan | Transformer native-key coverage Phase 3 |

## Monetization, gifting, ownership, and receipts

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `PromptGift` | Rovy job | `ScribeMonetization.promptGift`; native implementation waits for durable saves | Argument snapshot, native reason, polling, and completion runtime coverage Phase 9 |
| `GetGiftCredits` | first-class | `ScribeMonetization.getGiftCredits` | Frozen server/client and readiness-gated runtime coverage Phase 9 |
| `HandleReceipt` | Rovy job | `ScribeReceipts.handleReceipt`; native fail-closed decision remains authoritative and default Scribe ownership is untouched | Immutable input and yielding job runtime coverage Phase 9; native integration pending |
| `TryHandleReceipt` | Rovy job | `ScribeReceipts.tryHandleReceipt`; native 1.0.11 returns `nil` for unknown products | Unknown-product and immutable input runtime coverage Phase 9 |
| `Owns` | first-class | Cached ownership read; client remains non-authoritative | Client readiness gate and server signature runtime coverage Phase 9 |
| `OwnsAsync` | Rovy job | Server `ownsAuthoritative` / client `ownsSynced` | Boundary guards, job isolation, and server session cancellation coverage Phase 9 |
| `ObserveOwned` | Rovy event | `ScribeOwnershipChanged` | Deferred keyed payload bridge runtime Phase 6 |
| `OnOwnershipChanged` | Rovy event | `ScribeOwnershipChanged` | Client/server signal runtime coverage Phase 6; native integration pending |
| `GrantPerk` | first-class | Buffered authoritative mutation | Per-player native `Batch`, order, and failure accounting runtime coverage Phase 9 |
| `RevokePerk` | first-class | Buffered authoritative mutation | Per-player native `Batch` runtime coverage Phase 9 |
| `Purchase` | Rovy job | Buffered native atomic purchase with result handle | Flush-gated native `Purchase`, typed grant facade, rollback reason, cancellation, and batch-failure coverage Phase 9 |
| `RecordPurchase` | first-class | Buffered purchase-log append | Immutable metadata snapshot and native-key translation coverage Phase 9 |
| `GetPurchases` | first-class | Immutable normalized purchase-log read | Server/client filter and Robux/InGame normalization runtime coverage Phase 9 |
| `OnGiftReceived` | Rovy event | `ScribeGiftReceived` | Deferred signal/runtime coverage Phase 6; native integration pending |
| `OnGiftCredit` | Rovy event | `ScribeGiftCredit` | Deferred signal/runtime coverage Phase 6; native integration pending |
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
| tagged `Increment` / `Decrement` | first-class | `ScribeEconomyMeta` on numeric writer operations | Native-key translation/runtime coverage Phase 5; native integration pending |
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
| `SetTimed` | first-class | Buffered `ScribeTimedWriter.setTimed` | Runtime coverage Phase 5; native integration pending |
| `ExtendTimed` | first-class | Buffered `ScribeTimedWriter.extendTimed` | Runtime coverage Phase 5; native integration pending |
| `Active` | first-class | `ScribeTimedReader.active` | Tuple-to-record and flush-stable runtime coverage Phase 4 |
| `OnCooldown` | Rovy job | Buffered check-and-arm; result exists only after the native batch commits | Result, polling, cancellation, and batch-order runtime coverage Phase 9 |
| `PeekCooldown` | first-class | Committed `ScribeCooldowns.peek` | Native tuple normalization runtime coverage Phase 9 |
| `ClearCooldown` | first-class | Buffered `ScribeCooldowns.clear` | Native per-player batch runtime coverage Phase 9 |

## Messaging

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `SendMessage` | Rovy job | `ScribeMessaging.send`; native `MessageAsync` yields | Deferred task, immutable payload, polling, and failure runtime coverage Phase 8; native integration pending |
| `OnMessage` | Rovy event | `ScribeMessageReceived` | Frozen payload/deferred signal runtime coverage Phase 6; native integration pending |

## Signals and lifecycle callbacks

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `OnSave` | Rovy event | `ScribeSaveCompleted` | Payload/save-info runtime coverage Phase 6; native integration pending |
| `SessionEnded` | Rovy event | `ScribeSessionEnded` | Cleanup/reason runtime coverage Phase 6; native integration pending |
| `OnAnomaly` | Rovy event | `ScribeAnomaly` | Native and wrapper-write failure ingress Phase 6; native integration pending |
| `OnGiftReceived` | Rovy event | `ScribeGiftReceived` | Runtime coverage Phase 6; native integration pending |
| `OnGiftCredit` | Rovy event | `ScribeGiftCredit` | Runtime coverage Phase 6; native integration pending |
| `OnOwnershipChanged` | Rovy event | `ScribeOwnershipChanged` | Client/server runtime coverage Phase 6; native integration pending |
| `OnMessage` | Rovy event | `ScribeMessageReceived` | Frozen-payload runtime coverage Phase 6; native integration pending |
| `OnLeaderboard` | Rovy event | `ScribeLeaderboardChanged` | Normalized-snapshot runtime coverage Phase 6; native integration pending |
| `OnServiceStatus` | Rovy event | `ScribeStatusChanged` | Client runtime coverage Phase 6; native integration pending |
| `OnSharedChanged` | Rovy event | `ScribeSharedChanged` | Frozen-clone runtime coverage Phase 6; native integration pending |
| `Scribe.OnStatusChanged` | Rovy event | `ScribeStatusChanged` | Server runtime coverage Phase 6; native integration pending |
| `Scribe.OnIssue` | Rovy event | `ScribeIssue` | Normalized-log runtime coverage Phase 6; native integration pending |

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
| Scribe Studio debug hook | configuration pass-through | Preserve the real module location and frozen native template metadata | Pinned full client-bundle Roblox Studio integration Phase 10 |
| custom `ScribeTransport` | configuration pass-through | Pass the same native transport object; never decode/re-encode buffers | Exact object and bidirectional buffer-identity runtime coverage Phase 10 |
| default native transport | configuration pass-through | Scribe remains transport owner | Pinned command dispatcher Phase 7; no alternate Rovy codec |

## Remaining parity gaps

The table has no unclassified member and no type-only placeholder checkpoint.
Rows whose coverage checkpoint says “native integration pending” remain
integration gaps. The verified gates cover every wrapper runtime branch through
deterministic native-shaped bindings, the unmodified native command dispatcher,
and one full native client bundle in Studio. Live DataStore/ProfileStore service
calls and cross-frame command/diff arrival order still require a published-place
integration environment and remain pending where the table says so. The wrapper
therefore does not promise client diff-before-completion ordering.

If the project chooses a Scribe commit other than the baseline, this inventory
must be regenerated from that exact source before runtime support is claimed.
