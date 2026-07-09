# Rovy UI Compiled Output

`@rovy/ui` is transformer-backed. The authored TypeScript stays small, but the
transformer injects registration metadata and stable identity fields before
roblox-ts emits Luau.

## Simple component

Source:

```ts
import { frame, textLabel, ui } from "@rovy/ui";

@ui
export class TemplateUi {
	render() {
		return frame(
			{
				Name: "TemplateHud",
				Size: UDim2.fromOffset(280, 72),
			},
			textLabel({
				BackgroundTransparency: 1,
				Text: "Rovy UI",
			}),
		);
	}
}
```

Compiled Luau shape:

```luau
local __rovyUi = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rovy", "ui", "out").default
local _ui = TS.import(script, game:GetService("ReplicatedStorage"), "rbxts_include", "node_modules", "@rovy", "ui", "out")
local frame = _ui.frame
local textLabel = _ui.textLabel

local TemplateUi
do
	TemplateUi = setmetatable({}, {
		__tostring = function()
			return "TemplateUi"
		end,
	})
	TemplateUi.__index = TemplateUi
	function TemplateUi.new(...)
		local self = setmetatable({}, TemplateUi)
		return self:constructor(...) or self
	end
	function TemplateUi:constructor()
	end
	function TemplateUi:render()
		return frame({
			Name = "TemplateHud",
			Size = UDim2.fromOffset(280, 72),
			__callsite = "src/client/ui/template-ui:ui:1",
		}, textLabel({
			BackgroundTransparency = 1,
			Text = "Rovy UI",
			__callsite = "src/client/ui/template-ui:ui:0",
		}))
	end
end

__rovyUi:__ui(TemplateUi, {
	id = "src/client/ui/template-ui@TemplateUi",
	methods = { "render" },
	params = {},
	triggers = {},
})
```

Important details:

- `@ui` itself is erased.
- The class still compiles as a normal roblox-ts class.
- The transformer adds `__rovyUi:__ui(...)` as a module side effect.
- Factory calls receive `__callsite` ids. These ids give unkeyed children stable
  identity across rerenders.

## Render params and triggers

Source:

```ts
import { resource, type Res } from "@rovy/core";
import { $resourceTrigger, frame, textLabel, ui } from "@rovy/ui";

@resource
class TemplateState {
	constructor(public serverTicks = 0, public clientTicks = 0) {}
}

@ui
export class TemplatePluginUi {
	static rerender = [$resourceTrigger(TemplateState)];

	render(state: Res<TemplateState>) {
		return frame(
			{ Name: "TemplatePluginUi" },
			textLabel({
				Text: `server ${state.serverTicks} / client ${state.clientTicks}`,
			}),
		);
	}
}
```

Compiled Luau shape:

```luau
__rovy:__resource(TemplateState, "index@TemplateState", {
	plugin = TemplatePlugin,
})

local TemplatePluginUi
do
	TemplatePluginUi = setmetatable({}, {
		__tostring = function()
			return "TemplatePluginUi"
		end,
	})
	TemplatePluginUi.__index = TemplatePluginUi
	function TemplatePluginUi.new(...)
		local self = setmetatable({}, TemplatePluginUi)
		return self:constructor(...) or self
	end
	function TemplatePluginUi:constructor()
	end
	function TemplatePluginUi:render(state)
		return frame({
			Name = "TemplatePluginUi",
			__callsite = "src/index:ui:1",
		}, textLabel({
			Text = `server {state.serverTicks} / client {state.clientTicks}`,
			__callsite = "src/index:ui:0",
		}))
	end
end

__rovyUi:__ui(TemplatePluginUi, {
	id = "index@TemplatePluginUi",
	methods = { "render" },
	params = { {
		kind = "res",
		ctor = TemplateState,
	} },
	triggers = { {
		kind = "resource",
		ctor = TemplateState,
	} },
})
```

The `params` array is what lets `@rovy/ui` resolve `state` before calling
`render(state)`. The `triggers` array is what tells `@rovy/ui` to subscribe to
`TemplateState` changes and mark this component dirty.

These arrays are independent. A render param reads data during render; a trigger
subscribes the component to future changes. See [Render Injection](/packages/ui/render-injection).

For a prop-scoped query trigger:

```ts
static rerender = [
	$queryTrigger<[Entity, Health]>({
		entities: $prop<ReadonlyArray<Entity>>("entities"),
		on: ["changed", "removed"],
	}),
];
```

The trigger descriptor includes the lowered binding:

