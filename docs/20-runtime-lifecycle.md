# Runtime Lifecycle

How the runtime finds, finalizes, and uses every registered construct. Pairs with [Compiled output](19-compiled-output.md), which covers what the transformer emits.

Three phases:

1. **Register** — `rovy.__*` side-effect calls run as modules load (forced by `rovy.loadPaths`). Pure data push into global registries.
2. **Finalize** — `app.start()` walks the registries: allocates jecs IDs, installs hooks, sorts observers, auto-instantiates resources, wires monitors, builds schedules.
3. **Run** — `world.runSchedule(X)` per frame: resolve params, iterate queries, dispatch, flush.

---

## Phase 1 — Registration

Each `rovy.__*` call only appends to a registry. No jecs calls, no hooks. Order-independent.

```luau
local rovy = {
    _components = {},   -- { { ctor, id } }
    _collectors = {},   -- { { ctor, id } }
    _resources  = {},   -- { { ctor, id } }
    _events     = {},   -- { { ctor, capacity } }
    _systems    = {},   -- { { ctor, schedule, set, after, before, params } }
    _observers  = {},   -- { { ctor, event, priority, params } }
    _monitors   = {},   -- { { ctor, match, methods, params } }
    _relations  = {},   -- { { ctor, exclusive, onTargetDelete, onDelete } }
    _schedules  = {},   -- { { ctor, runOnStart } }
    _traits     = {},   -- id → { implCtor, ... }
    _queries    = {},   -- descriptorId → { terms, with, without, ... }
}

function rovy.__component(ctor, id)
    table.insert(rovy._components, { ctor = ctor, id = id })
end

function rovy.__collect(ctor, id)
    table.insert(rovy._collectors, { ctor = ctor, id = id })
end

function rovy.__traitImpl(traitId, implCtor)
    rovy._traits[traitId] = rovy._traits[traitId] or {}
    table.insert(rovy._traits[traitId], implCtor)
end

function rovy.__system(ctor, meta)
    table.insert(rovy._systems, meta)  -- meta carries ctor + scheduling + params
end
-- ...one per construct
```

`rovy.loadPaths(...)` makes these run. Authored TS passes string paths; the transformer lowers them to Instance roots before Luau runtime sees them:

```luau
function rovy.loadPaths(...)
    for _, root in { ... } do
        for _, desc in root:GetDescendants() do
            if desc:IsA("ModuleScript") then
                require(desc)   -- side effects fire: rovy.__component / __collect / __system / ...
            end
        end
    end
end
```

This is the answer to "Roblox modules don't run unless required" — `loadPaths` requires them all, so every injected registration executes.

---

## Phase 2 — Finalize (`app.start()`)

```luau
function App:start()
    assert(#rovy._components > 0 or #rovy._collectors > 0 or #rovy._systems > 0,
        "rovy.loadPaths must run before app.start")

    -- 1. components → jecs IDs
    for _, e in rovy._components do
        local jecsId = self.world:component()
        self.componentMap[e.ctor] = jecsId
    end

    -- 2. resources → jecs IDs + auto-instantiate default ctor
    for _, e in rovy._resources do
        local jecsId = self.world:component()
        self.resourceMap[e.ctor] = jecsId
        if self.world:get(RESOURCE_ENTITY, jecsId) == nil then
            self.world:set(RESOURCE_ENTITY, jecsId, e.ctor.new())  -- default
        end
    end

    -- 2b. collectors → app-owned singleton instances
    for _, e in rovy._collectors do
        self.collectors[e.ctor] = e.ctor.new()
        assert(type(self.collectors[e.ctor].drain) == "function")
    end

    -- 3. events → buffers
    for _, e in rovy._events do
        self.eventBuffers[e.ctor] = { capacity = e.capacity, buffer = {}, observers = {} }
    end

    -- 4. relations → jecs pair IDs + cleanup policies
    for _, e in rovy._relations do
        self.relationMap[e.ctor] = self.world:component()
        -- apply exclusive / onTargetDelete / onDelete
    end

    -- 5. trait registry → resolve implementer jecs IDs
    for traitId, impls in rovy._traits do
        self.traitRegistry[traitId] = {}
        for _, implCtor in impls do
            table.insert(self.traitRegistry[traitId],
                { ctor = implCtor, jecsId = self.componentMap[implCtor] })
        end
    end

    -- 6. hoisted queries → real jecs query handles
    for descId, d in rovy._queries do
        self.queryHandles[descId] = buildJecsQuery(self.world, self.componentMap, d)
    end

    -- 7. schedules + set ordering (sets from plugins via configureSets)
    for _, e in rovy._schedules do
        self.schedules[e.ctor] = Schedule.new(e.ctor, e.runOnStart)
    end

    -- 8. systems → instance + placement in schedule/set, sorted by after/before
    for _, e in rovy._systems do
        self.systemInstances[e.ctor] = e.ctor.new()
        self.systemInstances[e.ctor].lastRunTick = -1
        self.schedules[e.schedule]:addSystem(e)
    end

    -- 9. observers → event dispatch tables, priority sort
    for _, e in rovy._observers do
        table.insert(self.eventBuffers[e.event].observers,
            { instance = e.ctor.new(), priority = e.priority, params = e.params })
    end
    for _, buf in self.eventBuffers do
        table.sort(buf.observers, function(a, b) return a.priority > b.priority end)
    end

    -- 10. change detection hooks on every component
    for ctor, jecsId in self.componentMap do
        registerChangeDetection(self.world, ctor, jecsId)
    end

    -- 11. monitors → archetype tracking + jecs hook wiring
    for _, e in rovy._monitors do
        wireMonitor(self.world, e, self.componentMap, self.traitRegistry)
    end

    -- 12. fire runOnStart schedules once
    for _, sched in self.schedules do
        if sched.runOnStart then sched:run(self.world, self.commands) end
    end
end
```

