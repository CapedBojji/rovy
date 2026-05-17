# `examples/zombie-game` Rovy-First Example Plan

## Summary
- Add new example package at `examples/zombie-game` as fuller showcase than current tiny example.
- Design target: solo-first, third-person, 3D zombie wave survival where all gameplay logic and render state live in Rovy.
- Flamework is limited to typed networking/remotes. `@rbxts/egooe` handles HUD rendering, with Iris as fallback only if `egooe` blocks delivery.

## Goals
- Show Rovy driving a complete game loop instead of only small ECS smoke behavior.
- Keep visuals intentionally simple: flat arena, colored block zombies, block gun, block projectiles.
- Keep multiplayer scope minimal: server-authoritative solo-first flow that can later expand to co-op.
- Keep Roblox-native movement and camera: default character, default third-person camera, no custom controller.

## Package Setup
- Create new workspace package `@rovy/example-zombie-game` under `examples/zombie-game`.
- Add `package.json`, `tsconfig.json`, `default.project.json`, build/test scripts, and output place `build/rovy-zombie-game.rbxl`.
- Keep `rovy-transformer` enabled in `tsconfig.json`.
- Add Flamework stack:
  - `@flamework/core@1.3.2`
  - `@flamework/networking@1.3.2`
  - `rbxts-transformer-flamework@1.3.2`
  - `@rbxts/flamework-binary-serializer@0.7.0`
- Add UI stack:
  - `@rbxts/egooe@0.1.6`
  - `@rbxts/iris@2.3.1-ts.1`
- Keep `@rovy/core`, `rovy-transformer`, `roblox-ts`, `typescript`, and Roblox type/compiler deps aligned with current example package.
- Add root scripts for building and testing zombie example without replacing existing example scripts.

## Rojo / Build Layout
- Mirror current example package shape:
  - `ServerScriptService/TS` -> `out/server`
  - `ReplicatedStorage/TS` -> `out/shared`
  - `StarterPlayer/StarterPlayerScripts/TS` -> `out/client`
  - `ReplicatedStorage/rbxts_include/node_modules/@rbxts` -> local package `node_modules/@rbxts`
  - `ReplicatedStorage/rbxts_include/node_modules/@rovy` -> local package `node_modules/@rovy`
  - `ReplicatedStorage/rbxts_include/node_modules/@flamework` -> local package `node_modules/@flamework`
- World layout in `default.project.json`:
  - large concrete baseplate
  - one spawn location at arena center
  - `FilteringEnabled = true`
  - `HttpEnabled = true`
  - `RespectFilteringEnabled = true`
- No prebuilt zombie or projectile instances in place file. Client renders them from snapshot state.

## High-Level Architecture
- Rovy owns all game logic and all render-state logic.
- Flamework owns only typed remote definitions plus thin client/server bridge code that moves bytes in and out.
- Roblox engine services outside Rovy are limited to:
  - player lifecycle bootstrap
  - character lifecycle bootstrap
  - fixed-step loop hookup
  - tool activation hookup
  - actual Part/Tool/Model instance creation for rendered output

## Module Layout
- `src/shared/contracts.ts`
  - plain TS interfaces and constants for snapshot/network payloads
  - serializer exports
- `src/shared/network.ts`
  - Flamework networking declarations only
- `src/server/game.ts`
  - Rovy server-side components, resources, events, schedules, systems, boot helpers
- `src/server/main.server.ts`
  - boot server runtime
  - connect player lifecycle
  - connect heartbeat fixed-step loop
  - bind networking bridge
  - export smoke helper for tests
- `src/client/game.ts`
  - Rovy client-side resources, local events, render systems, HUD state systems, bootstrap hooks
- `src/client/main.client.ts`
  - boot client runtime
  - connect RenderStepped
  - connect LocalPlayer character/tool lifecycle
  - bind networking bridge
- `test/smoke.luau`
  - deterministic server integration smoke
- `test/assert-output.js`
  - transform/build assertions
- `test/assert-place.js`
  - place output existence assertion
- `test/harness/runtime.luau`
  - current example harness clone, extended only if needed by zombie smoke paths

## Shared Contracts

### `FireWeaponRequest`
- `shooterUserId: number`
- `shotSequence: number`
- `origin: Vector3`
- `direction: Vector3`

Server rules:
- validate request player matches `shooterUserId`
- normalize `direction`
- reject if player entity missing or dead
- reject if player weapon cooldown active

