# Native Studio compatibility fixture

This fixture proves that `@rovy/scribe` constructs the pinned native Scribe
module without relocating or wrapping it, preserves Scribe Studio's frozen
template metadata, and leaves the native client debug hook able to attach.

It intentionally does not vendor Scribe. Prepare the ignored native peer and
build the scratch place:

```sh
./packages/scribe/test/studio/prepare-native.sh
mkdir -p packages/scribe/test/studio/.build
mise exec -- rojo build packages/scribe/test/studio/default.project.json \
	-o packages/scribe/test/studio/.build/scribe-studio-compat.rbxlx
```

Open that place in Roblox Studio and start a single-player playtest. The test
passes when client output contains:

```text
ROVY_SCRIBE_STUDIO_COMPAT_OK 1.0.11
```

The exact supported peer in this fixture is Scribe tag `v1.0.11`, commit
`4253d303f3ea9e70b362d9e1e498b805ac3a8d01`.
