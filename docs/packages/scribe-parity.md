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

## Top-level Scribe module

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `Version` | first-class | `scribeVersion()` and binding version | Binding/runtime unit coverage Phase 2; native integration pending |
| `new` | first-class | `scribeData` declaration plus plugin-owned bundle construction | Fake-binding runtime coverage Phase 2; native integration pending |
| callable `Scribe(options)` | first-class | Same mapping as `new`; game code never constructs a second wrapper state | Fake-binding runtime coverage Phase 2; native integration pending |
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
| `Datatypes.IsSupported` | unsafe escape hatch | `ScribeUnsafe.datatypes`; migration/tooling only | Type declared; runtime Phase 10 |
| `Datatypes.Pack` | unsafe escape hatch | `ScribeUnsafe.datatypes.pack` | Type declared; runtime Phase 10 |
| `Datatypes.Unpack` | unsafe escape hatch | `ScribeUnsafe.datatypes.unpack` | Type declared; runtime Phase 10 |
| `Datatypes.NONFINITE` | intentionally unsupported | Internal validation prefix, not a documented game API; exposing it would couple Rovy to an implementation detail | Negative public-surface type test required in Phase 10 |
| `Reason` | first-class | Typed `ScribeReasonConstants` from the native module | Binding type coverage Phase 3; runtime export Phase 8 |
| `Configure` | configuration pass-through | `ScribePlugin.configure`, exactly once before bundle construction | Binding and conflict unit coverage Phase 3 |
| `GetStatus` | first-class | `ScribeDiagnostics.status` | Binding proxy/unit coverage Phase 2; signal/native coverage pending |
| `OnStatusChanged` | Rovy event | `ScribeStatusChanged` | Event type declared; runtime Phase 10 |
| `OnIssue` | Rovy event | `ScribeIssue` | Event type declared; runtime Phase 10 |
| `AddLogSink` | first-class | `ScribeDiagnostics.addSink`, installed during setup | Binding proxy/unit coverage Phase 2; native coverage pending |
| `GetRecentLogs` | first-class | `ScribeDiagnostics.recentLogs` | Binding proxy/unit coverage Phase 2; native coverage pending |
| `GetMetrics` | first-class | `ScribeDiagnostics.metrics` | Binding proxy/unit coverage Phase 2; native coverage pending |

## Exported Scribe contract types

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `ScribeTransport` | configuration pass-through | `ScribeTransport` preserves opaque buffers and sender identity | Type declared |
| `Op` / wire operations | intentionally unsupported | Scribe owns its wire protocol; Rovy must not decode/re-encode native operations | Runtime protocol-isolation test Phase 10 |
| `LogEntry`, `LogLevel`, `LogCategory`, `Status` | first-class | Lower-camel immutable diagnostic records and literal unions | Type declared |
| `LogCode` | first-class | Preserved as a stable string until the selected Scribe range is frozen | Type declared; literal snapshot Phase 10 |
| `SaveInfo` | first-class | `ScribeSaveInfo` | Type declared |
| `LeaderboardEntry` | first-class | `ScribeLeaderboardEntry` | Type declared |
| `LeaderboardConfig` | configuration pass-through | `ScribeLeaderboardConfig` with numeric-path validation | Type declared |
| `ProductConfig`, `PassConfig` | configuration pass-through | Shared declarations plus server-only grant setup | Type declared |
| `PurchaseSpec`, `PurchaseFilter` | first-class | `ScribePurchaseSpec`, `ScribePurchaseFilter` | Type declared |
| `EconomyMeta` | first-class | `ScribeEconomyMeta` on numeric writes | Type declared |
| `EconomyConfig`, `EconomyCurrencyConfig`, `EconomyFieldSpec`, `EconomyLogFn` | configuration pass-through | Shared declarations plus server setup callbacks | Type declared |

