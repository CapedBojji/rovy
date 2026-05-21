# Installation

This guide covers setting up Rovy in a roblox-ts project: the toolchain, the npm
packages, the transformer registration, and the `.rovy.json` config.

## Toolchain

Rovy targets [roblox-ts](https://roblox-ts.com/) and uses a standard Roblox
development toolchain. The Rovy repo pins its tools with [mise](https://mise.jdx.dev/):

| Tool | Purpose |
|------|---------|
| [pnpm](https://pnpm.io/) | package manager (workspace-aware) |
| [Rojo](https://rojo.space/) | sync TypeScript output into a Roblox place |
| [Blink](https://github.com/1Axen/blink) | networking IDL — only needed with `@rovy/networking` |
| [zune](https://github.com/Scythe-Technology/zune) | Luau runtime used for tests |

A typical `mise.toml`:

```toml
[tools]
"github:Scythe-Technology/zune" = "latest"
"github:rojo-rbx/rojo" = "7.6.1"
"npm:pnpm" = "11.1.2"
"github:1Axen/blink" = "latest"
```

## Install packages

Rovy ships as separate packages, Flamework-style — a runtime package you import and a
build-time transformer you list in `tsconfig.json`.

Install the core runtime and the transformer:

```sh
npm i @rovy/core
npm i -D rovy-transformer
```

Install networking only when you use net events:

```sh
npm i @rovy/networking
```

Install UI only when you author widgets:

```sh
npm i @rovy/ui
```

| Package | Role | How you use it |
|---------|------|----------------|
| `@rovy/core` | Decorators, macros, types, **and the packaged runtime** | `import` it and write code |
| `@rovy/networking` | `@netEvent` authoring surface + runtime handles | `import` when using net events |
| `@rovy/ui` | Function-first widget/render runtime | `import` widget helpers |
| `rovy-transformer` | roblox-ts compiler transformer plugin | List it in `tsconfig.json` |

The runtime is packaged *inside* `@rovy/core` — there is no separate runtime package.

## Register the transformer

roblox-ts reads custom transformers from `compilerOptions.plugins`. Add `rovy-transformer`
and point it at the shared Rovy config:

```json
{
  "compilerOptions": {
    "plugins": [
      {
        "transform": "rovy-transformer",
        "config": ".rovy.json"
      }
    ]
  }
}
```

That is the only transformer touchpoint in `tsconfig.json`. `rbxtsc` picks it up
automatically — no extra build step.

::: warning Transformer must run
Decorators and macros (`trait<T>()`, `query<...>()`) are real exports, but their
meaningful behavior is the transformer-injected code. If the transformer is missing or
misconfigured, the stubs throw loudly at the first macro hit — for example:
`[rovy] trait<T>() reached runtime untransformed — is rovy-transformer in tsconfig plugins?`
:::

## Configure `.rovy.json`

Keep environment, Rojo, boundary, and Blink settings in `.rovy.json`:

```json
{
  "current": "dev",
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
```

When networking is enabled, the build generates Blink files into
`out/shared/net/generated/*` — you only author decorators and injected params.

## Verify the setup

Write a trivial component and system, build with `rbxtsc`, and confirm the transformer
ran (no untransformed-macro error at startup). Continue to
[Your First System](/guide/your-first-system) for a complete walkthrough.

## See also

- [Packages Overview](/packages/packages) — full package breakdown.
- [Transformer](/runtime/transformer) — build-time duty list.
- [Runtime Lifecycle](/runtime/lifecycle) — how the runtime consumes registrations.
