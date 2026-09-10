# Changelog

## 0.1.0 — 2026-09-10

### Added

- Added transformer coverage for `sharedDocument` and `document<T, Owner>()`,
  neither of which had any. Both shipped bugs as a result.
- Added `test/place`, a Roblox integration place compiled by `rbxtsc` with
  `rovy-transformer`, built by Rojo, and driven inside Roblox Studio by
  `run-in-roblox`. `pnpm test:place` runs it; `pnpm build:place` compiles and
  builds the `.rbxl` without Studio and runs in CI.
- Added `$eventTrigger<E>()`, a type-argument form for events that have no class
  to name. `@rovy/datastore` keys its document events off a
  transformer-generated document id, so
  `$eventTrigger<DocumentChanged<typeof Profile>>()` now resolves the same
  constructor the matching `EventReader` param resolves.

- Added `MIT` `LICENSE` files at the repository root and in every published
  package. Each manifest already declared `"license": "MIT"` but shipped no
  license text.
- Added npm publishing metadata to every package: `repository` (with
  `directory`), `homepage`, `bugs`, `author`, `keywords`, and
  `publishConfig.access`.
- Added `pnpm check:versions`, a publish guard asserting that every package
  agrees on one version, that no `workspace:` range leaks into a published
  dependency, and that `@rovy/core`'s exported `VERSION` matches its manifest.
- Added `pnpm release:dry` and `pnpm release`, plus a CI workflow that builds,
  tests, and verifies every package packs cleanly.
- Added `build:world-inspector` and `test:world-inspector` root scripts.

- Added an npm-facing `README.md` to every publishable package: `@rovy/core`,
  `@rovy/networking`, `@rovy/datastore`, `@rovy/ui`, `@rovy/imgui`,
  `@rovy/vide`, `@rovy/world-inspector`, `rovy-transformer`, and `rovy-build`.
  `@rovy/jecs` gained a fork notice identifying it as an unmodified vendored
  re-publish of upstream jecs.
- Added the `@rovy/jecs` peer dependency to the installation guide, the package
  tables, and the root README. It was previously undocumented, so a fresh
  install left an unmet peer.
- Added a "Declare your schedules" step to the Your First System walkthrough and
  linked the previously orphaned `@rovy/imgui` documentation into the site nav
  and sidebar.

- Added `@rovy/scribe`, a partitioned Rovy plugin for the verified
  `ericplane/scribe@1.0.11` runtime peer.
- Added typed Scribe schema declarations, committed readers, buffered local and
  authoritative writers, native transactions, Rovy change/signal events, and
  non-yielding native command bridges.
- Added non-yielding persistence and feature jobs for offline data, versions,
  GDPR, leaderboards, monetization, ownership, receipts, cooldowns, and durable
  messaging.
- Added normalized diagnostics, guarded edit-mode mocks, custom transport
  pass-through, Studio debug-hook compatibility, an exhaustive parity inventory,
  and a direct-Scribe migration guide.
- Added a pinned native Studio acceptance gate that runs two bundles on both
  boundaries over Scribe's default transport, including commands, shared data,
  persistence, messaging, leaderboards, monetization, gifts, diagnostics, and
  session lifecycle; the gate also verifies authoritative diffs precede command
  completion for the supported default transport.
- Vendored the unmodified supported Scribe `1.0.11` source snapshot for
  reproducible offline compatibility tests and audits. Production still resolves
  the Wally-installed peer, and the npm package excludes the vendor snapshot.
- Added the package-neutral core flush-participant API used to commit external
  package work deterministically at every Rovy set boundary.

### Fixed

- Fixed `@rovy/imgui` rendering an empty window body. `RovyUi.new(root)` now
  puts the root `LayerCollector` into `Enum.ZIndexBehavior.Sibling`. Roblox
  defaults a `ScreenGui` to `Global`, where a descendant only draws above an
  ancestor with a higher `ZIndex`; imgui gives a window's chrome `ZIndex` 100
  and leaves widget content at 1, so every window painted its own background
  over its contents and `@rovy/world-inspector` opened as a blank frame.
- Fixed `@rovy/ui` losing declaration order under a `UIListLayout` or
  `UIGridLayout`. Children carried no `LayoutOrder`, and Roblox defaults
  `SortOrder` to `Name`, so a list rendered alphabetically. Rovy now numbers
  children by declaration order and defaults those layouts to sort by it; an
  explicit `LayoutOrder` or `SortOrder` still wins.
- Fixed `sharedDocument` emitting its `key` verbatim. `SharedDocumentOptions.key`
  is a plain string, but the runtime always calls `def.key(owner)`, so a shared
  document with a key threw on its first open. The transformer now wraps a
  string key.
