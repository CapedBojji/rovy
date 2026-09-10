# `rovy-build`

Build manager and project orchestrator for
[Rovy](https://github.com/CapedBojji/rovy) games. Installs the `rovy` CLI and
owns the command flow around `rbxtsc`, Rovy generators, Rojo, and Roblox Studio.

## Install

```sh
npm i -D rovy-build rovy-transformer
```

Then wire the commands into package scripts so project-local `node_modules/.bin`
is on `PATH`:

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

`rovy init` writes a starter config and these scripts into your `package.json`.

## Commands

| Command | What it does |
| --- | --- |
| `rovy compile` | Runs `rbxtsc` with `rbxtscArgs`, then generators unless `generateBlink` is `false`. |
| `rovy generate` | Runs Rovy generators only — today, Blink transport files. |
| `rovy build` | `rovy compile`, then `rojo` with `rojoBuildArgs` to write the place file. |
| `rovy watch` | Starts `rojo serve`, optional `rojo sourcemap --watch`, and `rbxtsc -w`, keeping generated files fresh. |
| `rovy open` | Opens `placeFile` in Studio; also starts `rovy watch` unless `watchOnOpen` is `false`. |
| `rovy start` | `rovy build`, then `rovy open` — the normal loop. |
| `rovy stop` | Stops tracked watch and Studio processes from `.rovy-build/*.pid`. |
| `rovy init` | Writes a starter `rovy-build` config and package scripts. |

`rovy watch` runs an interactive prompt; type `help` in it for `open`, `compile`,
`generate`, `build`, `stop`, and `exit`.

The older `rovy-build` binary name still points at the same CLI, but examples and
new docs use `rovy`.

## Configuration

Everything lives in `package.json` under `rovy-build`:

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

## Documentation

<https://capedbojji.github.io/rovy/guide/installation>

## License

MIT