### `WorldSnapshot`
- `serverTick: number`
- `phase: "intermission" | "wave" | "defeat"`
- `waveNumber: number`
- `enemiesRemaining: number`
- `playerHealth: number`
- `playerMaxHealth: number`
- `playerPosition: Vector3`
- `zombies: ZombieSnapshot[]`
- `projectiles: ProjectileSnapshot[]`

### `ZombieSnapshot`
- `id: number`
- `position: Vector3`
- `health: number`
- `maxHealth: number`

### `ProjectileSnapshot`
- `id: number`
- `position: Vector3`

### `ZombieGameSmokeResult`
- `started: boolean`
- `ticksRan: number`
- `waveNumber: number`
- `phase: string`
- `zombiesSpawned: number`
- `zombiesKilled: number`
- `shotsFired: number`
- `playerHealth: number`
- `defeatReached: boolean`
- `restartApplied: boolean`
- `snapshotCount: number`
- `serializerRoundTripOk: boolean`

## Serializer Design
- Export one shared serializer instance from `src/shared/contracts.ts`.
- Serialize only primitive/engine values supported cleanly by package:
  - numbers
  - booleans
  - strings
  - arrays
  - `Vector3`
- Snapshot remote sends serialized bytes only.
- No instance references, CFrames, or callbacks in network payloads.
- Serializer smoke test must round-trip one representative `WorldSnapshot` and compare important fields.

## Flamework Networking Design
- Use `@flamework/networking` only.
- One shared remote declaration module.
- Client-to-server remotes:
  - `fireWeapon(request: FireWeaponRequest)`
  - `requestRestart()`
- Server-to-client remotes:
  - `worldSnapshot(bytes: buffer)`
- No game simulation in Flamework services/controllers.
- Thin bridges only:
  - server bridge decodes client intent into Rovy events or runtime calls
  - client bridge decodes server snapshot into Rovy-owned client state

## Server Rovy Runtime

### Schedules
- `@schedule class Startup {}`
- `@schedule class Update {}`

### Ordered Sets
- `WaveSet`
- `MovementSet`
- `CombatSet`
- `CleanupSet`
- `SnapshotSet`

Boot config:
- `app.configureSets(Update, [WaveSet, MovementSet, CombatSet, CleanupSet, SnapshotSet])`

### Server Resources
- `ServerClock`
  - `tick: number`
  - `fixedDelta: number`
- `WaveState`
  - `phase`
  - `waveNumber`
  - `intermissionRemaining`
  - `spawnRemaining`
  - `spawnCooldown`
- `PlayerRegistry`
  - `entitiesByUserId: Map<number, Entity>`
  - `playersByUserId: Map<number, Player>`
  - `charactersByUserId: Map<number, Model>`
- `ArenaState`
  - constants for center, half-size, zombie spawn radius
- `SnapshotState`
  - `sendAccumulator: number`
  - `latestBytes?: buffer`
  - `snapshotCount: number`
- `SmokeStats`
  - `zombiesSpawned`
  - `zombiesKilled`
  - `shotsFired`
  - `restartApplied`

### Server Components
- `PlayerUnit`
  - `userId: number`
- `Zombie`
  - marker only
- `Projectile`
  - `ownerUserId: number`
- `Position`
  - `value: Vector3`
- `Velocity`
  - `value: Vector3`
- `Health`
  - `current: number`
  - `max: number`
- `Radius`
  - `value: number`
- `MoveSpeed`
  - `value: number`
- `Lifetime`
  - `remaining: number`
- `Damage`
  - `value: number`
- `WeaponCooldown`
  - `remaining: number`
- `ContactCooldown`
  - `remaining: number`

### Server Events
- `FireWeaponIntent`
  - created from validated remote request
- `RestartIntent`
  - created from validated remote request

### External Server Hooks
- `registerPlayer(player: Player)`
  - create player entity if missing
  - set baseline components
  - ensure gun tool exists
- `unregisterPlayer(player: Player)`
  - despawn entity if tracked
  - clear maps
- `attachCharacter(player: Player, character: Model)`
  - update registry
  - sync player entity position from character root
  - ensure gun tool is available in Backpack / StarterGear
- `detachCharacter(player: Player)`
  - clear character map
- `handleFireRequest(player: Player, request: FireWeaponRequest)`
  - validate and trigger `FireWeaponIntent`
- `handleRestartRequest(player: Player)`
  - trigger `RestartIntent`

## Server Gameplay Rules

### Fixed Step
- Server sim runs at `1 / 30` seconds.
- Heartbeat accumulator drives `app.runSchedule(Update)` zero or more times per frame.
- Do not simulate with raw frame delta inside systems.

