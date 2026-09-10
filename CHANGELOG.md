# Changelog

## Unreleased

### Added

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

- Fixed the ECS example on the README, the docs home page, and the Your First
  System walkthrough: all three referenced an `Update` schedule that was never
  declared or imported, and Rovy ships no built-in schedules. The examples now
  declare the schedule and drive it from a frame loop.
- Corrected the claim that `app.start()` "begins the schedule loop". It runs
  `runOnStart` schedules only; per-frame schedules are driven by the caller.
- Refreshed the stale `@rovy/imgui` source layout listing and dropped
  pre-release status banners from the shipped networking and datastore pages.

### Changed

- The root build, test, and local-pack commands now include `@rovy/scribe`.
- The transformer now lowers and validates Scribe declarations, decorators,
  command call sites, schema paths, runtime boundaries, and injected services.
- Custom transports retain Scribe's ordering guarantee only when the adapter
  preserves native frame order.
