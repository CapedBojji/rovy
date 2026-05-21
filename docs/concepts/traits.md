# Traits

> **Compile-time.** Traits are interfaces. The transformer discovers them from `trait<T>()` macro calls, `Trait<T>` / `HasTrait<T>` / `AllTraits<T>` type references, and `implements` clauses on `@component` classes. Interfaces have no runtime identity — `trait<T>()` is the compile-time macro that bridges type-level interface to value-level token for use in variables and runtime helpers. Decorator args never need it: `@monitor` match uses the `query<...>()` macro (`Trait<T>` in type position).

Traits group multiple component classes under a shared interface. A query against a trait returns matching components from any of its implementers.

## Defining a trait

Traits are normal TypeScript interfaces. No base class or decorator needed on the interface itself.

```ts
interface CrowdControl {
	blocksCasting(): boolean;
	blocksMovement(): boolean;
	getExpiresAtTick(): number;
}

interface Expirable {
	getExpiresAtTick(): number;
	isExpired(tick: number): boolean;
}
```

## Implementing

Component classes implement traits with `implements`. Multiple traits natural — no single-inheritance constraint.

```ts
@component
class Stunned implements CrowdControl, Expirable {
	constructor(public expiresAtTick: number) {}

	blocksCasting() {
		return true;
	}

	blocksMovement() {
		return true;
	}

	getExpiresAtTick() {
		return this.expiresAtTick;
	}

	isExpired(tick: number) {
		return tick >= this.expiresAtTick;
	}
}
```

```ts
@component
class Rooted implements CrowdControl, Expirable {
	constructor(public expiresAtTick: number) {}

	blocksCasting() {
		return false;
	}

	blocksMovement() {
		return true;
	}

	getExpiresAtTick() {
		return this.expiresAtTick;
	}

	isExpired(tick: number) {
		return tick >= this.expiresAtTick;
	}
}
```

```ts
@component
class Silenced implements CrowdControl {
	constructor(public expiresAtTick: number) {}

	blocksCasting() {
		return true;
	}

	blocksMovement() {
		return false;
	}

	getExpiresAtTick() {
		return this.expiresAtTick;
	}
}
```

`Silenced` implements `CrowdControl` only. `Stunned` and `Rooted` implement both `CrowdControl` and `Expirable`. Natural multi-trait.

## Referencing traits

Two contexts, two syntaxes:

| Context | Syntax | Example |
|---------|--------|---------|
| Type position (query params, run params, `query<...>()` match) | `Trait<T>` / `HasTrait<T>` / `AllTraits<T>` | `Query<[Entity, Trait<CrowdControl>]>` |
| Value position (variables, runtime APIs) | `trait<T>()` | `const ccToken = trait<CrowdControl>();` |

`trait<T>()` is a compile-time macro. Transformer resolves `T` via `TypeChecker`, replaces with a stable runtime token (`rovy.traitToken("stable/path")`). Only needed where TS requires a value — e.g. passing a trait handle to a runtime helper. Type positions (queries, `@monitor` match) use `Trait<T>` directly and never need the macro.

## Rules

- Interfaces are traits — no decorator or base required on the interface.
- `@component` class must explicitly `implements Trait` to count as implementer.
- `implements A, B, C` for multiple traits — no limit.
- No structural inference from method shape. `implements` required.

Counts:

```ts
@component
class Stunned implements CrowdControl {}
```

Does not count:

```ts
@component
class SomeClass {
	blocksMovement() {
		return true;
	}
}
```

## Discovery

Transformer discovers traits from any of:

- `trait<T>()` macro call (value position)
- `Trait<T>` in a `Query<...>` type param
- `HasTrait<T>` or `AllTraits<T>` in type params
- `implements T` on a `@component` class where `T` is referenced elsewhere as a trait

An interface that is never referenced by any of the above is not registered as a trait — it's just a normal TS interface.

## See also

- [Trait runtime](/concepts/trait-runtime.md)
- [Trait lifecycle (monitors)](/concepts/monitors.md)
