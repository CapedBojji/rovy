# Milestone 2 — Full Surface (Phases 7–12)

## ✅ Phase 12 — Integration / example app

- [x] Hand-wired combat scenario (`rovy.__*`, no transformer): components + `@resource` Clock + `@event` DamageTaken + 3 systems across ordered sets (Clock/Attack/Damage/Death) + EventWriter/Reader + deferred commands + 2 monitors (death-count + reaper-despawn)
- [x] N-tick deterministic run: 25hp / 10dmg → dies tick 3, monitor onEnter once, target despawned, resMut clock = 3, further ticks no-op
- [x] Fixed scheduler: final flush+reconcile per run so trailing commands from the last set's reconcile (monitor despawn) apply same run even when later sets are empty/skipped
- [x] **Exit:** `test/specs/phase12.luau` 1/1 (combat) green
- Files: `test/specs/phase12.luau`, `src/runtime/schedule.ts` (final flush)

> **✅ Milestone 2 COMPLETE (Phases 7–12). ✅ `@rovy/core` COMPLETE (Phases 0–12).** 56/56 specs green under Lune. Commits `3bbe6e3`→`5400bd4`.

---


