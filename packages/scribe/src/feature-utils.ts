import {
	cloneScribeValue,
	freezeScribeValue,
} from "./reader-tree";
import {
	failedJob,
	successfulJob,
} from "./job-runtime";
import type {
	ScribeJobResult,
} from "./types";

export type ScribeFeatureBoundary = "client" | "server";
export type UnknownTable = Record<string | number, unknown>;
export type NativeMethod = (...args: ReadonlyArray<unknown>) => unknown;

export function callScribeFeature(
	native: object,
	name: string,
	boundary: ScribeFeatureBoundary,
	...args: ReadonlyArray<unknown>
): unknown {
	const method = (native as UnknownTable)[name];
	assert(
		typeIs(method, "function"),
		`[rovy/scribe] native ${boundary} API does not expose ${name}`,
	);
	return (method as NativeMethod)(...args);
}

export function callScribeFeatureTuple(
	native: object,
	name: string,
	boundary: ScribeFeatureBoundary,
	...args: ReadonlyArray<unknown>
): LuaTuple<[unknown, unknown?]> {
	const method = (native as UnknownTable)[name];
	assert(
		typeIs(method, "function"),
		`[rovy/scribe] native ${boundary} API does not expose ${name}`,
	);
	return (method as (
		...args: ReadonlyArray<unknown>
	) => LuaTuple<[unknown, unknown?]>)(...args);
}

export function booleanFeatureJob(
	ok: unknown,
	reason: unknown,
	fallbackError: string,
): ScribeJobResult<boolean> {
	if (ok === true) return successfulJob(true);
	return failedJob(
		typeIs(reason, "string") && reason.size() > 0
			? reason
			: fallbackError,
	);
}

export function immutableScribeFeatureValue<T>(value: T): T {
	return freezeScribeValue(cloneScribeValue(value)) as T;
}

export function assertScribeFeatureBoundary(
	actual: ScribeFeatureBoundary,
	expected: ScribeFeatureBoundary,
	operation: string,
): void {
	assert(
		actual === expected,
		`[rovy/scribe] ${operation} is only available on the ${expected}`,
	);
}

export function assertScribePlayer(
	player: Player | undefined,
	operation: string,
): asserts player is Player {
	assert(
		player !== undefined,
		`[rovy/scribe] ${operation} requires a Player`,
	);
}

export function assertScribeFeatureName(
	value: string,
	operation: string,
	label = "name",
): void {
	assert(
		value.size() > 0,
		`[rovy/scribe] ${operation} ${label} must not be empty`,
	);
}

export function assertPositiveInteger(
	value: number,
	operation: string,
	label: string,
): void {
	assert(
		value >= 1 && value % 1 === 0,
		`[rovy/scribe] ${operation} ${label} must be a positive integer`,
	);
}

export function isScribeClientReady(native: object): boolean {
	return callScribeFeature(native, "IsReady", "client") === true;
}