### Player
- One server entity per joined player.
- Player health starts at `100`.
- Player max health is `100`.
- Player radius is `2.5`.
- Weapon cooldown is `0.2s`.
- Player world position comes from current `HumanoidRootPart` each tick if character exists.

### Gun / Shot
- Client sends origin and direction.
- Server clamps origin to within small radius of player root to prevent spoofing.
- Projectile speed: `110`.
- Projectile lifetime: `1.5s`.
- Projectile radius: `0.75`.
- Projectile damage: `34`.
- One projectile per click.

### Zombie
- Zombie health: `60 + (waveNumber - 1) * 12`.
- Zombie move speed: `10 + math.min(waveNumber - 1, 6)`.
- Zombie radius: `2.5`.
- Contact damage: `8`.
- Contact cooldown: `0.5s`.
- Spawn positions appear on arena ring around player center area, rotating through deterministic points.
- Movement is straight-line steering toward nearest living player entity.
- No obstacle avoidance and no `PathfindingService`.

### Waves
- Start in `intermission`.
- Initial intermission: `2s`.
- Each wave:
  - increment `waveNumber`
  - set `spawnRemaining = 4 + waveNumber * 2`
  - spawn one zombie every `0.45s`
- While zombies still queued or alive, phase stays `wave`.
- When queued zombies are exhausted and no zombie entities remain:
  - phase returns to `intermission`
  - next intermission duration `3s`
- If all players are dead:
  - phase becomes `defeat`
  - no more spawning
  - existing zombies may stay rendered until restart

### Combat Resolution
- Projectile hit rule:
  - check distance against zombie radius + projectile radius
  - on first hit, subtract damage and despawn projectile
- Zombie contact rule:
  - if zombie overlaps player and cooldown <= 0, damage player and reset cooldown
- Death rule:
  - zombies despawn when health <= 0 and increment `zombiesKilled`
  - player health clamps at `0`
  - first time local player reaches `0`, phase becomes `defeat`

### Restart
- `RestartIntent` only accepted while phase is `defeat`.
- Restart clears all zombies and projectiles.
- Restart restores all tracked player entities to full health and zero cooldown.
- Restart resets wave state to:
  - `phase = "intermission"`
  - `waveNumber = 0`
  - `intermissionRemaining = 2`
  - `spawnRemaining = 0`
- Mark `SmokeStats.restartApplied = true`

## Snapshot Generation
- Build snapshot in `SnapshotSet`.
- Snapshot cadence: every `0.1s` (`10 Hz`).
- Snapshot contents come from current world state only.
- Use server player entity of first/only player as exported player HUD source.
- Serialize immediately and store latest bytes in `SnapshotState.latestBytes`.
- Main server loop broadcasts latest bytes after each fixed-step batch when bytes changed.

## Client Rovy Runtime

### Client Resources
- `ClientClock`
  - `now: number`
  - `delta: number`
- `SnapshotInbox`
  - `latest?: WorldSnapshot`
  - `receivedAt: number`
  - `sequence: number`
- `SnapshotBufferState`
  - `previous?: WorldSnapshot`
  - `current?: WorldSnapshot`
  - `currentReceivedAt: number`
- `RenderRegistry`
  - `rootFolder?: Folder`
  - `zombieParts: Map<number, Part>`
  - `projectileParts: Map<number, Part>`
- `HudState`
  - `phase`
  - `waveNumber`
  - `enemiesRemaining`
  - `playerHealth`
  - `playerMaxHealth`
  - `gameOver`
- `ClientBridge`
  - `sendFire?: (request: FireWeaponRequest) => void`
  - `sendRestart?: () => void`
- `LocalPlayerState`
  - `character?: Model`
  - `shotSequence: number`

### Client Events
- `LocalFireIntent`
  - `origin: Vector3`
  - `direction: Vector3`
- `LocalRestartIntent`
  - marker only

### Client Systems
- `TickClientClock`
  - updates `ClientClock`
- `ApplySnapshotInbox`
  - when inbox latest differs, shift current -> previous and update HUD state
- `RenderSnapshots`
  - create local zombie/projectile parts on demand
  - destroy missing parts
  - interpolate current positions from previous/current snapshots
- `EmitFireRequest`
  - observes `LocalFireIntent`
  - increments shot sequence
  - calls bridge `sendFire`
- `EmitRestartRequest`
  - observes `LocalRestartIntent`
  - calls bridge `sendRestart`

## Client Rendering Rules
- Rendered zombies:
  - colored green block parts
  - anchored
  - size roughly `Vector3.new(4, 6, 4)`
