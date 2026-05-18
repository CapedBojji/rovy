### [ ] Phase 8 — Planned UI validation + fixtures

- [x] Add fixture proving JSDoc widget function detection.
- [x] Add fixture proving same-file implementation requirement.
- [x] Add fixture proving widget wrapping registration.
- [x] Add fixture proving `Window(args)` lowers to the wrapped callable.
- [x] Add fixture proving leading `style: Style` is removed from the runtime call signature.
- [x] Add fixture proving lowered widget body reads `RovyUi.getActiveStyle()` first.
- [x] Add fixture proving built-in `@rovy/ui` calls lower via the `@widget` tag in the package `.d.ts` (harness ships a tagged `@rovy/ui` stub; no hardcoded list).
- [x] Add fixture proving `StyleScope({ patch }, fn)` only affects widget calls inside `fn`.
- [ ] Add fixture proving nested style scopes merge partial patches correctly.
- [ ] Add fixture proving leaving scope restores the parent active style automatically.
- [ ] Add fixture proving scope discriminator participates in runtime scope identity.
- [x] Add fixture proving overload-based clean signatures.
- [ ] Add negative fixture documenting that widget discovery is function+JSDoc based, not class-construction based.
- [ ] Add doc-aligned fixture showing stateless widget calls driven by args/active-style rather than hooks.
