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
- Added the package-neutral core flush-participant API used to commit external
  package work deterministically at every Rovy set boundary.

### Changed

- The root build, test, and local-pack commands now include `@rovy/scribe`.
- The transformer now lowers and validates Scribe declarations, decorators,
  command call sites, schema paths, runtime boundaries, and injected services.