## Value/accessor API

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `Get` | first-class | Reader `get()` returns committed deep-read-only snapshot | Fixture |
| `Clone` | first-class | Reader `clone()` returns fresh mutable clone | Fixture |
| `Default` | first-class | Reader `default()` | Fixture |
| `Set` | first-class | Buffered writer `set`; client only through `ScribeLocalWriter` | Negative reader test; writer fixture |
| `Update` | first-class | Buffered writer `update`, callback evaluated at flush | Type declared; runtime Phase 5 |
| `Observe` | Rovy event | `@scribeEvent` plus observer/EventReader | Negative direct-signal type test |
| `Changed` | Rovy event | `ScribeValueChanged` | Event fixture; negative direct-signal test |
| `Increment` | first-class | Buffered numeric `increment` with economy metadata | Fixture |
| `Decrement` | first-class | Buffered numeric `decrement` with economy metadata | Transaction fixture |
| `Min` | first-class | Number reader `min()` | Fixture |
| `Max` | first-class | Number reader `max()` | Fixture |
| `Toggle` | first-class | Buffered boolean `toggle()` | Type declared |
| `Insert` | first-class | Buffered array `insert()` | Type declared |
| `Remove` | first-class | Buffered array/dictionary `remove()`; intentionally returns `void` | Type declared |
| `RemoveValue` | first-class | Buffered array `removeValue()` | Type declared |
| `Find` | first-class | Array reader `find()` | Type declared |
| `Has` | first-class | Array reader `has()` | Type declared |
| `Count` | first-class | Array/dictionary reader `count()` | Fixture |
| `OnInsert` | Rovy event | `ScribeArrayInserted` | Event type declared |
| `OnRemove` | Rovy event | `ScribeArrayRemoved` | Event type declared |
| `OnKeyAdded` | Rovy event | `ScribeKeyAdded` | Event fixture |
| `OnKeyRemoved` | Rovy event | `ScribeKeyRemoved` | Event fixture |
| `SetTimed` | first-class | Buffered timed writer `setTimed()` | Type declared |
| `ExtendTimed` | first-class | Buffered timed writer `extendTimed()` | Type declared |
| `Active` | first-class | Timed reader `active()` returns named `{ active, remaining }` record | Fixture; tuple-to-record difference documented |

## Server lifecycle, persistence, and command API

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `WaitForData` | Rovy event | Background lifecycle bridge plus ready/unavailable state/events | Event type declared; runtime Phase 8 |
| `GetState` | first-class | `ScribeServerReader.state(player)` | Type declared |
| `Get` | first-class | `get` returns optional; `require` supplies native error-style behavior | Server fixture |
| player index access (`Data[player]`) | intentionally unsupported | Bracket access conflicts with injected service methods; use `get`/`require` | Negative type/runtime misuse test Phase 4 |
| `Batch` | first-class | Automatic ordinary-write batch per player at every Rovy flush | Runtime Phase 5 |
| `Transaction` | first-class | `ScribeServerWriter.transaction` replays one native transaction | Fixture |
| `Flush` | Rovy job | Renamed `ScribePersistence.saveNow` | Fixture |
| `GetSaveInfo` | first-class | `ScribePersistence.getSaveInfo` | Type declared |
| `GetOffline` | Rovy job | `ScribePersistence.getOffline` | Type declared |
| `UpdateOffline` | Rovy job | `ScribePersistence.updateOffline` | Type declared; callback execution semantics need Phase 8 test |
| `ListVersions` | Rovy job | `ScribePersistence.listVersions` | Type declared |
| `GetVersion` | Rovy job | `ScribePersistence.getVersion` | Type declared |
| `RestoreVersion` | Rovy job | `ScribePersistence.restoreVersion` | Type declared |
| `Erase` | Rovy job | `ScribePersistence.erase` | Type declared |
| `Export` | Rovy job | `ScribePersistence.export` | Type declared |
| `ProfileStore` | unsafe escape hatch | `ScribeUnsafe.profileStore` | Type declared; runtime Phase 8 |
| `Raw` | unsafe escape hatch | `ScribeUnsafe.server` | Type declared; runtime Phase 8 |
| `Command` | first-class | `@scribeCommand`, reader, responder, native handler bridge | Type fixture; runtime Phase 7 |

