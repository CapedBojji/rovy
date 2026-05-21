# Compiled Output

What the transformer emits per construct: **source → compiled Luau + injected registration call**. For how the runtime then *uses* these registrations see [Runtime lifecycle](/runtime/lifecycle.md).

roblox-ts compiles TS to Luau. Decorators and type annotations are erased. The transformer runs at build time, then for each decorated class it:

1. Emits the normal Luau class body (roblox-ts standard emission)
2. Hoists any `Query<...>` / `query<...>()` to a module-level descriptor
3. Injects a `rovy.__*` registration call right after the class

These calls run as **module side effects** when the module is required. `rovy.loadPaths(...)` forces the requires; `app.start()` finalizes. No central manifest module.

`@rovy/ui` widget lowering follows the same idea: source authoring stays in TypeScript, the transformer injects registration/wrapping code, and later plain widget calls carry stable callsite identity. See [UI](/packages/ui.md).

---

## Components

```ts
@component
class Position {
    constructor(public cell: Vector2, public facingAngle: number) {}
}

@component
class Dead {}
```

Compiled:

```luau
local Position = {}
Position.__index = Position
function Position.new(cell, facingAngle)
    return setmetatable({ cell = cell, facingAngle = facingAngle }, Position)
end
rovy.__component(Position, "src/components/Position")

local Dead = {}
Dead.__index = Dead
function Dead.new() return setmetatable({}, Dead) end
rovy.__component(Dead, "src/components/Dead")
```

`rovy.__component` pushes `{ ctor, id }` into the component registry. No jecs ID yet — that happens at `app.start()`.

---

## Resources

```ts
@resource
class BattleClock {
    constructor(public tick = 0, public delta = 1 / 30) {}
}
```

Compiled:

```luau
local BattleClock = {}
BattleClock.__index = BattleClock
function BattleClock.new(tick, delta)
    tick = tick or 0
    delta = delta or (1 / 30)
    return setmetatable({ tick = tick, delta = delta }, BattleClock)
end
rovy.__resource(BattleClock, "src/resources/BattleClock")
```

Default constructor required. At finalize, `app.start()` calls `BattleClock.new()` and stores it on the resource entity. `app.insertResource(BattleClock.new(100, 1/60))` overrides the default.

---

## Collectors

```ts
@collect
class FireWeaponCollect extends Collector<string> {
    constructor() {
        super();
    }
}
```

Compiled:

```luau
local FireWeaponCollect = {}
FireWeaponCollect.__index = FireWeaponCollect
function FireWeaponCollect.new()
    return setmetatable(Collector.new(), FireWeaponCollect)
end
rovy.__collect(FireWeaponCollect, "src/collectors/FireWeaponCollect")
```

`rovy.__collect` pushes `{ ctor, id }` into the collector registry. At finalize, `app.start()` instantiates the collector once and later injects that singleton anywhere `FireWeaponCollect` appears as a system, observer, or monitor param type.

Authoring note: the meaningful collector structure is the queue plus constructor hookup code. `Collector<T>` provides `drain()` already, so authored collector classes should usually only extend the base and call `enqueue(...)`.

---

## Prefabs

> Planned surface. This section documents the intended compiled shape, not shipped behavior yet.

```ts
@prefab
class SlimePrefab extends Prefab {
    build(commands: Commands, clock: Res<BattleClock>): Entity {
        const entity = this.entity();
        commands.insert(entity, Unit);
        commands.set(entity, SpawnTick, new SpawnTick(clock.tick));
        return entity;
    }
}
```

Planned compiled shape:

```luau
local SlimePrefab = {}
SlimePrefab.__index = SlimePrefab
function SlimePrefab.new()
    return setmetatable(Prefab.new(), SlimePrefab)
end
function SlimePrefab:build(commands, clock)
    local entity = self:entity()
    commands:insert(entity, Unit)
    commands:set(entity, SpawnTick.new(clock.tick))
    return entity
end
rovy.__prefab(SlimePrefab, {
    id = "src/prefabs/SlimePrefab",
    params = {
        { kind = "commands" },
        { kind = "res", ctor = BattleClock },
    },
})
```

Unlike systems, prefab registration does not include schedule/set metadata. It only carries the stable id plus the lowered `build(...)` param descriptor list.

---

## Events

```ts
@event({ capacity: 256 })
class DamageTaken {
    constructor(public target: Entity, public amount: number, public source?: Entity) {}
}
```

Compiled:

```luau
local DamageTaken = {}
DamageTaken.__index = DamageTaken
function DamageTaken.new(target, amount, source)
    return setmetatable({ target = target, amount = amount, source = source }, DamageTaken)
end
rovy.__event(DamageTaken, { capacity = 256 })
```

---

## Widgets

Source:

```ts
/** @widget */
export function Window(style: Style, props: { title: string }): void {
	print(style.windowBgColor, props.title);
}

export function draw() {
	Window({ title: "Inventory" });
}
```

Conceptual compiled shape:

