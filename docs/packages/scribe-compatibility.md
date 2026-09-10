# Scribe compatibility

`@rovy/scribe` has one verified runtime peer:

| Scribe peer | Status | Evidence |
| --- | --- | --- |
| `ericplane/scribe@2.3.0`, tag `v2.3.0`, commit `e3309e9debdce2d3571406c48ded89f728404795` | Supported | Pinned command-dispatch integration, fake-binding suites, and a two-boundary/two-bundle native Roblox Studio gate |
| Any other version | Unverified | Rejected by default; `strict: false` is an explicit opt-in with no compatibility promise |

The package exports `SCRIBE_SUPPORTED_VERSION` as the literal `"2.3.0"`.

Scribe 2.x bundles its own patched ProfileStore, so a game no longer installs
`lm-loleris/profilestore` alongside it — remove that dependency when upgrading.
The replication protocol also moved from 1 to 6, so a server and a client built
from different Scribe versions refuse each other and log `PROTOCOL_MISMATCH`;
deploy both halves together.
`ScribePlugin`, `ScribeClientPlugin`, and `ScribeServerPlugin` compare the native
module's `Version` before constructing any bundle. The default is fail-closed:

<<< ../../packages/scribe/docs-examples/compatibility.ts#strict-peer

An experiment against a different peer must be explicit:

<<< ../../packages/scribe/docs-examples/compatibility.ts#unverified-peer

This opt-out disables only the exact-version startup check. It does not disable
schema, boundary, command-wire, or runtime validation, and it does not turn an
untested peer into a supported one.

## Native compatibility gates

- The command gate executes unmodified
  `src/Server/Commands.luau` from the pinned commit and proves its `xpcall`
  dispatcher can yield through the Rovy request/flush/response bridge.
- The Studio gate clones the pinned peer into an ignored test cache, builds a
  scratch place, and constructs two wrapper-owned bundles on both boundaries
  through `NativeScribeBinding`.
- It uses Scribe's real default RemoteEvent transport with a deterministic
  injected ProfileStore, and covers readiness, immutable reads, local and
  authoritative writes, batches, transactions, replication, structural events,
  commands, jobs, persistence/version/GDPR operations, shared frames,
  leaderboards, ownership, purchases, receipts, gifts, economy analytics,
  cooldowns, messaging, diagnostics, saves, and session end.
- The command gate asserts that the client mirror receives the authoritative
  diff before command completion for the supported default transport.
- The same Studio gate observes `_ScribeClientDebugHook`, including its
  `Request` `BindableFunction` and `Stream` `BindableEvent`.
- The Studio gate calls native status, filtered-log, metric, and log-sink APIs
  through the wrapper binding.
- The complete Studio gate passes twice consecutively as a flake check.
- The custom-transport gate passes one transport object by identity and checks
  both listener directions and every send path receive the exact same `buffer`
  object and bytes.

The repeatable Studio fixture lives in
`packages/scribe/test/studio`. Its native peer is the unmodified, hash-verified
snapshot in `vendor/scribe`; the generated place remains excluded from Git.
The `@rovy/scribe` npm package publishes only `packages/scribe/out` and therefore
does not bundle the vendor snapshot.

Roblox cloud DataStore/ProfileStore availability and Marketplace prompt UI are
environmental checks for a published place. The wrapper delegates both to
Scribe and does not substitute fake behavior in production.
