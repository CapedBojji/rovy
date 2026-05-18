# Milestone 1 — Usable Core (Phases 0–6)

## ✅ Phase 0 — Scaffold + jecs spike + test harness

- [x] `package.json` (`name @rovy/core`, `main out/init.luau`, `types out/index.d.ts`, scripts `build/dev/test/spike`)
- [x] `tsconfig.json` (roblox-ts standard, `outDir out`, `rootDir src`, `plugins: []`)
- [x] `.gitignore` (`/node_modules /out /out-test /include *.tsbuildinfo`)
- [x] Rojo `default.project.json`; `mise.toml` pins lune 0.10.4 + rojo 7.6.1
- [x] Deps installed: `@rbxts/jecs@0.11.0`; dev: `roblox-ts@3.0.0`, `@rbxts/compiler-types@3.0.0-types.0`, `@rbxts/types`, `@rbxts/jest@3.16.0-ts.1`, `@rbxts/jest-globals`; lune via mise
- [x] **jecs API spike** → `test/spike-report.md` (full symbol table + mitigations)
- [x] Vendored `src/types/jecs-internal.d.ts` (minimal: `added/changed` 4th `oldarchetype` arg; `InternalWorld` view)
- [x] Substrate harness: `test/smoke.luau` green under Lune — jecs round-trip, with/without, **cached `has()`**, `record()`, **empirically confirms spike's 4-arg `added` claim**
- [x] **Exit:** build emits `out/init.luau`; smoke spec passes under Lune; spike report committed

**Spike outcome (gates 7–9):** no ❌ blockers. `archetype_traverse_remove`/`EcsOnArchetypeCreate` are unexported internals → **monitors redesigned around public `query:cached():has()` + per-run reconcile** (strictly better than docs 18/20 internal-traversal; docs to update when Phase 8 lands). `added/changed` 4th `oldarchetype` arg confirmed real (untyped → vendored). No `jecs.Or` → `HasTrait` = unioned sub-queries. Native `OnDelete/OnDeleteTarget/Delete/Remove/Exclusive` map 1:1 to `@relation` options.

**Scope note (carried to Phase 1):** full `@rbxts/jest`(jest-lua)-under-Lune adapter needs a roblox-ts RuntimeLib require shim — non-trivial, no real specs exist yet. Phase 0 proves the substrate (TS→Luau build + jecs headless under Lune). Wiring jest-lua + the roblox-ts-output require shim is the **first Phase 1 task** (fallback: `run-in-roblox`).

