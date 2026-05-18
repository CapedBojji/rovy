# Milestone 7 — UI Docs / Widget Model (Planned)

## ⬜ Phase 21 — UI package and widget model docs

- [ ] Add a dedicated UI spec doc describing a future `@rovy/ui` package
- [ ] Define `@rovy/ui` as a separate runtime package, parallel to `@rovy/networking`
- [ ] Define one JSDoc-tagged widget function as the central public authoring primitive
- [ ] Lock widget discovery to transformer-injected registration plus `rovy.loadPaths(...)`
- [ ] Lock plain-call widget authoring syntax: `Window(args)`
- [ ] Lock the wrapped-function model: `RovyUi.__widget(...)` returns the callable later widget callsites target
- [ ] Lock `style: Style` as special authoring sugar for `RovyUi.getActiveStyle()`
- [ ] Lock `StyleScope({ patch, discriminator? }, fn)` as the dedicated callback-bounded style helper
- [ ] Record that widgets should stay normal functions for editor/typechecker stability
- [ ] Record that widget classes are not the public model
- [ ] Record that `RovyUi.Window(...)` is not the primary public surface
- [ ] **Exit:** docs clearly describe one-function widget authoring with auto-collection, wrapped-call lowering, active-style sugar, and callback-bounded style scopes