`componentMap` (TS class → jecs ID) is the central lookup every later operation uses.

---

## Components — how they're used

### Spawn

```luau
function Commands:spawn(...)
    local entity = world:entity()
    for _, arg in { ... } do
        if getmetatable(arg) and rawget(getmetatable(arg), "__index") then
            local jecsId = componentMap[getmetatable(arg)]
            world:set(entity, jecsId, arg)        -- instance → data
        else
            world:add(entity, componentMap[arg])  -- bare class → tag
        end
    end
    return entity
end
```

### Query iteration

A hoisted query finalized to a jecs handle:

```luau
function buildJecsQuery(world, componentMap, d)
    local args = {}
    for _, ctor in d.terms do
        if ctor ~= Entity then table.insert(args, componentMap[ctor]) end
    end
    local q = world:query(table.unpack(args))
    for _, w in d.with or {} do q = q:with(componentMap[w]) end
    for _, wo in d.without or {} do q = q:without(componentMap[wo]) end
    return q
end
```

Iteration drives jecs directly — jecs walks only archetypes whose component set is a superset of the query terms and disjoint from `without`:

```luau
for entity, pos, vel in unitsQuery do
    -- entity free per row; pos, vel bound in declared order
end
```

### Mutation → hooks

`commands.set(entity, Health, new Health(...))` at flush → `world:set(entity, healthId, value)`. One jecs `set` fans out to:

1. jecs `on_change` → `changeStores[healthId][entity] = world.changeTick`
2. monitor `world:changed` hook → `onChange` if entity in a matching archetype
3. if it was a new component: `on_add` instead → archetype move + `onEnter`

`world.get(e, Health)` = `world:get(e, componentMap[Health])`. One map lookup + jecs archetype access. O(1).

---

## Resources — how they're resolved

Param descriptor `{ kind = "res", ctor = BattleClock }` resolved per system call:

```luau
local function resolveParam(p, world, commands, instance)
    if p.kind == "res" or p.kind == "resMut" then
        local v = world:get(RESOURCE_ENTITY, resourceMap[p.ctor])
        if v == nil then error("resource missing: " .. p.ctor.id) end
        return v
    elseif p.kind == "optRes" then
        return world:get(RESOURCE_ENTITY, resourceMap[p.ctor])  -- nil ok
    end
end
```

`Res` and `ResMut` resolve identically at runtime; `Res<T>` is shallow-readonly in TypeScript, while `ResMut<T>` is the mutable write-intent form for future parallel scheduling. Dev mode may freeze the `Res` value.

---

## Events — send / read / trigger

