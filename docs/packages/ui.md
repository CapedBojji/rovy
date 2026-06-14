# Rovy UI

`@rovy/ui` is Rovy's TypeScript-authored immediate UI package for Roblox. It gives you function-first widgets, stable callsite-scoped state, and a small built-in catalog for tools, debug windows, UI Labs stories, and in-game editor surfaces.

It is intentionally:

- Roblox TS authored
- immediate-mode and function-first
- scoped by widget callsite identity
- compatible with custom `/** @widget */` functions
- independent from `@rbxts/egooe`

It is not a React clone, a widget-class framework, or a Lua-authored public API. EgooE and Plasma are behavior references; Rovy owns the runtime and transformer contract.

## Start Here

```ts
import RovyUi from "@rovy/ui";

const root = RovyUi.new(screenGui);

RovyUi.start(root, () => {
	RovyUi.window({ title: "Inventory", size: new Vector2(320, 260) }, () => {
		RovyUi.label("Backpack");
		if (RovyUi.button("Sort").clicked()) sortInventory();
	});
});
```

Use the child pages for the actual docs:

- [Getting Started](/packages/ui/getting-started) - install, frame lifecycle, UI Labs input adapter
- [Built-in Widgets](/packages/ui/built-in-widgets) - windows, controls, layout, tables, popups, editable images
- [Curve Editor](/packages/ui/curve-editor) - infinite canvas, scoped paths, Bezier handles, context controls
- [API Reference](/packages/ui/api-reference) - exported runtime helpers and public types
- [Styling](/packages/ui/styling) - style tokens, `StyleScope`, and custom themes
- [Custom Widgets](/packages/ui/custom-widgets) - `/** @widget */`, state helpers, callsite identity

## Package Shape

`@rovy/ui` is a separate runtime package, parallel to `@rovy/networking` and `@rovy/datastore`.

- `@rovy/core` stays the ECS/runtime package
- `@rovy/networking` stays the net-event package
- `@rovy/datastore` stays the persistent document package
- `@rovy/ui` owns immediate UI rendering and widgets
- `rovy-transformer` handles compile-time widget lowering

The public authoring story stays TypeScript-authored even though roblox-ts emits Luau.

## Source Layout

```txt
packages/ui/src/
  index.ts                public surface, re-exports, default RovyUi object
  runtime.ts              root nodes, frames, scope, state/effect/instance helpers
  input.ts                injectable input adapter for UI Labs/plugin viewports
  style.ts                Style interface, defaults, style scopes
  primitives.ts           c(), v2(), udim(), udim2()
  create.ts               Instance creation helper
  editable-image-buffer.ts RGBA draw buffer for EditableImage widgets
  widgets/
    button.ts             checkbox.ts          radio-button.ts
    toggle.ts             label.ts             heading.ts
    separator.ts          space.ts             row.ts
    window.ts             child-window.ts      modal.ts
    popup.ts              portal.ts            slider.ts
    drag-value.ts         input.ts             combo-box.ts
    progress-bar.ts       collapsing-header.ts editable-image.ts
    table.ts              table-row.ts         table-cell.ts
    table-explorer.ts     demo-window.ts       curve-editor.ts
```

## When To Use It

Use `@rovy/ui` when you want an immediate tool surface: debug panels, inspectors, UI Labs stories, editor widgets, in-game admin views, or game UI that benefits from simple frame-by-frame declaration.

For normal gameplay HUDs, it is still useful when you want Rovy's state and widget composition model. For highly animated bespoke production UI, you can mix it with hand-authored Roblox GUI code through `useInstance`, `portal`, and `create`.

## Related Packages

- [Packages Overview](/packages/packages)
- [World Inspector](/packages/world-inspector), which uses `@rovy/ui`
- [Transformer](/runtime/transformer), which lowers custom widget calls