```ts
const Window = RovyUi.__widget(function Window(props: { title: string }): void {
	const style = RovyUi.getActiveStyle();
	print(style.windowBgColor, props.title);
}, {
	id: "src/ui/Window@Window",
	name: "Window",
});

function draw() {
	RovyUi.__scope("src/ui/Window:0", () => Window({ title: "Inventory" }));
}
```

Scoped style source:

```ts
StyleScope(
	{
		patch: { textColor: Color3.fromRGB(255, 220, 120) },
		discriminator: item.id,
	},
	() => {
		Label({ text: "Rare Item" });
	},
);
```

Conceptual runtime lowering:

```ts
RovyUi.withStyleScope(
	{
		patch: { textColor: Color3.fromRGB(255, 220, 120) },
		discriminator: item.id,
	},
	() => {
		Label({ text: "Rare Item" });
	},
);
```

Inside the callback, widgets see the merged active style from `RovyUi.getActiveStyle()`. When the callback exits, the previous active style is visible again.

The key contract points are:

- public authoring stays as one JSDoc-tagged TS function
- `style: Style` is removed from the runtime call signature
- lowered widget bodies read `RovyUi.getActiveStyle()` first
- authored `Window(...)` calls lower through `RovyUi.__scope(...)` so widget storage has stable callsite identity
- `RovyUi.__widget(...)` registers metadata and returns the wrapped callable
- style scope is callback-bounded and temporary
- style does not travel through widget registration metadata
- `useState` and `useEffect` use callsite-scoped widget storage

---

## Systems — query hoisting + registration

```ts
@system({ schedule: Update, set: MovementSet, after: [FaceTargets] })
class MoveUnits {
    run(
        commands: Commands,
        units: Query<[Entity, Position, Velocity], Without<Dead>>,
        clock: Res<BattleClock>,
    ) {
        units.forEach((entity, pos, vel) => {
            commands.set(entity, Position, new Position(pos.cell.add(vel.dir), pos.facingAngle));
        });
    }
}
```

Compiled — three pieces:

```luau
-- 1. hoisted query descriptor (lazy: resolved to jecs query at start)
local _q_MoveUnits_0 = rovy.__query("src/systems/MoveUnits:0",
    { Position, Velocity }, { without = { Dead } })

-- 2. class body unchanged
local MoveUnits = {}
MoveUnits.__index = MoveUnits
function MoveUnits.new() return setmetatable({}, MoveUnits) end
function MoveUnits:run(commands, units, clock)
    for entity, pos, vel in units do
        commands:set(entity, Position, Position.new(pos.cell + vel.dir, pos.facingAngle))
    end
end

-- 3. registration with resolved param descriptors
rovy.__system(MoveUnits, {
    id = "src/systems/MoveUnits",
    schedule = Update,
    set = MovementSet,
    after = { FaceTargets },
    before = {},
    params = {
        { kind = "commands" },
        { kind = "query", handle = _q_MoveUnits_0 },
        { kind = "res", ctor = BattleClock },
    },
})
```

`Entity` is stripped from the jecs query args (jecs returns it free per row) but kept in binding order. The transformer reads `run`'s param types and emits the `params` descriptor list — the runtime never reflects.

---

## Observers

```ts
@observer({ event: DamageTaken, priority: 0 })
class ApplyDamage {
    run(event: DamageTaken, commands: Commands, world: World) { ... }
}
```

Compiled:

```luau
local ApplyDamage = {}
ApplyDamage.__index = ApplyDamage
function ApplyDamage.new() return setmetatable({}, ApplyDamage) end
function ApplyDamage:run(event, commands, world) ... end

rovy.__observer(ApplyDamage, {
    event = DamageTaken,
    priority = 0,
    params = {
        { kind = "event" },
        { kind = "commands" },
        { kind = "world" },
    },
})
```

---

## Monitors — query macro rewrite + registration

```ts
@monitor({ match: query<[Health, Position], With<Unit>, Without<Dead>>() })
class ValidTargetMonitor {
    onEnter(entity: Entity, health: Health, position: Position, commands: Commands) {}
    onExit(entity: Entity, health: Health, position: Position, commands: Commands) {}
}
```

Compiled — `query<...>()` macro becomes a hoisted descriptor:

```luau
local _mq_ValidTargetMonitor = rovy.__query("src/monitors/ValidTargetMonitor:match",
    { Health, Position }, { with = { Unit }, without = { Dead } })

local ValidTargetMonitor = {}
ValidTargetMonitor.__index = ValidTargetMonitor
function ValidTargetMonitor.new() return setmetatable({}, ValidTargetMonitor) end
function ValidTargetMonitor:onEnter(entity, health, position, commands) end
function ValidTargetMonitor:onExit(entity, health, position, commands) end

rovy.__monitor(ValidTargetMonitor, {
    match = _mq_ValidTargetMonitor,
    methods = { "onEnter", "onExit" },
    params = { { kind = "entity" }, { kind = "term", index = 1 },
               { kind = "term", index = 2 }, { kind = "commands" } },
})
```