```luau
-- buffered
function EventWriter:send(event)
    local buf = eventBuffers[getmetatable(event)]
    table.insert(buf.buffer, event)
    if buf.capacity and #buf.buffer > buf.capacity then table.remove(buf.buffer, 1) end
end

-- reader: drains buffer for this schedule run
function EventReaderHandle:forEach(cb)
    for _, e in self.buf.buffer do cb(e) end
end

-- triggered → observers
function dispatchToObservers(event)
    local buf = eventBuffers[getmetatable(event)]
    if not buf then return end
    for _, obs in buf.observers do        -- already priority-sorted at finalize
        local args = {}
        for _, p in obs.params do
            if p.kind == "event" then table.insert(args, event)
            elseif p.kind == "commands" then table.insert(args, commandBuffer)
            elseif p.kind == "world" then table.insert(args, world)
            elseif p.kind == "query" then table.insert(args, queryHandles[p.handle])
            elseif p.kind == "res" then table.insert(args, world:get(RESOURCE_ENTITY, resourceMap[p.ctor])) end
        end
        obs.instance:run(table.unpack(args))
    end
end
```

Event identity = `getmetatable(event)` (the TS class). Same key used in `eventBuffers` at finalize — observers for different events never collide.

`commands.trigger` → deferred (dispatched at flush). `world.trigger` → immediate inline dispatch.

---

## Systems — scheduler run loop

```luau
function Schedule:run(world, commands)
    for _, set in self.orderedSets do
        for _, sysMeta in set.systems do            -- sorted by after/before at finalize
            local instance = systemInstances[sysMeta.ctor]
            if sysMeta.runIf and not sysMeta.runIf() then continue end

            local args = {}
            for _, p in sysMeta.params do
                table.insert(args, resolveParam(p, world, commands, instance))
            end
            instance:run(table.unpack(args))
            instance.lastRunTick = world.changeTick
        end
        flush(world, commands)                       -- after every set boundary
    end
    world.changeTick += 1                            -- once per schedule run
end
```

Systems are singletons (instance built once at finalize, reused). Query handles are pre-built. Param resolution is a flat descriptor loop — zero reflection.

---

## Observers — dispatch + chains

Registered into per-event dispatch tables at finalize, priority-sorted once. `dispatchToObservers` (above) runs them in order.

Observer-produced triggers re-enter the flush loop:

```luau
function flush(world, commands)
    while #commands.queue > 0 or #commands.triggerQueue > 0 do
        local q = commands.queue; commands.queue = {}
        for _, c in q do applyCommand(world, c) end          -- fires jecs hooks

        local t = commands.triggerQueue; commands.triggerQueue = {}
        for _, e in t do dispatchToObservers(e) end           -- may queue more
    end
end
```

Loops to convergence. Batching at set boundaries (not per system) keeps it deterministic.

---

## Monitors

`wireMonitor` at finalize builds the archetype match set and installs jecs hooks.

```luau
function wireMonitor(world, e, componentMap, traitRegistry)
    local instance = e.ctor.new()
    local matching = {}                       -- archetypeId → true
    local q = queryHandles[e.match]

    for _, arch in q:archetypes() do matching[arch.id] = true end
    observeArchetypes(world, q,
        function(a) matching[a.id] = true end,
        function(a) matching[a.id] = nil end)

    local function call(method, entity)
        if not instance[method] then return end
        local args = { entity }
        for _, termId in e.termIds do table.insert(args, world:get(entity, termId)) end
        instance[method](instance, table.unpack(args), commandBuffer)
    end

    for _, termId in e.termIds do
        world:added(termId, function(entity, id, value, srcArch)
            local dst = jecs.record(world, entity).archetype
            if not matching[srcArch.id] and matching[dst.id] then call("onEnter", entity) end
        end)
        world:removed(termId, function(entity, id, deleting)
            local src = jecs.record(world, entity).archetype
            local dst = deleting and world.ROOT_ARCHETYPE
                or jecs.archetype_traverse_remove(world, id, src)
            if matching[src.id] and not matching[dst.id] then call("onExit", entity) end
        end)
        world:changed(termId, function(entity)
            if matching[jecs.record(world, entity).archetype.id] then call("onChange", entity) end
        end)
    end

    for _, wid in e.withoutIds do              -- inverted: gain → exit, lose → enter
        world:added(wid, function(entity, id, value, srcArch)
            local dst = jecs.record(world, entity).archetype
            if matching[srcArch.id] and not matching[dst.id] then call("onExit", entity) end
        end)
        world:removed(wid, function(entity, id, deleting)
            local src = jecs.record(world, entity).archetype
            local dst = deleting and world.ROOT_ARCHETYPE
                or jecs.archetype_traverse_remove(world, id, src)
            if not matching[src.id] and matching[dst.id] then call("onEnter", entity) end
        end)
    end
end
```

