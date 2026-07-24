# Vendored Scribe

This directory contains an unmodified source snapshot of the native Scribe
runtime used by `@rovy/scribe`.

- Repository: `https://github.com/ericplane/Scribe`
- Wally package: `ericplane/scribe@1.0.11`
- Tag: `v1.0.11`
- Commit: `4253d303f3ea9e70b362d9e1e498b805ac3a8d01`
- License: MIT; see `LICENSE`

The checked-in Wally payload is `src`, `default.project.json`, `wally.toml`,
`LICENSE`, and the upstream `README.md`. The native Studio acceptance fixture
also needs the unmodified upstream `test/Helpers/FakeProfileStore.luau`, so that
single test helper is included.

There are no Rovy patches in this snapshot. `@rovy/scribe` remains Rovy's own
typed wrapper and native Scribe remains the production runtime peer installed
through Wally. The npm package does not publish this vendor directory and the
runtime resolver does not silently fall back to it. The snapshot exists for
reproducible native tests, compatibility auditing, and offline development.

Run `packages/scribe/test/studio/verify-vendor.sh` to verify the recorded file
hashes before building the Studio fixture.