## Client API

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `IsReady` | first-class | `ScribeClientState.ready` | Fixture |
| `WaitForData` | Rovy event | Ready state plus ready/unavailable event; no yielding system call | Event/state fixture |
| `Request` | first-class | Non-yielding `ScribeCommand.call` plus native request task | Type fixture; runtime Phase 7 |
| `GetLeaderboard` | first-class | `ScribeLeaderboards.get` cached read | Type declared |
| `GetMyRank` | first-class | `ScribeLeaderboards.getMyRank` cached read | Type declared |
| `OnLeaderboard` | Rovy event | `ScribeLeaderboardChanged` | Event type declared |
| `GetServiceStatus` | first-class | `ScribeClientState.serviceStatus` / diagnostics | Fixture |
| `OnServiceStatus` | Rovy event | `ScribeStatusChanged` | Event type declared |
| `GetShared` | first-class | `ScribeSharedReader.get` with shared-only shape | Fixture |
| `OnSharedChanged` | Rovy event | `ScribeSharedChanged` | Event type declared |
| `Owns` | first-class | Non-authoritative mirror read in `ScribeOwnership` | Type declared |
| `OwnsAsync` | Rovy job | Ownership-synced wait represented by a handle/state, never a system yield | Type declared |
| `ObserveOwned` | Rovy event | `ScribeOwnershipChanged` | Event type declared |
| `OnOwnershipChanged` | Rovy event | `ScribeOwnershipChanged` | Event type declared |
| `GetSaveInfo` | first-class | Client save-state read | Type declared |
| `GetGiftCredits` | first-class | Client monetization read | Type declared |
| `GetPurchases` | first-class | Client monetization read, subject to native replication config | Type declared |
| `Mock` | first-class | `ScribeTestRuntime.seed` | Type declared |
| `MockCommand` | first-class | `ScribeTestRuntime.mockCommand` | Type declared |
| `Raw` | unsafe escape hatch | `ScribeUnsafe.client` | Type declared |

## Leaderboards

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| server `GetLeaderboard` | first-class | Cached `ScribeLeaderboards.get`; native call does not issue a live OrderedDataStore read | Type declared |
| server `GetMyRank` | first-class | Cached `ScribeLeaderboards.getMyRank(name, player)` | Type declared |
| client `GetLeaderboard` | first-class | Cached `ScribeLeaderboards.get` | Type declared |
| client `GetMyRank` | first-class | Cached `ScribeLeaderboards.getMyRank(name)` | Type declared |
| client `OnLeaderboard` | Rovy event | `ScribeLeaderboardChanged` | Event type declared |
| `Leaderboards` | configuration pass-through | Typed declaration keyed by numeric schema paths | Type declared |
| `Stat` | configuration pass-through | Static numeric schema path | Type declared |
| `Limit` | configuration pass-through | `limit` | Type declared |
| `Scale` | configuration pass-through | `scale` | Type declared |
| `Replicate` | configuration pass-through | `replicate` | Type declared |
| `StoreName` | configuration pass-through | `storeName`; present upstream but omitted from the initial plan | Type declared |

## Monetization, gifting, ownership, and receipts

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `PromptGift` | Rovy job | `ScribeMonetization.promptGift`; native implementation waits for durable saves | Type declared |
| `GetGiftCredits` | first-class | `ScribeMonetization.getGiftCredits` | Type declared |
| `HandleReceipt` | Rovy job | Receipt service/setup bridge; must run outside scheduled systems and preserve fail-closed result | Type declared; setup contract unresolved |
| `TryHandleReceipt` | Rovy job | `ScribeReceipts.tryHandleReceipt`; native 1.0.11 returns `nil` for unknown products | Type coverage Phase 3; runtime Phase 9 |
| `Owns` | first-class | Cached ownership read; client remains non-authoritative | Type declared |
| `OwnsAsync` | Rovy job | Server authoritative ownership check / client synced wait | Type declared |
| `ObserveOwned` | Rovy event | `ScribeOwnershipChanged` | Event type declared |
| `OnOwnershipChanged` | Rovy event | `ScribeOwnershipChanged` | Event type declared |
| `GrantPerk` | first-class | Buffered authoritative mutation | Type declared |
| `RevokePerk` | first-class | Buffered authoritative mutation | Type declared |
| `Purchase` | Rovy job | Buffered atomic purchase with result handle | Type declared |
| `RecordPurchase` | first-class | Buffered purchase-log append | Type declared |
| `GetPurchases` | first-class | Immutable purchase-log read | Type declared |
| `OnGiftReceived` | Rovy event | `ScribeGiftReceived` | Event type declared |
| `OnGiftCredit` | Rovy event | `ScribeGiftCredit` | Event type declared |
| `Products` | configuration pass-through | Shared IDs/categories/grants plus server-only grant callbacks | Type declared |
| `Passes` | configuration pass-through | Pass declarations | Type declared |
| `Perks` | configuration pass-through | Perk declarations | Type declared |
| `OwnReceipts` | configuration pass-through | Receipt ownership setup; multi-bundle conflicts fail startup | Type declared |
| `PurchaseLog` | configuration pass-through | `ScribePurchaseLogConfig` | Type declared |
| `GiftCooldown` | configuration pass-through | `gifting.cooldown` | Type declared |
| `GiftMaxPending` | configuration pass-through | `gifting.maxPending` | Type declared |
| `GiftIntentTTL` | configuration pass-through | `gifting.intentTtl` | Type declared |
| `AllowDuplicateGifts` | configuration pass-through | `gifting.allowDuplicate` | Type declared |
| `NoGiftIntentPolicy` | configuration pass-through | `gifting.noIntentPolicy` | Type declared |

