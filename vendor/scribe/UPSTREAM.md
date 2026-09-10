# Vendored Scribe

This directory contains an unmodified source snapshot of the native Scribe
runtime used by `@rovy/scribe`.

- Repository: `https://github.com/ericplane/Scribe`
- Wally package: `ericplane/scribe@2.3.0`
- Tag: `v2.3.0`
- Commit: `e3309e9debdce2d3571406c48ded89f728404795`
- License: MIT; see `LICENSE`

The checked-in Wally payload is `src`, `default.project.json`, `wally.toml`,
`LICENSE`, `NOTICE`, `licenses/`, and the upstream `README.md`. Scribe 2.x
bundles its own patched ProfileStore under `src/Internal/Store`, which is what
`NOTICE` and `licenses/` cover, so games no longer install ProfileStore
themselves. The native Studio acceptance fixture
also needs the unmodified upstream `test/Helpers/FakeProfileStore.luau`, so that
single test helper is included.

There are no Rovy patches in this snapshot. `@rovy/scribe` remains Rovy's own
typed wrapper and native Scribe remains the production runtime peer installed
through Wally. The npm package does not publish this vendor directory and the
runtime resolver does not silently fall back to it. The snapshot exists for
reproducible native tests, compatibility auditing, and offline development.

Run `packages/scribe/test/studio/verify-vendor.sh` to verify the recorded file
hashes before building the Studio fixture.
