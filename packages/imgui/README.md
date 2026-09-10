# `@rovy/imgui`

Function-first immediate-mode UI for
[Rovy](https://github.com/CapedBojji/rovy) — widgets, stable callsite-scoped
state, and a built-in catalog for tools, debug windows, UI Labs stories, and
in-game editor surfaces.

It is intentionally:

- roblox-ts authored
- immediate-mode and function-first
- scoped by widget callsite identity
- compatible with custom `/** @widget */` functions

It is not a React clone, a widget-class framework, or a Lua-authored public API.
For reactive production UI use
[`@rovy/vide`](https://www.npmjs.com/package/@rovy/vide); for retained
class-based UI use [`@rovy/ui`](https://www.npmjs.com/package/@rovy/ui).

## Install

```sh
npm i @rovy/core @rovy/imgui
```

## Example

```ts
import RovyUi from "@rovy/imgui";

const root = RovyUi.new(screenGui);

RovyUi.start(root, () => {
  RovyUi.window({ title: "Inventory", size: new Vector2(320, 260) }, () => {
    RovyUi.label("Backpack");
    if (RovyUi.button("Sort").clicked()) sortInventory();
  });
});
```

## Widget catalog

Windows, child windows, modals, popups, and portals; buttons, checkboxes, radio
buttons, toggles, selectable and clickable labels, headings, separators, and
spacers; sliders, drag values, text inputs, combo boxes, progress bars, and
collapsing headers; tables with rows, cells, and a table explorer; an editable
image widget with an RGBA draw buffer; a Bezier curve editor; and a demo window.

Style tokens and `StyleScope` drive theming. `input.ts` exposes an injectable
input adapter for UI Labs and plugin viewports.

## Documentation

<https://capedbojji.github.io/rovy/packages/imgui>

## License

MIT