## Economy analytics

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| tagged `Increment` / `Decrement` | first-class | `ScribeEconomyMeta` on numeric writer operations | Fixture |
| `Economy.Resolve` | configuration pass-through | Server setup callback | Type declared |
| `Economy.Prefix` | configuration pass-through | Shared economy declaration | Type declared |
| `Economy.Currencies` | configuration pass-through | Shared economy declaration | Type declared |
| currency `Label` | configuration pass-through | Currency declaration | Type declared |
| currency `Fields` | configuration pass-through | Declared custom field slots | Type declared |
| currency `Resolve` | configuration pass-through | Server setup callback | Type declared |
| `LogEconomyEvent` | configuration pass-through | Server setup callback; native analytics remains authoritative | Type declared |

## Timed fields and cooldowns

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `Timed` | first-class | `s.timed` | Fixture |
| `SetTimed` | first-class | Buffered `ScribeTimedWriter.setTimed` | Type declared |
| `ExtendTimed` | first-class | Buffered `ScribeTimedWriter.extendTimed` | Type declared |
| `Active` | first-class | `ScribeTimedReader.active` | Fixture |
| `OnCooldown` | Rovy job | Buffered check-and-arm; result exists only after flush | Type declared |
| `PeekCooldown` | first-class | Committed `ScribeCooldowns.peek` | Type declared |
| `ClearCooldown` | first-class | Buffered `ScribeCooldowns.clear` | Type declared |

## Messaging

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `SendMessage` | Rovy job | `ScribeMessaging.send`; native `MessageAsync` yields | Type declared |
| `OnMessage` | Rovy event | `ScribeMessageReceived` | Event type declared |

## Signals and lifecycle callbacks

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `OnSave` | Rovy event | `ScribeSaveCompleted` | Event type declared |
| `SessionEnded` | Rovy event | `ScribeSessionEnded` | Event type declared |
| `OnAnomaly` | Rovy event | `ScribeAnomaly` | Event type declared |
| `OnGiftReceived` | Rovy event | `ScribeGiftReceived` | Event type declared |
| `OnGiftCredit` | Rovy event | `ScribeGiftCredit` | Event type declared |
| `OnOwnershipChanged` | Rovy event | `ScribeOwnershipChanged` | Event type declared |
| `OnMessage` | Rovy event | `ScribeMessageReceived` | Event type declared |
| `OnLeaderboard` | Rovy event | `ScribeLeaderboardChanged` | Event type declared |
| `OnServiceStatus` | Rovy event | `ScribeStatusChanged` | Event type declared |
| `OnSharedChanged` | Rovy event | `ScribeSharedChanged` | Event type declared |
| `Scribe.OnStatusChanged` | Rovy event | `ScribeStatusChanged` | Event type declared |
| `Scribe.OnIssue` | Rovy event | `ScribeIssue` | Event type declared |

## Testing and edit mode

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `UseMock` | configuration pass-through | `useMock` | Type declared |
| `Mode` | configuration pass-through | `mode: "Live" | "Mock" | "NoSave"` | Type and transformer coverage Phase 3 |
| `TargetUserId` | configuration pass-through | `targetUserId` | Type and transformer coverage Phase 3 |
| `ViewedUserId` | configuration pass-through | `viewedUserId` | Type declared |
| `OverriddenUserId` | configuration pass-through | `overriddenUserId` | Type declared |
| `DontSave` | configuration pass-through | `dontSave` | Type declared |
| `ResetData` | configuration pass-through | `resetData` | Type declared |
| client `Mock` | first-class | `ScribeTestRuntime.seed` | Type declared |
| client `MockCommand` | first-class | `ScribeTestRuntime.mockCommand` | Type declared |

