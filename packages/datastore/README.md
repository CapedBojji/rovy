# `@rovy/datastore`

Typed, document-style persistence for [Rovy](https://github.com/CapedBojji/rovy).

Game code gets typed document declarations, injected reader/writer/opener
handles, and lifecycle events, while Roblox datastore calls stay behind a
package-owned runtime adapter. Use it for player profiles, shared world
documents, and custom keyed documents.

It is separate from `@rovy/core`; core only provides the package-extension
injection hook that lets datastore install its handles automatically at
`App.start()`.

## Install

```sh
npm i @rovy/core @rovy/datastore @rbxts/t
```

`@rbxts/t` is a peer dependency: each document declaration makes the transformer
inject a validator into your own file, so the module must resolve from your
project rather than from inside this package.

## Declare a document

```ts
import { playerDocument } from "@rovy/datastore";

interface ProfileData {
  coins: number;
  level: number;
  inventory: string[];
}

export const Profile = playerDocument<ProfileData>()({
  name: "Profile",
  store: "PlayerData",
  key: (player) => tostring(player.UserId),
  default: () => ({ coins: 0, level: 1, inventory: [] }),
  session: { lock: true, stealOnSessionLocked: true },
  lifecycle: { autoOpen: true, autoClose: true, kickOnOpenFailure: true },
});
```

`playerDocument<T>()` opens by `Player`, `document<T, Owner>()` opens by an
arbitrary owner object, and `sharedDocument<T>()` opens one fixed key.

## Use it in a system

```ts
import { system } from "@rovy/core";
import type { DocumentWriter } from "@rovy/datastore";
import { Profile } from "./documents";

@system({ schedule: Update })
class AwardLoginCoins {
  run(profile: DocumentWriter<typeof Profile>) {
    for (const player of Players.GetPlayers()) {
      if (!profile.isOpen(player)) continue;
      profile.update(player, (data) => ({ ...data, coins: data.coins + 25 }));
    }
  }
}
```

Lifecycle events — `DocumentOpened`, `DocumentOpenFailed`, `DocumentChanged`,
`DocumentSaved`, `DocumentSaveFailed`, `DocumentClosed` — are ordinary core
events. `DataStorePlugin` accepts `mock` seed data or a custom `adapter` for
tests.

> [!IMPORTANT]
> Declarations are transformer-backed. Without `rovy-transformer` registered
> they throw:
> `[rovy/datastore] document declaration reached runtime untransformed - is rovy-transformer in your tsconfig compilerOptions.plugins?`

## Documentation

<https://capedbojji.github.io/rovy/packages/datastore>

## License

MIT
