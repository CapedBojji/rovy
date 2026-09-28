# Live Studio verification — September 28, 2026

Tested source: `db77ab00ad5ba60a0ac70f5a01bf6c99a463bbde`.
Engine: Roblox Studio `0.740.19.7400003`, macOS ARM64, existing RML-managed installation.
Studio initially showed its home screen with no open place. All test places were unpublished scratch snapshots. No game was published and no cloud purchase was made.

## Results

| Surface | Result | Evidence |
| --- | --- | --- |
| Real DataModel integration | Pass, 10/10 | `ROVY_INTEGRATION_OK 10 cases`; build stamp `20260928-182417-95849` verified before execution |
| Core, transformer, datastore mock, UI, Scribe binding | Pass within integration cases | Real Instances, keyed/shared documents, changed/saved events, class events, layout, and reconciliation |
| Parallel Deferred/server | Pass | Stamp `1790634328958-96790`, both peer success markers, 80 timing rows |
| Parallel Deferred/client | Pass | Stamp `1790634383177-99193`, both peer success markers, 80 timing rows |
| Parallel Immediate/server | Pass | Stamp `1790634417694-436`, both peer success markers, 80 timing rows |
| Parallel Immediate/client | Pass | Stamp `1790634450847-1560`, both peer success markers, 80 timing rows |
| Networking RemoteEvent transport | Pass, supplementary smoke | Reliable and unreliable client/server round trips, sender identity, function request/result envelopes |
| ImGui | Pass, supplementary smoke | Real widget Instances; slider snaps 3.6 to 4; repeated render preserves instance count; empty render removes widgets |
| Vide | Pass, supplementary smoke | Real view mount; ECS query updates label 0 → 1 → 0 on spawn/despawn; explicit native cleanup removes label on unmount |
| World inspector | Pass, mount/display smoke | Screenshot shows three entities; live client contains 76 inspector descendants |
| Native Scribe compatibility | Pass | `ROVY_SCRIBE_STUDIO_COMPAT_OK 2.3.0` |
| Checked-in native Scribe full gate | Fail, reproduced twice | Gift delivery timeout; client then times out awaiting server feature suite |
| Native Scribe full gate with scratch-only delivery corrections | Pass twice consecutively | All compatibility, server, and client success markers on both runs |
| Visual HUD live status | Fail | Live state advances while labels remain at frame 0 and inspector closed |

Every parallel run verifies actual engine signal delivery, ECS integration, stale-result handling, worker faults, cancellation/timeouts, capacity exhaustion, callback faults, reuse, and destruction cleanup. The selected side contributes 80 timing records, totaling 320 across the matrix. This was a correctness/timing run, not a benchmark sweep.

## Confirmed fixture gaps

1. `packages/scribe/test/studio/probe.server.luau:754` enqueues a gift and waits for immediate delivery. The pinned native fake ProfileStore now delivers mailbox messages during a save or handler registration, not during `MessageAsync` (`vendor/scribe/test/Helpers/FakeProfileStore.luau:782`). A scratch-only save of the active profile clears the gift timeout. The online message assertion at `probe.server.luau:936` needs the same save and an event wait. With those two delivery corrections, the complete native server/client gate passes twice. Checked-in files remain unchanged; the original gate is still failing.

2. `test/place/src/client/main.client.ts:47` changes HUD state after mounting. Its RenderStepped callback changes the frame count without a declared HUD rerender trigger. A live client read observed 822 frames and `inspectorOpen=true`, while labels still read `rendered frames: 0` and `world inspector: closed`. The separate deterministic integration cases explicitly drive rerenders and all pass. This identifies a visual-fixture wiring gap; it does not establish a UI runtime regression.

The first supplementary Vide probe omitted native `cleanup(instance)` and asserted automatic Instance removal. That assertion was invalid for the native dependency. After registering explicit cleanup, mount, reactivity, and unmount all pass.

## Scope and remaining gaps

These tests cover existing live fixtures and additional package smoke checks, not every public API or device/input combination. ImGui pointer interaction, inspector editing/filtering/recording, Blink transport, multi-client routing, real DataStore/ProfileStore availability, Marketplace prompt UI, and published-place services remain unverified. Local Scribe persistence and purchase cases use its deterministic fake backend. No parallel benchmark sweep was run.

The earlier full build/test/version/vendor checks passed on this same source commit. The live integration harness was executed through the Studio connector rather than `run-in-roblox`, whose required `/Applications/RobloxStudio.app` path is absent. The existing Studio installation was not reconfigured.

## Local evidence

- Structured live output: `test/place/.build/live-results.json` (ignored generated artifact).
- Supplementary scratch project/scripts: `/tmp/rovy-live-supplement.project.json`, `/tmp/rovy-live-extra.server.luau`, `/tmp/rovy-live-extra.client.luau`.
- Native Studio log: `/Users/reikan404/Library/Logs/Roblox/0.740.19.7400003_20260928T222233Z_Studio_8d3f2_last.log`.
- No product source was changed. Playtests were stopped after collection.
