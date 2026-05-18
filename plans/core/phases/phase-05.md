# Milestone 1 — Usable Core (Phases 0–6)

## ✅ Phase 5 — Query runtime: structural terms + filters

- [x] `QueryHandle`: cached jecs query (`:cached()`), iterate via `archetypes()` + column indexing (avoids roblox-ts iterator multi-return mangling), Entity/component/Optional binding in declared order, With/Without
- [x] `forEach/size/first/iter`; `first()` returns unpack directly (LuaTuple temp-var collapse pitfall documented)
- [x] `{kind:"query",handle}` resolves via `scheduler.queries`; multi-query independent; built at App.start step 3
- [x] tick (`Changed/Added/Removed`) + `HasTrait/HasPair` + trait/pair terms reject loudly (later phases)
- [x] **Exit:** `test/specs/phase5.luau` 4/4 green — Entity+Position+Optional with With/Without correct rows, size/first, multi-query independent, Changed rejected
- **roblox-ts gotchas captured:** (1) `table.pack(it())`→`table.pack({it()})` mangles multi-return → use archetypes; (2) loosely-typed jecs method call drops `self` → keep jecs types; (3) LuaTuple stored in a var collapses → return directly
- Files: `src/runtime/query.ts`, `src/runtime/resolve-param.ts`, `src/runtime/app.ts`, `src/runtime/schedule.ts`