### Why archetype tracking

jecs groups entities by exact component set (archetype). Entity moving between archetypes (component add/remove) is the only signal for enter/exit. The monitor checks "was old archetype matching? is new one?" New archetypes appear at runtime — `observeArchetypes` (jecs `EcsOnArchetypeCreate/Delete` via `world.observable`) keeps the set live.

### Hook timing asymmetry

| Hook | Entity moved? | Source archetype | Dest archetype |
|------|--------------|-----------------|----------------|
| `on_add` | yes | `srcArch` param | `jecs.record(world, e).archetype` |
| `on_remove` | no | `jecs.record(world, e).archetype` | `jecs.archetype_traverse_remove(...)` |
| `on_change` | no | current | same |

This is why add/remove handlers compute src/dst differently.

---

## Traits

`Trait<T>` query finalized via the trait registry:

```luau
function buildTraitQuery(world, traitRegistry, traitId)
    local subs = {}
    for _, impl in traitRegistry[traitId] do
        table.insert(subs, world:query(impl.jecsId))
    end
    return TraitQueryHandle.new(subs)
end

function TraitQueryHandle:forEach(cb)
    for _, sub in self.queries do
        for entity, comp in sub do
            cb(entity, comp)            -- comp = concrete impl, typed as trait
        end
    end
end
```

Entity with both `Stunned` and `Rooted` → callback fires twice (`Trait<T>` = one row per matching impl). `AllTraits<T>` collects per entity into an array (one row per entity). `HasTrait<T>` adds `Or(...)` of implementer IDs to the jecs query, no binding.

`rovy.traitToken("src/traits/CrowdControl")` returns a handle indexing `traitRegistry` by stable path — for value-position uses.

---

## Change detection

Hooks installed at finalize on every component:

```luau
function registerChangeDetection(world, ctor, jecsId)
    local changed, added = {}, {}
    changeStores[jecsId], addedStores[jecsId] = changed, added
    world:added(jecsId, function(e) changed[e] = world.changeTick; added[e] = world.changeTick end)
    world:changed(jecsId, function(e) changed[e] = world.changeTick end)   -- not added
    world:removed(jecsId, function(e) changed[e] = nil; added[e] = nil end)
end
```

Filter applied during iteration (base jecs query has no tick concept):

```luau
function FilteredQueryHandle:forEach(cb)
    for entity, a, b in self.base do
        local pass = true
        for _, f in self.filters do
            local store = (f.type == "added") and addedStores or changeStores
            local t = store[componentMap[f.ctor]][entity]
            if not t or t <= self.systemMeta.lastRunTick then pass = false; break end
        end
        if pass then cb(entity, a, b) end
    end
end
```

First run: `lastRunTick = -1` → everything passes (Bevy parity). `Removed<C>` drains a separate removed buffer instead of filtering the live query.

---

## Full sequence

```txt
module load (forced by rovy.loadPaths)
  → rovy.__component / __collect / __resource / __event / __system / __observer
    / __monitor / __relation / __schedule / __traitImpl / __query
  → registries populated (pure data)

app.start()  [finalize]
  → jecs IDs, resource instances, event buffers, relation pairs
  → trait registry resolved, hoisted queries → jecs handles
  → schedules + set order, system instances + sorting
  → observer dispatch tables (priority sorted)
  → change-detection hooks, monitor archetype wiring
  → runOnStart schedules fire once

per frame: world.runSchedule(Update)
  → for each set: resolve params → run systems → flush (apply + dispatch, to convergence)
  → changeTick += 1
```

Runtime never reflects or string-matches in the hot path. Everything resolved at finalize: class metatables as map keys, jecs IDs as handles, pre-built queries, sorted observer lists.

## See also

- [Packages](21-packages.md)
- [Compiled output](19-compiled-output.md)
- [Transformer](10-transformer.md)
- [Systems and injection](17-systems-and-injection.md)
- [Monitors](18-monitors.md)
- [Change detection](16-change-detection.md)
