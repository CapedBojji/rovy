# Datastore (`@rovy/datastore`)

Status: v1 package shipped with transformer/runtime wiring.

`@rovy/datastore` is Rovy's document-style persistence package. It gives game
code typed document declarations, injected reader/writer/opener handles, and
lifecycle events while keeping Roblox datastore calls behind a package-owned
runtime adapter.

Use it for player profiles, shared world documents, and custom keyed documents.
It is separate from `@rovy/core`; core only provides the package-extension
injection hook that lets datastore install its handles automatically at
`App.start()`.

## Install

```sh
npm i @rovy/datastore
```

Keep `@rovy/core`, `rovy-transformer`, and `rovy-build` installed as normal.
The datastore authoring functions are transformer-backed. If the transformer
does not run, document declarations throw:

```txt
[rovy/datastore] document declaration reached runtime untransformed - is rovy-transformer in your tsconfig compilerOptions.plugins?
```

## Core model

A document declaration describes one logical datastore-backed record family:

- `playerDocument<T>()` opens by `Player`.
- `document<T, Owner>()` opens by an arbitrary owner object.
- `sharedDocument<T>()` opens one fixed key.

Each declaration includes:

- `name` for labels and diagnostics
- `store` for the Roblox datastore name
- `key` or fixed shared key
- `default` factory
- generated runtime validator, or `unsafeCheckOverride`
- session lock options
- lifecycle options
- debug options

The transformer lowers declarations into `rovyData.__document(...)` metadata.
At runtime, datastore auto-installs when registered documents or datastore
injected params are present.

## Runtime mock backend

Use `DataStorePlugin` when a runtime should use an in-memory mock database
instead of backend datastore calls. This is runtime-only configuration; document
declarations do not change.

```ts
import { App } from "@rovy/core";
import { DataStorePlugin } from "@rovy/datastore";
import { Profile } from "./documents";

const app = new App();

app.addPlugin(
  new DataStorePlugin({
    mock: {
      data: {
        [Profile.id]: {
          "123": { coins: 500, level: 4, inventory: [] },
        },
      },
    },
  }),
);

app.start();
```

Pass `mock: true` to use default document data without any seed rows. Tests and
custom backends can also pass `adapter` to replace the backend boundary
directly.

## Player profile

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
  default: () => ({
    coins: 0,
    level: 1,
    inventory: [],
  }),
  session: {
    lock: true,
    stealOnSessionLocked: true,
  },
  lifecycle: {
    autoOpen: true,
    autoClose: true,
    kickOnOpenFailure: true,
  },
});
```

When `autoOpen` is enabled, Rovy enqueues an open request on `Players.PlayerAdded`.
When `autoClose` is enabled, Rovy enqueues a saving close on
`Players.PlayerRemoving`.

## Injected handles

Use type-only document handle params in systems, observers, monitors, and
prefab builds where external params are allowed.

```ts
import { system, type EventReader } from "@rovy/core";
import type { DocumentReader, DocumentWriter, DocumentOpener } from "@rovy/datastore";
import { Profile } from "./documents";

@system({ schedule: Update })
class AwardLoginCoins {
  run(profile: DocumentWriter<typeof Profile>) {
    for (const player of Players.GetPlayers()) {
      if (!profile.isOpen(player)) continue;

      profile.update(
        player,
        (data) => ({
          ...data,
          coins: data.coins + 25,
        }),
        { save: "immediate", reason: "login-bonus" },
      );
    }
  }
}

@system({ schedule: Update })
class ManualProfileOpen {
  run(opener: DocumentOpener<typeof Profile>) {
    for (const player of Players.GetPlayers()) {
      if (!opener.isOpen(player)) opener.open(player, { reason: "manual-open" });
    }
  }
}
```

### `DocumentReader<D>`

```ts
reader.get(owner);      // data | undefined
reader.require(owner);  // data, throws if closed
reader.has(owner);      // boolean
reader.status(owner);   // "closed" | "opening" | "open" | "saving" | "closing" | "failed"
reader.isOpen(owner);   // boolean
reader.keyOf(owner);    // resolved datastore key
```

### `DocumentWriter<D>`

`DocumentWriter` extends `DocumentReader`.

```ts
writer.update(owner, (data) => nextData, { save: "immediate", reason: "quest" });
writer.patch(owner, { coins: 100 }, { save: "autosave" });
writer.save(owner, { reason: "checkpoint" });
```

`update` and `patch` validate the new value before writing cache. Invalid data
returns `ValidationError` and does not enqueue a save.

### `DocumentOpener<D>`

```ts
opener.open(owner, { reason: "join" });
opener.close(owner, { save: true, reason: "leave" });
opener.reopen(owner, { reason: "retry" });
opener.status(owner);
opener.isOpen(owner);
opener.keyOf(owner);
```

Open, close, and save requests are queued. The datastore runtime installs a
`DataStoreSet` into each registered schedule and processes queued requests in
that set.

## Events

Every document gets generated lifecycle event constructors. Use typed event
interfaces from `@rovy/datastore`:

```ts
import { system, type EventReader } from "@rovy/core";
import type { DocumentChanged, DocumentOpenFailed, DocumentSaved } from "@rovy/datastore";
import { Profile } from "./documents";

