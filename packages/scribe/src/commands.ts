import type { Ctor } from "@rovy/core";
import type { AnyScribeData } from "./definitions";

/**
 * Optional explicit result carrier for command classes. TypeScript decorators
 * cannot add this association to a class type; the RFC records that limitation.
 */
export interface ScribeCommandResultCarrier<Result> {
	readonly __scribeCommandResult: Result;
}

export type ScribeCommandResultType<Command extends object> =
	Command extends ScribeCommandResultCarrier<infer Result> ? Result : unknown;

export interface ScribeCommandOptions<Data extends AnyScribeData, Result extends object> {
	readonly data: Data;
	readonly result: Ctor<Result>;
}

const noopCommandDecorator = (_ctor: Ctor): void => {};

export function scribeCommand<Data extends AnyScribeData, Result extends object>(
	_options: ScribeCommandOptions<Data, Result>,
): (ctor: Ctor) => void {
	return noopCommandDecorator;
}

export interface ScribeCommandHandle<Command extends object, Result = ScribeCommandResultType<Command>> {
	readonly id: number;
	readonly commandId: string;
	readonly request: Command;
	readonly __result?: Result;
}

export type ScribeCommandResult<Result> =
	| {
			readonly ok: true;
			readonly value: Result;
	  }
	| {
			readonly ok: false;
			readonly error: string;
	  };

export interface ScribeCommand<
	Command extends object,
	Result = ScribeCommandResultType<Command>,
> {
	call(request: Command): ScribeCommandHandle<Command, Result>;
	hasResult(handle: ScribeCommandHandle<Command, Result>): boolean;
	takeResult(handle: ScribeCommandHandle<Command, Result>): ScribeCommandResult<Result> | undefined;
}

export interface ScribeCommandRequest<
	Command extends object,
	Result = ScribeCommandResultType<Command>,
> {
	readonly handle: ScribeCommandHandle<Command, Result>;
	readonly player: Player;
	readonly value: Command;
}

export interface ScribeCommandReader<
	Command extends object,
	Result = ScribeCommandResultType<Command>,
> {
	forEach(callback: (request: ScribeCommandRequest<Command, Result>) => void): void;
	size(): number;
}

export interface ScribeCommandResponder {
	resolve<Command extends object, Result>(
		request: ScribeCommandRequest<Command, Result>,
		result: Result,
	): void;
	reject<Command extends object, Result>(
		request: ScribeCommandRequest<Command, Result>,
		error: string,
	): void;
}

export type ScribeCommandConstructor<Command extends object = object> = Ctor<Command>;
