# `@rovy/scribe`

Rovy scheduling, injection, events, commands, and non-yielding jobs for
Scribe-managed Roblox player profiles.

The package wraps the game's Wally-installed Scribe module. It does not fork or
replace either Scribe or ProfileStore, duplicate profile state, or depend on
`@rovy/datastore` or `@rovy/networking`. This repository vendors the exact
supported Scribe source under `vendor/scribe` for reproducible compatibility
tests and audits; that snapshot is not published in the npm package and is not
a production runtime fallback.

Verified runtime peer:

```toml
[dependencies]
Scribe = "ericplane/scribe@1.0.11"
```

Read the [package guide](https://capedbojji.github.io/rovy/packages/scribe),
[migration guide](https://capedbojji.github.io/rovy/packages/scribe-migration),
and
[compatibility matrix](https://capedbojji.github.io/rovy/packages/scribe-compatibility).