```luau
triggers = { {
	kind = "query",
	handle = "src/main@RosterRows:rerender:0",
	entities = { kind = "prop", key = "entities" },
	on = { "changed", "removed" },
} }
```

## Query trigger lowering

Source:

```ts
@ui
class InventoryRoot {
	static rerender = [
		$queryTrigger<[Entity, Health], With<Visible>>({
			on: ["added", "changed", "removed"],
		}),
	];

	render(items: Query<[Entity, Health], With<Visible>>) {
		return textLabel({ Text: `${items.size()} items` });
	}
}
```

Conceptual emitted metadata:

```luau
__rovy:__query({
	id = "src/main@InventoryRoot:rerender:0",
	terms = {
		{ kind = "component", ctor = Health },
		{ kind = "with", ctor = Visible },
	},
})

__rovyUi:__ui(InventoryRoot, {
	id = "src/main@InventoryRoot",
	methods = { "render" },
	params = { {
		kind = "query",
		handle = "src/main@InventoryRoot:0",
	} },
	triggers = { {
		kind = "query",
		handle = "src/main@InventoryRoot:rerender:0",
		on = { "added", "changed", "removed" },
	} },
})
```

The render query and the rerender trigger query can have different handles. That
lets a component read one set of params while subscribing to the exact change set
that should refresh the UI.

## Child component lowering

Source:

```ts
import { child, frame, textLabel, type Props, ui } from "@rovy/ui";

interface BadgeProps {
	readonly text: string;
}

@ui
class Badge {
	constructor(readonly props: Props<BadgeProps>) {}

	render() {
		return textLabel({ Text: this.props.text });
	}
}

@ui
class Root {
	render() {
		return frame({}, [
			child(Badge, { text: "Ready" }, { key: "status" }),
		]);
	}
}
```

Conceptual emitted shape:

```luau
local child = _ui.child

function Badge:render()
	return textLabel({
		Text = self.props.text,
		__callsite = "src/main:ui:0",
	})
end

__rovyUi:__ui(Badge, {
	id = "src/main@Badge",
	methods = { "render" },
	params = {},
	triggers = {},
})

function Root:render()
	return frame({
		__callsite = "src/main:ui:2",
	}, { child(Badge, {
		text = "Ready",
	}, {
		key = "status",
		__callsite = "src/main:ui:1",
	}) })
end

__rovyUi:__ui(Root, {
	id = "src/main@Root",
	methods = { "render" },
	params = {},
	triggers = {},
})
```

Both classes are registered, but only `Root` is a root if application code mounts
`Root`. `Badge` is a component node inside `Root`'s returned tree. During
reconciliation, the runtime uses component class plus `key` or `__callsite` to
decide whether to reuse the existing `Badge` instance.

## JSX lowering

`@rovy/ui` also accepts JSX when `jsxFactory` and `jsxFragmentFactory` point at
the package's JSX helpers.

Source:

```tsx
@ui
class Root {
	render() {
		return <frame key="root"><Label /></frame>;
	}
}
```

Conceptual emitted calls:

```ts
return RetainedUi.native("Frame", {
	__callsite: "src/main:ui:1",
	key: "root",
}, RetainedUi.child(Label, {}, {
	__callsite: "src/main:ui:0",
}));
```

JSX is only syntax sugar. The runtime still receives the same `native(...)`,
`child(...)`, and `fragment(...)` node descriptions.

## JSX children lowering

Component children are lowered into a normal `children` prop, so wrapper
components can feel React-like while staying explicit at runtime.

Source:

```tsx
@ui
class Panel {
	constructor(readonly props: Props<{ children?: UiChildren }>) {}

	render() {
		return frame({}, fragment(this.props.children));
	}
}

@ui
class Root {
	render() {
		return (
			<Panel>
				<Badge key="sword" text="Sword" />
				<Badge key="shield" text="Shield" />
			</Panel>
		);
	}
}
```

Conceptual emitted calls:

```ts
return RetainedUi.child(Panel, {
	children: [
		RetainedUi.child(Badge, { text: "Sword" }, {
			__callsite: "src/main:ui:0",
			key: "sword",
		}),
		RetainedUi.child(Badge, { text: "Shield" }, {
			__callsite: "src/main:ui:1",
			key: "shield",
		}),
	],
}, {
	__callsite: "src/main:ui:2",
});
```

The runtime does not treat `children` specially for component nodes. It is just
props. The wrapper component decides where to render those children, commonly by
returning `fragment(this.props.children)`.

`key` is not passed through component props. JSX lowers it into the child node's
identity options, matching React's mental model.
