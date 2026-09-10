# `rovy-transformer`

The roblox-ts compiler transformer that powers
[Rovy](https://github.com/CapedBojji/rovy).

Rovy's decorators and macros are real exports, but their meaningful behavior is
code this transformer injects at compile time. Without it registered, the
runtime stubs throw loudly at the first macro hit.

## Install

```sh
npm i -D rovy-transformer
```

Register it in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [{ "transform": "rovy-transformer" }]
  }
}
```

That is the only transformer touchpoint. Compile, generation, Rojo build, open,
and watch are owned by
[`rovy-build`](https://www.npmjs.com/package/rovy-build).

## What it does

- Lowers `@component`, `@collect`, `@resource`, `@event`, `@system`,
  `@observer`, `@monitor`, `@relation`, `@schedule`, `@set`, `@plugin`,
  `@server`, `@client`, and `@inspect` into `rovy.__*` registration calls
- Expands the `trait<T>()` and `query<...>()` macros
- Erases authoring-only types and turns injected system params into runtime
  descriptors
- Lowers `@netEvent` / `@netFunction` into networking registrations with stable
  compile-time ids
- Lowers datastore document declarations and Scribe schema declarations
- Lowers `@ui` / `@view` components and `/** @widget */` functions
- Rewrites `rovy.loadPaths(...)` string paths into Rojo-resolved Instance roots,
  including partitioned and public plugin contracts

## Documentation

<https://capedbojji.github.io/rovy/runtime/transformer>

## License

MIT
