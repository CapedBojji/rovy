# `@rovy/vide`

Reactive UI integration between [Rovy](https://github.com/CapedBojji/rovy) and
[Vide](https://centau.github.io/vide/).

Gameplay UI gets a class-decorated, ECS-aware authoring surface while mounting
stays explicit. Use it when UI should react to Rovy world state: HUD roots,
render signatures that declare ECS data needs, query row sources, monitor
streams for enter/change/exit, and event-driven feeds such as combat logs.

`@rovy/vide` is the production reactive path.
[`@rovy/imgui`](https://www.npmjs.com/package/@rovy/imgui) remains the
immediate-mode widget/tool surface, and
[`@rovy/ui`](https://www.npmjs.com/package/@rovy/ui) the retained class-based one.

## Install

```sh
npm i @rovy/core @rovy/vide @rbxts/vide
```

## Example

```ts
import Vide from "@rbxts/vide";
import { App, type Res } from "@rovy/core";
import { mountView, view } from "@rovy/vide";

class GameClock {
  constructor(public tick = 0) {}
}

@view()
class HudView {
  render(clock: Res<GameClock>): Frame {
    return Vide.create("TextLabel", {
      BackgroundTransparency: 1,
      Size: UDim2.fromScale(1, 1),
      Text: () => `Tick ${clock.tick}`,
    });
  }
}

const app = new App();
app.start();

const handle = mountView(app, HudView);
```

`mountView(app, HudView)` creates a Vide root scope. With no `target`, Rovy
creates a `ScreenGui`, parents it to `Players.LocalPlayer.PlayerGui` when
available, and destroys it on unmount. `handle.destroy()` — or
`unmountView(handle)` — tears it down.

View classes expose one public `render(...)` method. The render signature
declares what the view needs, and Rovy injects source-backed facades — `Res<T>`,
`Query<...>`, `ViewMonitor<...>`, `EventReader<E>` — so Vide re-runs reactive
reads.

`@view` is transformer-backed; the decorator is imported from `@rovy/vide` but
the transformer injects the runtime registration call.

## Documentation

<https://capedbojji.github.io/rovy/packages/vide>

## License

MIT