## Bundle options and setup callbacks

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| `Template` | first-class | `scribeData.template` | Fixture |
| `ProfileStoreIndex` | configuration pass-through | `profileStoreIndex` (required) | Fixture |
| `ProfileKeyPrefix` | configuration pass-through | `profileKeyPrefix` (required) | Fixture |
| `Transport` | configuration pass-through | Plugin `transport`; opaque buffer contract preserved | Type declared |
| `TransportChannel` | configuration pass-through | `transportChannel`; derive from data ID when absent | Type declared |
| `Migrations` | configuration pass-through | `configureScribeServer(...).migrations` | Typed replacement-to-native-mutation adapter coverage Phase 3 |
| `OnPlayerInit` | configuration pass-through | Dedicated synchronous `ScribeInitializationTree`; native callback still runs before Ready | Type and raw-table adapter coverage Phase 3 |
| `SaveInterval` | configuration pass-through | `saveInterval`; process-global conflict detection required | Fixture |
| `ProfileStore` option | unsafe escape hatch | Setup-only explicit ProfileStore binding; raw access remains unsafe | Type declared |
| `UseMock` | configuration pass-through | `useMock` | Type declared |
| `ViewedUserId` | configuration pass-through | `viewedUserId` | Type declared |
| `OverriddenUserId` | configuration pass-through | `overriddenUserId` | Type declared |
| `DontSave` | configuration pass-through | `dontSave` | Type declared |
| `ResetData` | configuration pass-through | `resetData` | Type declared |
| `LoadFailurePolicy` | configuration pass-through | `loadFailurePolicy` | Type declared |
| `VersionAheadPolicy` | configuration pass-through | `versionAheadPolicy` | Type declared |
| `KickOnSessionEnd` | configuration pass-through | `kickOnSessionEnd` | Type declared |
| `LoadFailureMessage` | configuration pass-through | `loadFailureMessage` | Type declared |
| `SessionEndMessage` | configuration pass-through | `sessionEndMessage` | Type declared |
| `CommandRateLimit` | configuration pass-through | `commandRateLimit` | Type declared |
| `RequestTimeout` | configuration pass-through | `requestTimeout` | Type declared |
| `MaxInboundBytes` | configuration pass-through | `maxInboundBytes` | Type declared |
| `BoundsPolicy` | configuration pass-through | `boundsPolicy` | Fixture |
| `WipeGuardPolicy` | configuration pass-through | `wipeGuardPolicy` | Fixture |
| `WipeGuardShrinkRatio` | configuration pass-through | `wipeGuardShrinkRatio` | Type declared |
| `LogLevel` | configuration pass-through | `logLevel` | Type declared |
| `StatusThresholds` | configuration pass-through | `statusThresholds`; process-global conflict detection required | Type declared |
| `Banner` | configuration pass-through | `banner` | Type declared |

## Studio and transport compatibility

| Native surface | Classification | Rovy mapping / reason | Coverage checkpoint |
| --- | --- | --- | --- |
| Scribe Studio debug hook | configuration pass-through | Preserve the real module location and frozen native template metadata | Native integration Phase 10 |
| custom `ScribeTransport` | configuration pass-through | Pass the same native transport object; never decode/re-encode buffers | Type declared; native integration Phase 10 |
| default native transport | configuration pass-through | Scribe remains transport owner | Native integration Phase 2/7 |

## Remaining parity gaps

All transformer, runtime, fake-binding, and native-integration coverage remains open
after Phase 0. The table has no unclassified member, but no row labeled
first-class/event/job/pass-through/unsafe should be treated as implemented until
its named phase tests exist.

The target-version decision blocks these rows:

- `Configure`
- `Reason`
- `TryHandleReceipt`
- `Mode`
- `TargetUserId`

If the project chooses a Scribe commit other than the baseline, this inventory must
be regenerated from that exact source before runtime implementation begins.
