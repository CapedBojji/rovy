/**
 * Compile-time macros. The `rovy-transformer` rewrites every call site:
 *   `trait<CrowdControl>()`        → `rovy.traitToken("src/.../CrowdControl")`
 *   `query<[Health], With<Unit>>()` → reference to a hoisted QueryDescriptor
 *
 * If one of these is ever reached at runtime, the transformer did not run —
 * fail loudly (doc 21 "transformer-not-run guard") rather than silently
 * mis-registering.
 */

const GUARD =
	"[rovy] macro reached runtime untransformed — is rovy-transformer in your tsconfig `compilerOptions.plugins`?";

/** Value-position trait handle. Type position uses `Trait<T>` directly. */
export function trait<T>(): T {
	throw GUARD;
}

/** `@monitor({ match: query<[Terms], ...Filters>() })`. */
export function query<
	Terms extends ReadonlyArray<unknown>,
	_F1 = void,
	_F2 = void,
	_F3 = void,
	_F4 = void,
	_F5 = void,
>(): never {
	throw GUARD;
}