- Rendered projectiles:
  - colored bright yellow small block parts
  - anchored
  - size roughly `Vector3.new(1, 1, 1.5)`
- Keep all rendered parts under one client-only folder in `Workspace`.
- Interpolation:
  - use previous and current snapshot by matching ids
  - alpha = clamp((now - currentReceivedAt) / 0.1, 0, 1)
  - if entity absent in previous snapshot, snap to current
- No client-predicted projectile sim in v1.

## UI Rules
- Use `@rbxts/egooe` first.
- Create one `ScreenGui` root under `PlayerGui`.
- Start one per-frame immediate-mode draw loop from client bootstrap.
- HUD contents:
  - window pinned top-left
  - health progress bar
  - wave label
  - enemies remaining label
  - phase label
  - if defeat, show restart button
- Button behavior:
  - restart button emits `LocalRestartIntent`
- Styling:
  - small compact debug-HUD feel
  - no decorative assets
- If `egooe` integration proves broken during implementation:
  - replace only HUD renderer module with Iris
  - keep same `HudState` contract and same restart callback flow

## Tool / Input Hooks
- Server creates one `Tool` named `Block Blaster`.
- Tool handle is simple black block `Part`.
- Tool lives in Backpack and StarterGear.
- Client listens for tool activation on equipped local character.
- On activation:
  - get camera `CFrame.LookVector`
  - get character `HumanoidRootPart` position
  - compute origin slightly in front of character
  - trigger `LocalFireIntent`
- No ammo, reload, recoil, spread, or hit-scan.

## Manual Studio Acceptance
- Spawn into arena with default Roblox character.
- Tool appears and can be equipped.
- Clicking fires visible block projectiles.
- Zombies spawn in waves and move straight toward player.
- Projectile hits remove zombie health and eventually despawn zombie.
- Zombie contact lowers player health.
- HUD shows wave, enemies remaining, and health.
- On death, game enters defeat state and restart button appears.
- Restart button resets run to fresh intermission before wave 1.

## Automated Verification

### Build Checks
- `build` compiles example with both transformers active.
- `build:place` produces non-empty `build/rovy-zombie-game.rbxl`.
- `test/assert-output.js` checks:
  - Rovy transform output exists (`:__component`, `:__system`, `:__observer`, `:__query`, etc.)
  - `loadPaths` lowering still occurs
  - Flamework networking output exists somewhere in emitted Luau
  - no untransformed macro guards leak into output

### Serializer Check
- Node or Luau-side smoke verifies one `WorldSnapshot` round-trips through serializer with key fields intact.

### Lune Smoke
- Load server runtime module directly, not full client boot.
- Steps:
  - reset registry
  - boot app
  - register one fake player
  - attach fake position source
  - advance enough ticks to spawn first wave
  - fire one or more validated shots
  - verify zombie spawn, movement, hit, kill, next state progression
  - drive player to defeat
  - issue restart
- Assert `ZombieGameSmokeResult` values exactly.

## Implementation Order
1. Scaffold package, scripts, tsconfig, Rojo, and `plan.md`.
2. Add shared contracts, serializer, and Flamework network declarations.
3. Implement server Rovy runtime and deterministic smoke helper first.
4. Add server bootstrap loop and real player/tool hooks.
5. Add client Rovy snapshot/render runtime.
6. Add `egooe` HUD.
7. Add tests and output assertions.
8. Run build/test loop and fix compile/runtime issues.

## Future Rovy Net Phase
- After the first event-transport version of Rovy networking lands, replace the thin Flamework-only bridge with `@netEvent` where it improves clarity without changing the game loop shape.
- Map client intents like fire/restart to `clientToServer` net events and cosmetic or HUD push paths to `serverToClient` net events.
- Keep the same Rovy-owned sim/render split: networking remains transport plus boundary validation, not ownership of gameplay state.
- Do not block this example on full entity/component replication. The first migration target is typed event transport only.

## Non-Goals
- No ammo or reload.
- No upgrades or between-wave shop.
- No co-op-specific balancing or shared respawn flow.
- No custom camera or custom character controller.
- No obstacle navigation or real pathfinding.
- No fancy models, animations, sounds, or VFX.

## Handoff Notes
- If implementation time gets tight, protect these priorities first:
  1. Rovy-owned server wave sim
  2. Flamework network snapshot bridge
  3. Client-rendered zombie/projectile parts from snapshots
  4. Basic HUD with restart
- If `egooe` is the only blocker, keep gameplay/network/render exactly as planned and swap HUD renderer to Iris without changing Rovy-owned UI state.
