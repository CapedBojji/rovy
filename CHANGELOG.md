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
- Vendored the unmodified supported Scribe `1.0.11` source snapshot for
  reproducible offline compatibility tests and audits. Production still resolves
  the Wally-installed peer, and the npm package excludes the vendor snapshot.
- Added the package-neutral core flush-participant API used to commit external
  package work deterministically at every Rovy set boundary.

### Changed

- The root build, test, and local-pack commands now include `@rovy/scribe`.
- The transformer now lowers and validates Scribe declarations, decorators,
  command call sites, schema paths, runtime boundaries, and injected services.
- Custom transports retain Scribe's ordering guarantee only when the adapter
  preserves native frame order.
