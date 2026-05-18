# Milestone 3 — External Signal Bridge (Phases 13–15)

## ✅ Phase 14 — Runtime collector store + param resolution

- [x] `App` now owns app-scoped singleton collector instances keyed by ctor
- [x] Collectors instantiate once during `app.start()` and are injected through shared param resolution into systems, observers, and monitors
- [x] Collector-only apps are now valid in the empty-registry assertion
- [x] Runtime validation fails loudly for unregistered collector params and collector instances missing callable `drain()`
- [x] No teardown lifecycle in v1; collectors live for the full `App` lifetime
- [x] **Exit:** new runtime specs cover singleton injection, queue persistence across runs, collector-only boot, and named validation failures