- Fixed `document<T, Owner>()` losing its `Owner` type argument. `__document`
  inferred `Owner` from the very object literal it was checking, so
  `key: (owner) => owner.id` saw `unknown` and failed `noImplicitAny`. The
  emitted call now carries explicit type arguments.
- Fixed `@rbxts/t` being a plain dependency of `@rovy/datastore`. Every document
  declaration makes the transformer inject a `@rbxts/t` validator into the
  *consumer's* file, so the module must resolve from the consumer's project; it
  is now a peer dependency. `@rovy/core` declares it as an optional peer, since
  `@component` and `@inspect` emit the same validators once `runtimeTypeChecks`
  or `debug` is enabled.
- Fixed `@rovy/datastore` not exporting the `DocumentWriter` type. The docs told
  users to import it and the type existed, but it was missing from the package's
  export list, so `import type { DocumentWriter } from "@rovy/datastore"` failed.
- Fixed the `@rovy/ui` Luau test harness, which could not load a sibling package
  (no node_modules link to follow), could not load a `rovy-build` package facade
  (nodes answered `FindFirstChild` but not `IsA`/`GetChildren`), and left
  `RunService:IsClient()`/`IsServer()` undefined so boundary providers fell back
  to "unknown".
- Fixed `@rovy/world-inspector` leaking its boundary-specific registrations
  into every other `App` in the same Luau state. The systems, observers, and
  resource registered inside `WorldInspectorPlugin.build` and
  `WorldInspectorServerPlugin.build` carried no owning `plugin`, so
  `App.filterRegistry` kept them everywhere. A client app started after a
  server app therefore inherited the server's `NET_SERVER_PARAM` system and
  failed with "missing external injected param". Each registration now names
  its owning plugin.
- Fixed the shared Luau test harness, which could not load a `rovy-build`
  package facade: nodes answered `FindFirstChild` but not `IsA` or
  `GetChildren`. The harness also now loads every boundary of a partitioned
  package rather than the one `RunService` would select, since Zune has no
  `game` and specs drive a client and a server app in one process.
- Fixed the `@rovy/world-inspector` test suite, which had never passed. It now
  runs in `pnpm test` and in CI alongside every other package.
- Fixed the ECS example on the README, the docs home page, and the Your First
  System walkthrough: all three referenced an `Update` schedule that was never
  declared or imported, and Rovy ships no built-in schedules. The examples now
  declare the schedule and drive it from a frame loop.
- Corrected the claim that `app.start()` "begins the schedule loop". It runs
  `runOnStart` schedules only; per-frame schedules are driven by the caller.
- Refreshed the stale `@rovy/imgui` source layout listing and dropped
  pre-release status banners from the shipped networking and datastore pages.

### Removed

- Removed `test/roblox/run-tests.luau`, a TestEZ bootstrap that could never run:
  it required a `RovyRobloxTests` folder that no project produced, and TestEZ was
  not a dependency of any package. `test/place` replaces it.

- Removed the inert `networkBoundary` option from
  `WorldInspectorPluginOptions` and `WorldInspectorServerPluginOptions`.
  Nothing ever read it, and there is nowhere to forward it:
  `NetClientPluginOptions` and `NetServerPluginOptions` both
  `Omit<..., "boundary">` because the active side is chosen by the generated
  facade. Dropped before the first publish rather than shipping dead API.

- Removed committed debug scratch scripts (`inspect_scheduler.luau`,
  `packages/ui/inspect_query_shape.luau`, `packages/ui/inspect_scheduler.luau`,
  `packages/ui/luau_size_check.luau`) and a stray npm `package-lock.json` in
  `packages/transformer` — this is a pnpm workspace.

### Changed

- Moved the supported native Scribe peer from `1.0.11` to `2.3.0` (tag `v2.3.0`,
  commit `e3309e9debdce2d3571406c48ded89f728404795`) and revendored the
  snapshot. Two upgrade notes for games: Scribe 2.x bundles its own patched
  ProfileStore, so remove `lm-loleris/profilestore` from `wally.toml`; and the
  replication protocol moved from 1 to 6, so a server and a client built from
  different Scribe versions refuse each other with `PROTOCOL_MISMATCH` and must
  be deployed together.

- Set the first published version of every package to `0.1.0` (previously
  `0.0.0`) and widened the inter-package `peerDependencies` from the exact
  `0.0.0` to `^0.1.0`. `@rovy/jecs` keeps its upstream-tracking
  `0.11.0-rovy.1`.
- Relaxed the `@rbxts/vide` peer range on `@rovy/vide` from the exact `0.6.1`
  to `^0.6.1`.
- The root build, test, and local-pack commands now include `@rovy/scribe`.
- The transformer now lowers and validates Scribe declarations, decorators,
  command call sites, schema paths, runtime boundaries, and injected services.
- Custom transports retain Scribe's ordering guarantee only when the adapter
  preserves native frame order.
