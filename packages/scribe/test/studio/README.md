# Native Studio integration fixture

This fixture proves that `@rovy/scribe` constructs the pinned native Scribe
module without relocating or wrapping it, preserves Scribe Studio's frozen
template metadata, and leaves the native client debug hook able to attach. Its
second gate runs the wrapper's client and server runtimes over Scribe's real
RemoteEvent transport with a deterministic fake ProfileStore backend. That gate
covers committed reader snapshots, buffered local and authoritative writes,
native batch/transaction rollback, deferred Rovy events, a flush-gated command,
replication-before-command-completion ordering, persistence jobs, offline
versions/GDPR operations, durable messaging, cooldowns, ownership, purchases,
receipt grants, gift credits and delivery, economy callbacks, leaderboards,
service diagnostics, save/session lifecycle, and native SharedInit/Diff/Gone
frames through the default transport. The full gate is run twice consecutively
to catch lifecycle and ordering flakes.

It intentionally does not vendor Scribe. Prepare the ignored native peer and
build the scratch place:

```sh
./packages/scribe/test/studio/prepare-native.sh
mkdir -p packages/scribe/test/studio/.build
mise exec -- rojo build packages/scribe/test/studio/default.project.json \
	-o packages/scribe/test/studio/.build/scribe-native-integration.rbxlx
```

Open that place in Roblox Studio and start a single-player playtest. The test
passes when output contains all three lines:

```text
ROVY_SCRIBE_STUDIO_COMPAT_OK 1.0.11
ROVY_SCRIBE_NATIVE_SERVER_OK 1.0.11
ROVY_SCRIBE_NATIVE_CLIENT_OK 1.0.11
```

The exact supported peer in this fixture is Scribe tag `v1.0.11`, commit
`4253d303f3ea9e70b362d9e1e498b805ac3a8d01`.

The fixture injects Scribe's deterministic test ProfileStore so it can verify
native persistence behavior without Roblox cloud access. Real cloud service
availability and the Marketplace purchase-prompt UI require a published-place
environment and are not replaced by this fixture.
