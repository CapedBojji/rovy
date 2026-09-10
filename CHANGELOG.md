# Changelog

## 0.1.0 — 2026-09-10

### Added

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

- Removed committed debug scratch scripts (`inspect_scheduler.luau`,
  `packages/ui/inspect_query_shape.luau`, `packages/ui/inspect_scheduler.luau`,
  `packages/ui/luau_size_check.luau`) and a stray npm `package-lock.json` in
  `packages/transformer` — this is a pnpm workspace.

### Changed

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
