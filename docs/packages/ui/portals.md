# Rovy UI Portals

Portals render part of one retained UI tree under a different Roblox Instance.
They are the normal way to drive world-space UI such as unit nameplates,
interaction prompts, and in-world displays from one ECS-aware root.

```ts
function portal(
	target: Instance,
	children?: UiChildren,
	options?: { readonly key?: string | number },
): UiNode;
```

The portal owns the rendered children, but it does not own `target`. Removing a
portal or destroying its root destroys its rendered subtree and leaves the
target Instance alone.

## Unit info above heads

This root tracks every entity with a head and health value. Each entity gets a
keyed portal whose `BillboardGui` is parented to that unit's head.

```ts
import { component, Entity, type Query } from "@rovy/core";
import {
	$queryTrigger,
	billboardGui,
	fragment,
	portal,
	textLabel,
	type UiNode,
	ui,
} from "@rovy/ui";

@component
class UnitHead {
	constructor(readonly part: BasePart) {}
}

@component
class Health {
	constructor(readonly current = 100, readonly maximum = 100) {}
}

@ui
class UnitOverlays {
	static rerender = [
		$queryTrigger<[Entity, UnitHead, Health]>(),
	];

	render(units: Query<[Entity, UnitHead, Health]>) {
		const overlays = new Array<UiNode>();

		units.forEach((entity, unit, health) => {
			overlays.push(portal(
				unit.part,
				billboardGui(
					{
						Name: `UnitInfo_${entity}`,
						Adornee: unit.part,
						AlwaysOnTop: true,
						Size: UDim2.fromOffset(140, 36),
						StudsOffsetWorldSpace: new Vector3(0, 3, 0),
					},
					textLabel({
						BackgroundTransparency: 1,
						Size: UDim2.fromScale(1, 1),
						Text: `${health.current} / ${health.maximum}`,
						TextScaled: true,
					}),
				),
				{ key: entity },
			));
		});

		return fragment(overlays);
	}
}

app.mount(UnitOverlays, game.GetService("Workspace"));
```

The entity key connects each old portal to its next render:

- a new matching unit mounts a new `BillboardGui`;
- a health change patches the existing label;
- removing the unit from the query destroys its portal subtree;
- replacing the unit's head moves the retained subtree to the new target.

The `Workspace` target above is only the logical root parent. All rendered
Instances are redirected by portals.

## Existing BillboardGui or SurfaceGui targets

A portal can render directly inside a GUI collector created elsewhere:

```ts
return fragment([
	portal(existingBillboardGui, child(UnitTag, { entity }), { key: entity }),
	portal(existingSurfaceGui, child(TerminalPanel, { terminal }), { key: terminal.id }),
]);
```

When either portal disappears, Rovy destroys `UnitTag` or `TerminalPanel` and
their native children. It does not destroy `existingBillboardGui` or
`existingSurfaceGui`.

Rovy can own the GUI collector instead by placing a host factory inside a portal:

```ts
portal(displayPart, surfaceGui({
	Adornee: displayPart,
	Face: Enum.NormalId.Front,
	PixelsPerStud: 50,
}, child(TerminalPanel, { terminal })));
```

In that form, removing the portal also destroys the Rovy-created `SurfaceGui`.
The same pattern works with `screenGui(...)` and `billboardGui(...)`.

## Independent runtime roots

Use `mountUi(...)` after `app.start()` when a UI needs a separate lifetime rather
than reconciliation inside an existing root:

```ts
import { mountUi } from "@rovy/ui";

const billboard = new Instance("BillboardGui");
billboard.Adornee = head;
billboard.Parent = head;

const handle = mountUi(app, UnitTag, {
	target: billboard,
	props: { entity },
});

// When the unit-owned lifetime ends:
handle.destroy();
```

Each call creates an independent retained root and returns its own destroy
handle. Prefer a keyed portal list when one query-driven root already owns the
collection; use independent runtime roots when another system naturally owns
each lifetime.
