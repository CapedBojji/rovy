# Changelog

## Unreleased

### Added

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
- Added the package-neutral core flush-participant API used to commit external
  package work deterministically at every Rovy set boundary.
- Added Rojo serve port control to `rovy-build`: a `rojoPort` config field
  (build-level and per environment), the `ROVY_ROJO_PORT` variable, and a
  `--port <number|auto>` flag on `rovy watch`, `rovy open`, and `rovy start`.
  `auto` claims the first free port from Rojo's default `34872`, a pinned port
  that is already in use fails loudly, and the live port is written to
  `.rovy-build/rojo.port` while watch runs.

### Changed

- The root build, test, and local-pack commands now include `@rovy/scribe`.
- The transformer now lowers and validates Scribe declarations, decorators,
  command call sites, schema paths, runtime boundaries, and injected services.
- Custom transports retain Scribe's ordering guarantee only when the adapter
  preserves native frame order.
