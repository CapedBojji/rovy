# `@rovy/scribe`

Rovy scheduling, injection, events, commands, and non-yielding jobs for
Scribe-managed Roblox player profiles.

The package wraps the game's Wally-installed Scribe module. It does not vendor
Scribe, replace ProfileStore, duplicate profile state, or depend on
`@rovy/datastore` or `@rovy/networking`.

Verified runtime peer:

```toml
[dependencies]
Scribe = "ericplane/scribe@2.3.0"
```

Scribe 2.x bundles its own patched ProfileStore, so do not install
`lm-loleris/profilestore` alongside it.

Read the [package guide](https://capedbojji.github.io/rovy/packages/scribe),
[migration guide](https://capedbojji.github.io/rovy/packages/scribe-migration),
and
[compatibility matrix](https://capedbojji.github.io/rovy/packages/scribe-compatibility).