@system({ schedule: Update })
class WatchProfileChanges {
  run(changes: EventReader<DocumentChanged<typeof Profile>>) {
    changes.forEach((event) => {
      print(event.key, event.before.coins, event.after.coins, event.reason);
    });
  }
}

@system({ schedule: Update })
class WatchProfileFailures {
  run(failures: EventReader<DocumentOpenFailed<typeof Profile>>) {
    failures.forEach((event) => {
      warn(event.key, event.reason, event.message);
    });
  }
}
```

Generated event types:

| Event type | When emitted |
| ---------- | ------------ |
| `DocumentOpened<D>` | backend open succeeds and data passes validation |
| `DocumentOpenFailed<D>` | backend open fails or loaded data fails validation |
| `DocumentChanged<D>` | cache update succeeds |
| `DocumentSaved<D>` | immediate/manual save succeeds |
| `DocumentSaveFailed<D>` | save or saving close fails |
| `DocumentClosed<D>` | close succeeds |

Failure reasons:

```ts
"SessionLockedError" |
"BackwardsCompatibilityError" |
"RobloxAPIError" |
"ValidationError" |
"NotOpen" |
"Closed" |
"Unknown"
```

Roblox datastore throttling, budget exhaustion, 429s, and service failures
should surface through `RobloxAPIError` from the adapter layer.

## Session locks and rate limits

The v1 runtime has a narrow backend boundary:

```ts
createStore(def)
getDocument(store, key)
open(document, options)
steal(document)
close(document, options)
getCache(document)
setCache(document, data)
save(document)
connectSignals(document, sink)
```

The shipped implementation uses an in-memory adapter for tests and local
runtime shape. The boundary is intentionally close to Roblox/DataStore-style
operations so a real Roblox backend or DocumentService-backed module can be
swapped in without changing system code.

Important runtime behavior:

- session lock failure with `stealOnSessionLocked` calls `steal(...)` once and retries open
- loaded data is validated before `DocumentOpened`
- update data is validated before cache write
- immediate saves enqueue `save(...)`
- close passes `save` and `reason` options to the backend
- failed open emits `DocumentOpenFailed`
- failed save or failed saving close emits `DocumentSaveFailed`
- close disconnects backend signals only after backend close succeeds
- queue processing drains pending opens, closes, and immediate saves each run

## Store ownership

Each document owns one central `store` name. Two document declarations cannot
register the same `store` string in one runtime:

```txt
[rovy/datastore] Duplicate DocumentStore for store PlayerData. Stores must be centralized.
```

This avoids split ownership over one Roblox datastore. Put related fields in
one document or deliberately choose distinct store names.

## Shared and keyed documents

Use `sharedDocument` for one fixed global key:

```ts
export const GlobalConfig = sharedDocument<{ season: string }>()({
  name: "GlobalConfig",
  store: "GlobalConfig",
  key: "live",
  default: () => ({ season: "alpha" }),
  session: { lock: false },
  lifecycle: { autoOpen: true, autoClose: true },
});
```

Use `document<T, Owner>()` when owner is not a Roblox `Player`:

```ts
interface GuildOwner {
  guildId: string;
}

export const GuildState = document<{ xp: number }, GuildOwner>()({
  name: "GuildState",
  store: "GuildState",
  key: (owner) => owner.guildId,
  default: () => ({ xp: 0 }),
  lifecycle: {
    autoOpen: false,
    autoClose: false,
  },
});
```

## See also

- [Packages Overview](/packages/packages)
- [Installation](/guide/installation)
- [Systems and Injection](/concepts/systems-and-injection)
- [API Reference](/reference/api)
