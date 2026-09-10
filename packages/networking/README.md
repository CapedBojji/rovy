# `@rovy/networking`

Typed cross-network events and non-blocking request/response functions for
[Rovy](https://github.com/CapedBojji/rovy), generated over a
[Blink](https://github.com/1Axen/blink) or RemoteEvent transport.

Authored as one plugin and split by `rovy-build`: codecs, metadata, and wire
contracts are shared; `NetClientRuntime` / `NetClientPlugin` are client-only,
`NetServerRuntime` / `NetServerPlugin` are server-only. The generated package
facade loads shared code plus only the active Roblox boundary.

It does **not** provide automatic entity/component replication.

## Install

```sh
npm i @rovy/core @rovy/networking
```

Enable transport generation in your `rovy-build` config:

```json
{
  "rovy-build": {
    "generateBlink": true,
    "environments": {
      "dev": {
        "net": { "transport": "blink", "strictBoundaryChecks": true }
      }
    }
  }
}
```

## Example

Declare the event once — it is shared by both boundaries:

```ts
import { netEvent, type NetId } from "@rovy/networking";

@netEvent({
  direction: "clientToServer",
  channel: "reliable",
  receive: "send",
})
class CastAbilityIntent {
  constructor(
    public caster: NetId,
    public abilityId: string,
  ) {}
}
```

Send from the client with an injected `NetClient`:

```ts
import { system } from "@rovy/core";
import { NetClient } from "@rovy/networking";

@system({ schedule: Update })
class SendIntents {
  run(net: NetClient) {
    net.send(new CastAbilityIntent(localId, "fireball"));
  }
}
```

`receive: "send"` means the **receiver** performs `commands.send(event)`, so the
server reads it with an ordinary core `EventReader<CastAbilityIntent>`.
`receive: "trigger"` routes it to an `@observer` instead. `@netEvent` implies
`@event` — you never need both decorators.

Server→client sends use the injected `NetServer`, which exposes `send`,
`trigger`, `broadcast`, `broadcastTrigger`, `sendList`, `triggerList`,
`broadcastExcept`, and `broadcastTriggerExcept`.

`@netFunction` is non-blocking request/response over the same transport; it does
**not** use Roblox `RemoteFunction`.

## Documentation

<https://capedbojji.github.io/rovy/packages/networking>

## License

MIT
