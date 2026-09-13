# Installation

This guide covers setting up Rovy in a roblox-ts project: the toolchain, the npm
packages, the transformer registration, and the `rovy-build` config.

## Toolchain

Rovy targets [roblox-ts](https://roblox-ts.com/) and uses a standard Roblox
development toolchain. The Rovy repo pins its tools with [mise](https://mise.jdx.dev/):

| Tool                                              | Purpose                                              |
| ------------------------------------------------- | ---------------------------------------------------- |
| [pnpm](https://pnpm.io/)                          | package manager (workspace-aware)                    |
| [Rojo](https://rojo.space/)                       | sync TypeScript output into a Roblox place           |
| [Blink](https://github.com/1Axen/blink)           | networking IDL — only needed with `@rovy/networking` |
| [zune](https://github.com/Scythe-Technology/zune) | Luau runtime used for tests                          |
| [run-in-roblox](https://github.com/rojo-rbx/run-in-roblox) | drives Studio for acceptance tests         |

A typical `mise.toml`:

```toml
[tools]
"github:Scythe-Technology/zune" = "latest"
"github:rojo-rbx/rojo" = "7.6.1"
"github:rojo-rbx/run-in-roblox" = "0.3.0"
"npm:pnpm" = "11.1.2"
"github:1Axen/blink" = "latest"
```

## Install packages

Rovy ships as separate packages, Flamework-style — a runtime package you import and a
build-time transformer you list in `tsconfig.json`, and a build orchestrator for project commands.

Install the core runtime, its jecs peer, the transformer, and the build
orchestrator:

```sh
npm i @rovy/core @rovy/jecs
npm i -D rovy-transformer rovy-build
```

`@rovy/jecs` is a peer dependency of `@rovy/core` — the Rovy-vendored
[jecs](https://github.com/Ukendio/jecs) runtime that core compiles against.
Install it explicitly; leaving it out leaves an unmet peer and core fails to
resolve its world implementation at runtime.

Install networking only when you use net events:

```sh
npm i @rovy/networking
```

Install parallel jobs when you need pooled Actors for ECS snapshots:

```sh
npm i @rovy/parallel
```

Keep the package's `out` tree in your Rojo mapping so its prebuilt worker Script
templates are available. Define jobs in dedicated `.job.ts` modules and enable
the same transformer as core. See the [parallel guide](/packages/parallel) and
[live performance graphs](/packages/parallel/verification).

Install datastore only when you need persistent documents:

```sh
npm i @rovy/datastore @rbxts/t
```

`@rbxts/t` is a peer dependency. Every document declaration makes the
transformer inject a `@rbxts/t` validator into **your** file, so the module has
to resolve from your project, not from inside `@rovy/datastore`. With npm or
yarn a nested copy usually hoists far enough to work by accident; with pnpm's
isolated layout it does not.

`@rovy/core` declares the same package as an *optional* peer. It is only needed
when you turn on `runtimeTypeChecks` (or `debug`), which makes `@component` and
`@inspect` emit validators the same way.

Install the Scribe wrapper when the game uses Scribe-managed player profiles:

```sh
npm i @rovy/scribe
```

The runtime peer remains a Wally dependency:

```toml
[dependencies]
Scribe = "ericplane/scribe@2.3.0"
```

Scribe 2.x bundles its own patched ProfileStore, so do not add
`lm-loleris/profilestore` yourself.

Install Vide only when you author reactive game UI with Vide:

```sh
npm i @rovy/vide @rbxts/vide
```

Install UI only when you author retained UI or immediate widgets:

```sh
npm i @rovy/ui
npm i @rovy/imgui
```

Install the in-game inspector only when you want the debug tool:

```sh
npm i @rovy/world-inspector
```

| Package                 | Role                                                           | How you use it                              |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| `@rovy/core`            | Decorators, macros, types, **and the packaged runtime**        | `import` it and write code                  |
| `@rovy/jecs`            | Rovy-vendored jecs runtime `@rovy/core` compiles against        | install it; core imports it for you         |
| `@rovy/networking`      | `@netEvent` authoring surface + runtime handles                | `import` when using net events              |
| `@rovy/parallel`        | Typed snapshot jobs and a bounded Actor pool                  | Inject `JobWriter` / `JobReader`             |
| `@rovy/datastore`       | Persistent document declarations + reader/writer/opener handles | `import` when using datastore documents     |
| `@rovy/scribe`          | Scheduled typed wrapper over native Scribe player profiles     | `import` when using Scribe-managed profiles |
| `@rovy/vide`            | Reactive Vide view integration for gameplay UI                 | `import` `@view` and `mountView`            |
| `@rovy/ui`              | Retained class-based Roblox UI runtime                         | `import` `@ui`, then call `app.mount`       |
| `@rovy/imgui`           | Function-first widget/render runtime                           | `import` widget helpers                     |
| `@rovy/world-inspector` | In-game ECS inspection and editing plugin                      | `import` when embedding the debug inspector |
| `rovy-transformer`      | roblox-ts compiler transformer plugin                          | List it in `tsconfig.json`                  |
| `rovy-build`            | build/open/watch/start orchestration and Rovy config discovery | Use it in package scripts                   |

The runtime is packaged _inside_ `@rovy/core` — there is no separate runtime package.

## Register the transformer

roblox-ts reads custom transformers from `compilerOptions.plugins`. Add `rovy-transformer`:

```json
{
  "compilerOptions": {
    "plugins": [
      {
        "transform": "rovy-transformer"
      }
    ]
  }
}
```

That is the only transformer touchpoint in `tsconfig.json`. `rovy-build` handles
compile, generation, Rojo build, open, and watch.

::: warning Transformer must run
Decorators and macros (`trait<T>()`, `query<...>()`) are real exports, but their
meaningful behavior is the transformer-injected code. If the transformer is missing or
misconfigured, the stubs throw loudly at the first macro hit — for example:
`[rovy] trait<T>() reached runtime untransformed — is rovy-transformer in tsconfig plugins?`
:::

## Configure rovy-build

Keep build, environment, Rojo, boundary, and Blink settings in `package.json` under `rovy-build`:

```json
{
  "rovy-build": {
    "current": "dev",
    "placeFile": "game.rbxl",
    "rbxtscArgs": ["--type", "game"],
    "rojoBuildArgs": ["build", "default.project.json", "-o", "game.rbxl"],
    "watchOnOpen": true,
    "generateBlink": true,
    "environments": {
      "dev": {
        "rojo": "default.project.json",
        "boundaries": {
          "server": ["src/server"],
          "client": ["src/client"],
          "shared": ["src/shared"]
        },
        "net": {
          "strictBoundaryChecks": true,
          "transport": "blink",
          "blink": {
            "enabled": true,
            "remoteScope": "ROVY",
            "manualReplication": true,
            "usePolling": true
          }
        }
      }
    }
  }
}
```

When networking is enabled, the build generates Blink files into
`out/shared/net/generated/*` — you only author decorators and injected params.

## Build orchestrator commands

`rovy-build` installs the `rovy` CLI. Put the commands in package scripts so
project-local `node_modules/.bin` is on `PATH`:

```json
{
  "scripts": {
    "compile": "rovy compile",
    "generate": "rovy generate",
    "build": "rovy build",
    "watch": "rovy watch",
    "open": "rovy open",
    "start": "rovy start",
    "stop": "rovy stop"
  }
}
```

| Command         | What it does                                                                                                                           |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `rovy compile`  | Runs `rbxtsc` with `rbxtscArgs`, then runs generators unless `generateBlink` is `false`.                                               |
| `rovy generate` | Runs Rovy generators only. Today that means Blink transport files when networking generation is enabled.                               |
| `rovy build`    | Runs `rovy compile`, then runs `rojo` with `rojoBuildArgs` to write the configured place file.                                         |
| `rovy watch`    | Starts `rojo serve`, optional `rojo sourcemap --watch`, and `rbxtsc -w`; also keeps Blink generated files fresh after compile changes. |
| `rovy open`     | Opens `placeFile` in Roblox Studio. If `watchOnOpen` is not `false`, it also starts `rovy watch`.                                      |
| `rovy start`    | Runs `rovy build`, then `rovy open`. Use this for the normal "build, open Studio, keep watching" loop.                                 |
| `rovy stop`     | Stops tracked watch and Studio processes from `.rovy-build/*.pid`.                                                                     |
| `rovy init`     | Writes a starter `rovy-build` config and package scripts into the current `package.json`.                                              |

`rovy watch` includes an interactive prompt. Type `help` in that prompt for
available actions: `open`, `compile`, `generate`, `build`, `stop`, and `exit`.

The older `rovy-build` binary name still points at the same CLI, but examples and
new docs use `rovy`.

## Verify the setup

Write a trivial component and system, build with `rovy build`, and confirm the transformer
ran (no untransformed-macro error at startup). Continue to
[Your First System](/guide/your-first-system) for a complete walkthrough.

## See also

- [Packages Overview](/packages/packages) — full package breakdown.
- [Rovy Vide](/packages/vide) — reactive Vide views over Rovy ECS state.
- [Datastore](/packages/datastore) — typed persistent documents.
- [Scribe](/packages/scribe) — buffered access, events, commands, and jobs over native Scribe.
- [World Inspector](/packages/world-inspector) — in-game ECS inspection and editing.
- [Transformer](/runtime/transformer) — build-time duty list.
- [Runtime Lifecycle](/runtime/lifecycle) — how the runtime consumes registrations.
