# Scribe compatibility

`@rovy/scribe` has one verified runtime peer:

| Scribe peer | Status | Evidence |
| --- | --- | --- |
| `ericplane/scribe@1.0.11`, tag `v1.0.11`, commit `4253d303f3ea9e70b362d9e1e498b805ac3a8d01` | Supported | Pinned command-dispatch integration, fake-binding runtime suites, and a full native client bundle in Roblox Studio |
| Any other version | Unverified | Rejected by default; `strict: false` is an explicit opt-in with no compatibility promise |

The package exports `SCRIBE_SUPPORTED_VERSION` as the literal `"1.0.11"`.
`ScribePlugin`, `ScribeClientPlugin`, and `ScribeServerPlugin` compare the native
module's `Version` before constructing any bundle. The default is fail-closed:

```ts
new ScribePlugin({
	module: scribeModule,
});
```

An experiment against a different peer must be explicit:

```ts
new ScribePlugin({
	module: unverifiedScribeModule,
	strict: false,
});
```

This opt-out disables only the exact-version startup check. It does not disable
schema, boundary, command-wire, or runtime validation, and it does not turn an
untested peer into a supported one.

## Native compatibility gates

- The command gate executes unmodified
  `src/Server/Commands.luau` from the pinned commit and proves its `xpcall`
  dispatcher can yield through the Rovy request/flush/response bridge.
- The Studio gate clones the pinned peer into an ignored test cache, builds a
  scratch place, constructs the client bundle through `NativeScribeBinding`, and
  checks the native frozen `__ScribeTemplate`.
- The same Studio gate observes `_ScribeClientDebugHook`, including its
  `Request` `BindableFunction` and `Stream` `BindableEvent`.
- The Studio gate calls native status, filtered-log, metric, and log-sink APIs
  through the wrapper binding.
- The custom-transport gate passes one transport object by identity and checks
  both listener directions and every send path receive the exact same `buffer`
  object and bytes.

The repeatable Studio fixture lives in
`packages/scribe/test/studio`. It does not vendor Scribe and its downloaded peer
and generated place are excluded from Git and npm packaging.
