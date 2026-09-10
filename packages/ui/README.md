# `@rovy/ui`

Retained, class-based Roblox UI for
[Rovy](https://github.com/CapedBojji/rovy) — UI components that live inside the
same decorator and injection model as the rest of your game code.

An `@ui` class is a component, not necessarily a root. The root is the one
component you pass to `app.mount(...)` or `mountUi(...)`.

| Package | Use it for |
| --- | --- |
| `@rovy/ui` | persistent Roblox Instance trees from nested `@ui` components |
| [`@rovy/vide`](https://www.npmjs.com/package/@rovy/vide) | reactive Vide views |
| [`@rovy/imgui`](https://www.npmjs.com/package/@rovy/imgui) | immediate-mode debug and tool widgets |

## Install

```sh
npm i @rovy/core @rovy/ui
```

## Example

```ts
import { App } from "@rovy/core";
import { frame, textLabel, ui } from "@rovy/ui";

@ui
class RootHud {
  render() {
    return frame(
      {
        Name: "RootHud",
        BackgroundColor3: Color3.fromRGB(24, 28, 35),
        Size: UDim2.fromOffset(280, 72),
      },
      textLabel({
        BackgroundTransparency: 1,
        Size: UDim2.fromScale(1, 1),
        Text: "Hello from Rovy UI",
      }),
    );
  }
}

const app = new App();
app.mount(RootHud);
app.start();
```

`app.mount(...)` must be called **before** `app.start()`; `@rovy/ui` consumes
the queued mount request after startup so render params can use the same
injection descriptors as systems.

JSX is supported as an alternative to the factory functions — see the
[JSX guide](https://capedbojji.github.io/rovy/packages/ui/jsx).

## Documentation

<https://capedbojji.github.io/rovy/packages/ui>

## License

MIT