Hook wiring (archetype tracking, `world:added/removed/changed`) is deferred to finalize — see [Runtime lifecycle § Monitors](/runtime/lifecycle.md#monitors).

---

## Traits

```ts
interface CrowdControl {
    blocksCasting(): boolean;
    blocksMovement(): boolean;
}

@component
class Stunned implements CrowdControl {
    blocksCasting() { return true; }
    blocksMovement() { return true; }
}
```

Interface erased. `implements` clause erased — but transformer injects an extra trait-impl registration:

```luau
local Stunned = {}
Stunned.__index = Stunned
function Stunned.new() return setmetatable({}, Stunned) end
function Stunned:blocksCasting() return true end
function Stunned:blocksMovement() return true end

rovy.__component(Stunned, "src/components/Stunned")
rovy.__traitImpl("src/traits/CrowdControl", Stunned)
```

Stable trait ID = canonical module path of the interface. `rovy.__traitImpl` appends `Stunned` to that trait's implementer list.

### `trait<T>()` macro (value position)

```ts
const token = trait<CrowdControl>();
```

```luau
local token = rovy.traitToken("src/traits/CrowdControl")
```

Returns a handle that indexes the trait registry by stable path.

### `Trait<T>` in query (type position)

```ts
run(q: Query<[Entity, Trait<CrowdControl>]>) { ... }
```

Transformer expands to one hoisted sub-query per implementer + a unified handle:

```luau
local _q_System_0 = rovy.__traitQuery("src/systems/System:0", "src/traits/CrowdControl")
```

`rovy.__traitQuery` resolves at finalize to N jecs sub-queries (one per registered implementer), wrapped in a `TraitQueryHandle`. See [Runtime lifecycle § Traits](/runtime/lifecycle.md#traits).

---

## Change detection filters

```ts
run(q: Query<[Entity, Health], Changed<Health>>) { ... }
```

The tick filter is not a jecs query feature. Transformer hoists the base query and records the filter on the param descriptor:

```luau
local _q_System_0 = rovy.__query("src/systems/System:0", { Health }, {})

rovy.__system(System, {
    id = "src/systems/System",
    params = {
        { kind = "entity" },
        { kind = "query", handle = _q_System_0, filters = {
            { type = "changed", ctor = Health },
        } },
    },
})
```

Runtime applies the tick check during iteration — see [Runtime lifecycle § Change detection](/runtime/lifecycle.md#change-detection).

---

## Boot — loadPaths + start

No `app.addMetadata(...)`. Modules self-register via injected side effects; you only force the requires and finalize.

```ts
const app = new App();
app.addPlugin(BattlePlugin);          // configures sets, custom schedules

rovy.loadPaths(                       // authored TS strings
    "src/client/components",
    "src/client/resources",
    "src/client/systems",
    "src/client/observers",
    "src/client/monitors",
);

app.start();                          // finalize + fire runOnStart schedules

RunService.Heartbeat.Connect(() => {
    world.runSchedule(Update);
});
```

Compiled boot (conceptual):

```luau
local app = App.new()
app:addPlugin(BattlePlugin)

-- transformer lowers string paths to Roblox Instance roots
rovy.loadPaths(
    script.Parent.components,
    script.Parent.resources,
    script.Parent.systems,
    script.Parent.observers,
    script.Parent.monitors
)
-- every required module ran its rovy.__component / __system / __observer / ...
-- every required module ran its rovy.__component / __collect / __system / __observer / ...
-- registries now fully populated

app:start()
-- finalize pass: see Runtime lifecycle § Finalize

RunService.Heartbeat:Connect(function()
    world:runSchedule(Update)
end)
```

`rovy.loadPaths` before `app.start()` is mandatory — start over empty registries errors. TS authoring passes strings; compiled Luau receives Instance roots.

---

## Summary — erased vs remains

| TS construct | At Luau runtime |
|-------------|-----------------|
| `@component` / `@collect` / `@resource` / ... decorators | Erased. Replaced by an injected `rovy.__*` call. |
| `implements CrowdControl` | Erased. Replaced by `rovy.__traitImpl(id, C)`. |
| `Query<[Entity, Health], Without<Dead>>` type | Erased. Hoisted `rovy.__query(...)` + param descriptor. |
| `trait<T>()` macro | Replaced → `rovy.traitToken("stable/path")` |
| `query<...>()` macro | Replaced → hoisted `rovy.__query(...)` descriptor |
| `Res<T>` / `Commands` param types | Erased. Param kind in the `__system`/`__observer` descriptor. |
| Class body (`run`, `onEnter`, ...) | Preserved (standard roblox-ts emission) |

The transformer's job ends at injecting these calls. What happens when they run, and when `app.start()` finalizes them, is [Runtime lifecycle](/runtime/lifecycle.md).

## See also

- [Packages](/packages/packages.md)
- [Transformer](/runtime/transformer.md)
- [Runtime lifecycle](/runtime/lifecycle.md)
- [Systems and injection](/concepts/systems-and-injection.md)
- [Monitors](/concepts/monitors.md)
