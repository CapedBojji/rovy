# Milestone 1 — Usable Core (Phases 0–6)

## ✅ Phase 1 — Type surface + decorator/macro stubs + `rovy` skeleton (CONTRACT FREEZE)

- [x] Type-only exports (`src/types/index.ts`): full list incl `Query`/`Res`/`Trait`/filters/`Entity`/`Commands`/`World`/`SystemSet`
- [x] Decorators = no-op markers (`src/decorators.ts`); `relation`/`schedule` dual via overloads; `set:` accepts `AbstractCtor`
- [x] `trait<T>()` / `query<...>()` = loud-throw stubs (doc 21 guard) (`src/macros.ts`)
- [x] `rovy` object (`src/rovy.ts`): registry tables + all `__*` push fns + `loadPaths` (provider-injectable via `setModuleProvider`) + `traitToken` + `__reset` — pure data push
- [x] **Frozen descriptor interfaces** (`src/contract.ts`, `CONTRACT_VERSION=1`); `param.kind` enum; `local`=`{kind,index,init?}`; query `handle`; all `*Reg`/`QueryDescriptor` shapes
- [x] **Calling convention recorded**: roblox-ts object methods take implicit `self` → transformer must emit `rovy:__x(...)` (colon). Noted in `contract.ts`.
- [x] Freeze: `@observer` stacking → one entry+instance per decorator; `runIf` zero-arg v1
- [x] Lune harness from Phase 0 reused (`test/harness/runtime.luau` RuntimeLib shim + `expect.luau`); jest-lua adapter still deferred
- [x] Evaluated `@rbxts/reflection@1.0.1` — defer, not a blocker (contract producer-agnostic)
- [x] **Exit:** `test/specs/phase1.luau` 7/7 green under Lune (`rovy:__*` populates registries, `loadPaths` delegates to injected provider, `traitToken` handle); `src/__typecheck.ts` mirrors doc-13 sigs, `rbxtsc` 0 errors
- Files: `src/index.ts`, `src/decorators.ts`, `src/macros.ts`, `src/types/index.ts`, `src/rovy.ts`, `src/contract.ts`, `src/__typecheck.ts`

