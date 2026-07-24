import type {
	ParamDescriptor,
	RovyRegistry,
} from "@rovy/core";
import type {
	ScribeCommand,
	ScribeCommandHandle,
	ScribeCommandReader,
	ScribeCommandRequest,
	ScribeCommandResponder,
	ScribeCommandResult,
} from "./commands";
import {
	commandClientParamId,
	commandReaderParamId,
} from "./param-ids";
import {
	cloneScribeValue,
	freezeScribeValue,
} from "./reader-tree";
import type {
	RuntimeScribeCommandDefinition,
	RuntimeScribeWireDescriptor,
} from "./registry";
import type {
	ScribeInstalledBundle,
} from "./runtime";
import type {
	ScribeWriteFailure,
	ScribeWriteQueue,
} from "./write-queue";
import type {
	ScribeEventRuntime,
} from "./event-runtime";
import {
	assertScribeSerializable,
} from "./serialization";

type UnknownTable = Record<string | number, unknown>;
type UnknownFactory = new (...args: Array<never>) => object;

export interface ScribeCommandPlan {
	readonly definition: RuntimeScribeCommandDefinition;
	readonly consumerCount: number;
}

interface InternalCommandHandle {
	readonly id: number;
	readonly commandId: string;
	readonly request: object;
	readonly callSiteId?: string;
}

interface ClientPending {
	readonly handle: InternalCommandHandle;
	readonly definition: RuntimeScribeCommandDefinition;
	readonly payload: Readonly<Record<string, unknown>>;
	readonly slotKey: string;
	started: boolean;
}

interface ClientCompletion {
	readonly handleId: number;
	readonly result: ScribeCommandResult<unknown>;
}

interface StoredClientResult {
	readonly result: ScribeCommandResult<unknown>;
	readonly expiresRevision: number;
}

interface ServerPending {
	readonly request: ScribeCommandRequest<object, unknown>;
	readonly definition: RuntimeScribeCommandDefinition;
	readonly thread: thread;
	readonly expiresAt: number;
	delivered: boolean;
	response?: ScribeCommandResult<unknown>;
}

const RESULT_TTL_REVISIONS = 300;
const DEFAULT_REQUEST_TIMEOUT = 10;

export function compileScribeCommandPlans(
	registry: RovyRegistry,
	definitions: ReadonlyArray<RuntimeScribeCommandDefinition>,
	boundary: "client" | "server",
): ReadonlyArray<ScribeCommandPlan> {
	const plans = new Array<ScribeCommandPlan>();
	for (const definition of definitions) {
		const parameterId =
			boundary === "client"
				? commandClientParamId(definition.id)
				: commandReaderParamId(definition.id);
		const consumerCount = countExternalParam(registry, parameterId);
		if (boundary === "server") {
			assert(
				consumerCount <= 1,
				`[rovy/scribe] command '${definition.name}' has ${consumerCount} ScribeCommandReader consumers; exactly one authoritative consumer is allowed`,
			);
		}
		if (consumerCount > 0) {
			plans.push(table.freeze({ definition, consumerCount }));
		}
	}
	return plans;
}

export class ScribeCommandRuntime {
	private readonly planById = new Map<string, ScribeCommandPlan>();
	private readonly bundleById = new Map<string, ScribeInstalledBundle>();
	private readonly clientFacades = new Map<string, object>();
	private readonly serverReaders = new Map<string, object>();
	private readonly clientPending = new Map<number, ClientPending>();
	private readonly clientSlots = new Map<string, number>();
	private readonly clientOutbound = new Array<number>();
	private readonly clientCompletions = new Array<ClientCompletion>();
	private readonly clientResults = new Map<number, StoredClientResult>();
	private readonly serverPending = new Map<number, ServerPending>();
	private readonly serverInbound = new Map<string, Array<number>>();
	private readonly serverResponder: ScribeCommandResponder;
	private nextHandleId = 0;
	private revision = 0;

	constructor(
		private readonly boundary: "client" | "server",
		bundles: ReadonlyArray<ScribeInstalledBundle>,
		plans: ReadonlyArray<ScribeCommandPlan>,
		private readonly writes: ScribeWriteQueue,
		private readonly events: ScribeEventRuntime,
	) {
		for (const bundle of bundles) {
			this.bundleById.set(bundle.definition.id, bundle);
		}
		for (const plan of plans) {
			this.planById.set(plan.definition.id, plan);
			if (boundary === "server") this.registerNativeCommand(plan);
		}
		this.serverResponder = new ScribeServerCommandResponder(this);
		if (boundary === "server") this.connectSessionCancellation();
	}

	hasPlan(commandId: string): boolean {
		return this.planById.has(commandId);
	}

	clientFacade(commandId: string): object {
		this.assertBoundary("client", "ScribeCommand");
		this.requirePlan(commandId);
		let facade = this.clientFacades.get(commandId);
		if (facade === undefined) {
			facade = new ScribeClientCommandFacade(this, commandId);
			this.clientFacades.set(commandId, facade);
		}
		return facade;
	}

	registerClientMock(
		dataId: string,
		commandCtor: object,
		handler: (request: object) => unknown,
	): void {
		this.assertBoundary("client", "ScribeTestRuntime.mockCommand");
		assert(
			typeIs(handler, "function"),
			"[rovy/scribe] mockCommand requires a handler",
		);
		let plan: ScribeCommandPlan | undefined;
		for (const [, candidate] of this.planById) {
			if (candidate.definition.ctor === commandCtor) {
				plan = candidate;
				break;
			}
		}
		assert(
			plan !== undefined,
			"[rovy/scribe] mockCommand requires a registered command contract with an injected client ScribeCommand consumer",
		);
		const definition = plan.definition;
		assert(
			definition.dataId === dataId,
			`[rovy/scribe] command '${definition.name}' belongs to a different Scribe data definition`,
		);
		const bundle = this.requireBundle(definition.dataId);
		const mock = (bundle.active as UnknownTable).MockCommand;
		assert(
			typeIs(mock, "function"),
			`[rovy/scribe] native client bundle '${bundle.definition.name}' does not expose MockCommand`,
		);
		(mock as (
			name: string,
			handler: (payload: unknown) => unknown,
		) => void)(
			definition.name,
			(payload) => {
				const decoded = decodeClassFields(
					definition.ctor,
					definition.fields,
					definition.optionalFields ?? [],
					definition.fieldTypes ?? [],
					payload,
					"mock command request",
				);
				if (!decoded.ok) {
					error(
						`[rovy/scribe] invalid mock command request: ${decoded.error}`,
					);
				}
				const result = handler(decoded.value);
				assertClassInstance(
					result,
					definition.result,
					`[rovy/scribe] ${definition.name} mock must return an instance of its result class`,
				);
				const immutable = cloneClassInstance(
					definition.result,
					definition.resultFields,
					definition.resultOptionalFields ?? [],
					definition.resultFieldTypes ?? [],
					result as object,
					"mock result",
				);
				return encodeServerEnvelope(
					definition,
					table.freeze({
						ok: true,
						value: immutable,
					}),
				);
			},
		);
	}

	serverReader(commandId: string): object {
		this.assertBoundary("server", "ScribeCommandReader");
		this.requirePlan(commandId);
		let reader = this.serverReaders.get(commandId);
		if (reader === undefined) {
			reader = new ScribeServerCommandReader(this, commandId);
			this.serverReaders.set(commandId, reader);
		}
		return reader;
	}

	responder(): ScribeCommandResponder {
		this.assertBoundary("server", "ScribeCommandResponder");
		return this.serverResponder;
	}

	call(
		commandId: string,
		request: object,
		callSiteId = "runtime",
	): ScribeCommandHandle<object, unknown> {
		this.assertBoundary("client", "ScribeCommand.call");
		const plan = this.requirePlan(commandId);
		assertClassInstance(
			request,
			plan.definition.ctor,
			`[rovy/scribe] ${plan.definition.name}.call requires an instance of its request class`,
		);
		const slotKey = `${commandId}:${callSiteId}`;
		const existingId = this.clientSlots.get(slotKey);
		if (existingId !== undefined) {
			const existing = this.clientPending.get(existingId);
			if (existing !== undefined) return existing.handle;
			this.clientSlots.delete(slotKey);
		}
		const immutableRequest = cloneClassInstance(
			plan.definition.ctor,
			plan.definition.fields,
			plan.definition.optionalFields ?? [],
			plan.definition.fieldTypes ?? [],
			request,
			"request",
		);
		const payload = encodeClassFields(
			plan.definition.fields,
			plan.definition.fieldTypes ?? [],
			immutableRequest,
			"command request",
		);
		const id = this.allocateHandleId();
		const handle = table.freeze({
			id,
			commandId,
			request: immutableRequest,
			callSiteId,
		});
		this.clientPending.set(id, {
			handle,
			definition: plan.definition,
			payload,
			slotKey,
			started: false,
		});
		this.clientSlots.set(slotKey, id);
		this.clientOutbound.push(id);
		return handle;
	}

	hasResult(
		commandId: string,
		handle: ScribeCommandHandle<object, unknown>,
	): boolean {
		if (handle.commandId !== commandId) return false;
		return this.clientResults.has(handle.id);
	}

	takeResult(
		commandId: string,
		handle: ScribeCommandHandle<object, unknown>,
	): ScribeCommandResult<unknown> | undefined {
		if (handle.commandId !== commandId) return undefined;
		const stored = this.clientResults.get(handle.id);
		if (stored === undefined) return undefined;
		this.clientResults.delete(handle.id);
		this.removeClientPending(handle.id);
		return stored.result;
	}

	readServerRequests(
		commandId: string,
		callback: (request: ScribeCommandRequest<object, unknown>) => void,
	): void {
		this.assertBoundary("server", "ScribeCommandReader.forEach");
		const queue = this.serverInbound.get(commandId);
		if (queue === undefined || queue.size() === 0) return;
		const ids = [...queue];
		queue.clear();
		for (const id of ids) {
			const pending = this.serverPending.get(id);
			if (pending === undefined || pending.delivered) continue;
			pending.delivered = true;
			this.writes.withCommandScope(id, () => {
				callback(pending.request);
			});
		}
	}

	serverRequestCount(commandId: string): number {
		const queue = this.serverInbound.get(commandId);
		return queue?.size() ?? 0;
	}

	resolveServer(
		request: ScribeCommandRequest<object, unknown>,
		value: unknown,
	): void {
		const pending = this.requireServerRequest(request);
		assert(
			pending.response === undefined,
			`[rovy/scribe] command request ${request.handle.id} already has a response`,
		);
		const [ok, encodedOrError] = pcall(() => {
			assertClassInstance(
				value,
				pending.definition.result,
				`[rovy/scribe] ${pending.definition.name} response must be an instance of its result class`,
			);
			const immutable = cloneClassInstance(
				pending.definition.result,
				pending.definition.resultFields,
				pending.definition.resultOptionalFields ?? [],
				pending.definition.resultFieldTypes ?? [],
				value as object,
				"result",
			);
			return immutable;
		});
		pending.response = ok
			? table.freeze({ ok: true, value: encodedOrError })
			: table.freeze({
					ok: false,
					error: `invalid-result: ${tostring(encodedOrError)}`,
				});
	}

	rejectServer(
		request: ScribeCommandRequest<object, unknown>,
		errorMessage: string,
	): void {
		const pending = this.requireServerRequest(request);
		assert(
			pending.response === undefined,
			`[rovy/scribe] command request ${request.handle.id} already has a response`,
		);
		assert(
			typeIs(errorMessage, "string") && errorMessage.size() > 0,
			"[rovy/scribe] command rejection requires a non-empty error string",
		);
		pending.response = table.freeze({
			ok: false,
			error: errorMessage,
		});
	}

	/**
	 * Promote completed native client calls and start newly flushed calls.
	 * Server-side this only marks expired requests for rejection.
	 */
	flushBeforeWrites(): boolean {
		this.revision += 1;
		let worked = false;
		if (this.boundary === "client") {
			while (this.clientCompletions.size() > 0) {
				const completion = this.clientCompletions.shift()!;
				const pending = this.clientPending.get(completion.handleId);
				if (pending === undefined || this.clientResults.has(completion.handleId)) {
					continue;
				}
				this.clientResults.set(completion.handleId, {
					result: completion.result,
					expiresRevision: this.revision + RESULT_TTL_REVISIONS,
				});
				this.events.publishCommandCompletion(
					pending.definition.id,
					pending.handle,
					pending.handle.request,
					completion.result,
				);
				worked = true;
			}
			while (this.clientOutbound.size() > 0) {
				const id = this.clientOutbound.shift()!;
				const pending = this.clientPending.get(id);
				if (pending === undefined || pending.started) continue;
				pending.started = true;
				this.startNativeClientRequest(pending);
				worked = true;
			}
			this.expireClientResults();
		} else {
			const now = os.clock();
			for (const [, pending] of this.serverPending) {
				if (
					pending.response === undefined &&
					pending.expiresAt <= now
				) {
					pending.response = table.freeze({
						ok: false,
						error: "unhandled",
					});
					worked = true;
				}
			}
		}
		return worked;
	}

	/**
	 * Server responses are released only after the current writer flush and its
	 * failure accounting have finished.
	 */
	flushAfterWrites(
		failures: ReadonlyArray<ScribeWriteFailure>,
	): boolean {
		if (this.boundary !== "server") return false;
		let worked = false;
		const completed = new Array<number>();
		for (const [id, pending] of this.serverPending) {
			if (pending.response === undefined) continue;
			const writeFailure = findCommandWriteFailure(failures, id);
			const response: ScribeCommandResult<unknown> =
				writeFailure === undefined
					? pending.response
					: table.freeze({
							ok: false,
							error: `write-failed: ${writeFailure.error}`,
						});
			const envelope = encodeServerEnvelope(
				pending.definition,
				response,
			);
			const [resumed, resumeError] = coroutine.resume(
				pending.thread,
				envelope,
			);
			assert(
				resumed,
				`[rovy/scribe] failed to resume native command '${pending.definition.name}': ${tostring(resumeError)}`,
			);
			completed.push(id);
			worked = true;
		}
		for (const id of completed) this.removeServerPending(id);
		return worked;
	}

	cancelPlayer(player: Player, reason = "session-ended"): void {
		if (this.boundary !== "server") return;
		for (const [, pending] of this.serverPending) {
			if (pending.request.player === player) {
				pending.response = table.freeze({
					ok: false,
					error: reason,
				});
			}
		}
	}

	private startNativeClientRequest(pending: ClientPending): void {
		const bundle = this.requireBundle(pending.definition.dataId);
		const request = (bundle.active as UnknownTable).Request;
		if (!typeIs(request, "function")) {
			this.clientCompletions.push({
				handleId: pending.handle.id,
				result: table.freeze({
					ok: false,
					error: "native-request-unavailable",
				}),
			});
			return;
		}
		task.spawn(() => {
			const [called, firstOrError, second] = pcall(() => {
				return (request as (
					name: string,
					payload: Readonly<Record<string, unknown>>,
				) => LuaTuple<[unknown, unknown?]>)(
					pending.definition.name,
					pending.payload,
				);
			});
			let result: ScribeCommandResult<unknown>;
			if (!called) {
				result = table.freeze({
					ok: false,
					error: `request-error: ${tostring(firstOrError)}`,
				});
			} else if (firstOrError === false) {
				result = table.freeze({
					ok: false,
					error: typeIs(second, "string")
						? second
						: "request-rejected",
				});
			} else {
				result = decodeClientEnvelope(
					pending.definition,
					firstOrError,
				);
			}
			this.clientCompletions.push({
				handleId: pending.handle.id,
				result,
			});
		});
	}

	private registerNativeCommand(plan: ScribeCommandPlan): void {
		const bundle = this.requireBundle(plan.definition.dataId);
		const register = (bundle.active as UnknownTable).Command;
		assert(
			typeIs(register, "function"),
			`[rovy/scribe] native server bundle '${bundle.definition.name}' does not expose Command`,
		);
		(register as (
			name: string,
			spec: Readonly<Record<string, unknown>>,
			handler: (player: Player, payload: unknown) => unknown,
		) => void)(
			plan.definition.name,
			{ Args: ["table"] },
			(player, payload) => {
				const decoded = decodeClassFields(
					plan.definition.ctor,
					plan.definition.fields,
					plan.definition.optionalFields ?? [],
					plan.definition.fieldTypes ?? [],
					payload,
					"command request",
				);
				if (!decoded.ok) {
					return table.freeze({
						__rovyScribeCommand: 1,
						Ok: false,
						Error: decoded.error,
					});
				}
				const id = this.allocateHandleId();
				const handle = table.freeze({
					id,
					commandId: plan.definition.id,
					request: decoded.value,
				});
				const requestRecord = table.freeze({
					handle,
					player,
					value: decoded.value,
				});
				const timeout = commandTimeout(
					this.requireBundle(plan.definition.dataId),
				);
				const pending: ServerPending = {
					request: requestRecord,
					definition: plan.definition,
					thread: coroutine.running(),
					expiresAt: os.clock() + timeout,
					delivered: false,
				};
				this.serverPending.set(id, pending);
				let queue = this.serverInbound.get(plan.definition.id);
				if (queue === undefined) {
					queue = new Array<number>();
					this.serverInbound.set(plan.definition.id, queue);
				}
				queue.push(id);
				return coroutine.yield();
			},
		);
	}

	private connectSessionCancellation(): void {
		const connected = new Set<string>();
		for (const [, plan] of this.planById) {
			if (connected.has(plan.definition.dataId)) continue;
			connected.add(plan.definition.dataId);
			const active = this.requireBundle(plan.definition.dataId)
				.active as UnknownTable;
			const signal = active.SessionEnded;
			if (!typeIs(signal, "table")) continue;
			const connect = (signal as UnknownTable).Connect;
			if (!typeIs(connect, "function")) continue;
			(connect as (
				self: object,
				callback: (player: Player, reason: string) => void,
			) => unknown)(signal, (player, reason) => {
				this.cancelPlayer(player, reason);
			});
		}
	}

	private requireServerRequest(
		request: ScribeCommandRequest<object, unknown>,
	): ServerPending {
		this.assertBoundary("server", "ScribeCommandResponder");
		const pending = this.serverPending.get(request.handle.id);
		assert(
			pending !== undefined && pending.request === request,
			"[rovy/scribe] responder received an unknown, expired, or foreign command request",
		);
		return pending;
	}

	private expireClientResults(): void {
		const expired = new Array<number>();
		for (const [id, stored] of this.clientResults) {
			if (stored.expiresRevision < this.revision) expired.push(id);
		}
		for (const id of expired) {
			this.clientResults.delete(id);
			this.removeClientPending(id);
		}
	}

	private removeClientPending(id: number): void {
		const pending = this.clientPending.get(id);
		if (pending !== undefined) {
			this.clientSlots.delete(pending.slotKey);
		}
		this.clientPending.delete(id);
	}

	private removeServerPending(id: number): void {
		const pending = this.serverPending.get(id);
		if (pending !== undefined) {
			const queue = this.serverInbound.get(
				pending.definition.id,
			);
			if (queue !== undefined) {
				const index = queue.indexOf(id);
				if (index >= 0) queue.remove(index);
			}
		}
		this.serverPending.delete(id);
	}

	private allocateHandleId(): number {
		this.nextHandleId += 1;
		return this.nextHandleId;
	}

	private requirePlan(commandId: string): ScribeCommandPlan {
		const plan = this.planById.get(commandId);
		assert(
			plan !== undefined,
			`[rovy/scribe] command '${commandId}' is not installed on the ${this.boundary} boundary`,
		);
		return plan;
	}

	private requireBundle(dataId: string): ScribeInstalledBundle {
		const bundle = this.bundleById.get(dataId);
		assert(
			bundle !== undefined,
			`[rovy/scribe] command references unknown data definition '${dataId}'`,
		);
		return bundle;
	}

	private assertBoundary(
		expected: "client" | "server",
		source: string,
	): void {
		assert(
			this.boundary === expected,
			`[rovy/scribe] ${source} is ${expected}-only`,
		);
	}
}

class ScribeClientCommandFacade implements ScribeCommand<object, unknown> {
	constructor(
		private readonly runtime: ScribeCommandRuntime,
		private readonly commandId: string,
	) {}

	call(
		request: object,
		callSiteId = "runtime",
	): ScribeCommandHandle<object, unknown> {
		return this.runtime.call(this.commandId, request, callSiteId);
	}

	hasResult(handle: ScribeCommandHandle<object, unknown>): boolean {
		return this.runtime.hasResult(this.commandId, handle);
	}

	takeResult(
		handle: ScribeCommandHandle<object, unknown>,
	): ScribeCommandResult<unknown> | undefined {
		return this.runtime.takeResult(this.commandId, handle);
	}
}

class ScribeServerCommandReader implements ScribeCommandReader<object, unknown> {
	constructor(
		private readonly runtime: ScribeCommandRuntime,
		private readonly commandId: string,
	) {}

	forEach(
		callback: (request: ScribeCommandRequest<object, unknown>) => void,
	): void {
		this.runtime.readServerRequests(this.commandId, callback);
	}

	size(): number {
		return this.runtime.serverRequestCount(this.commandId);
	}
}

class ScribeServerCommandResponder implements ScribeCommandResponder {
	constructor(private readonly runtime: ScribeCommandRuntime) {}

	resolve<Command extends object, Result>(
		request: ScribeCommandRequest<Command, Result>,
		result: NoInfer<Result>,
	): void {
		this.runtime.resolveServer(
			request as unknown as ScribeCommandRequest<object, unknown>,
			result,
		);
	}

	reject<Command extends object, Result>(
		request: ScribeCommandRequest<Command, Result>,
		errorMessage: string,
	): void {
		this.runtime.rejectServer(
			request as unknown as ScribeCommandRequest<object, unknown>,
			errorMessage,
		);
	}
}

function countExternalParam(
	registry: RovyRegistry,
	id: string,
): number {
	let count = 0;
	const groups = [
		registry.systems,
		registry.observers,
		registry.monitors,
		registry.prefabs,
	] as ReadonlyArray<
		ReadonlyArray<{ readonly params: ReadonlyArray<ParamDescriptor> }>
	>;
	for (const group of groups) {
		for (const declaration of group) {
			for (const param of declaration.params) {
				if (param.kind === "external" && param.id === id) count += 1;
			}
		}
	}
	return count;
}

function assertClassInstance(
	value: unknown,
	ctor: object,
	message: string,
): asserts value is object {
	assert(
		typeIs(value, "table") &&
			getmetatable(value) === ctor,
		message,
	);
}

function cloneClassInstance(
	ctor: object,
	fields: ReadonlyArray<string>,
	optionalFields: ReadonlyArray<string>,
	fieldTypes: ReadonlyArray<RuntimeScribeWireDescriptor>,
	value: object,
	label: string,
): object {
	const encoded = encodeClassFields(
		fields,
		fieldTypes,
		value,
		label,
	);
	const decoded = decodeClassFields(
		ctor,
		fields,
		optionalFields,
		fieldTypes,
		encoded,
		label,
	);
	assert(decoded.ok, decoded.ok ? "" : decoded.error);
	return decoded.value;
}

function encodeClassFields(
	fields: ReadonlyArray<string>,
	fieldTypes: ReadonlyArray<RuntimeScribeWireDescriptor>,
	value: object,
	label: string,
): Readonly<Record<string, unknown>> {
	const input = value as UnknownTable;
	const output: Record<string, unknown> = {};
	for (let index = 0; index < fields.size(); index += 1) {
		const field = fields[index];
		const fieldValue = cloneScribeValue(input[field]);
		assertScribeSerializable(fieldValue, `${label}.${field}`);
		const descriptor = fieldTypes[index];
		if (descriptor !== undefined && fieldValue !== undefined) {
			assertWireShape(
				fieldValue,
				descriptor,
				`${label}.${field}`,
			);
		}
		if (fieldValue !== undefined) output[field] = fieldValue;
	}
	return table.freeze(output);
}

function decodeClassFields(
	ctor: object,
	fields: ReadonlyArray<string>,
	optionalFields: ReadonlyArray<string>,
	fieldTypes: ReadonlyArray<RuntimeScribeWireDescriptor>,
	payload: unknown,
	label: string,
):
	| { readonly ok: true; readonly value: object }
	| { readonly ok: false; readonly error: string } {
	const [ok, valueOrError] = pcall(() => {
		assert(
			typeIs(payload, "table"),
			`[rovy/scribe] ${label} must be one table argument`,
		);
		const input = payload as UnknownTable;
		const allowed = new Set<string>();
		for (const field of fields) allowed.add(field);
		const optional = new Set<string>();
		for (const field of optionalFields) optional.add(field);
		for (const [key, value] of pairs(input)) {
			assert(
				typeIs(key, "string") && allowed.has(key),
				`[rovy/scribe] ${label} contains unknown field '${tostring(key)}'`,
			);
			assertScribeSerializable(value, `${label}.${key}`);
			const index = fields.indexOf(key as string);
			const descriptor = index >= 0
				? fieldTypes[index]
				: undefined;
			if (descriptor !== undefined) {
				assertWireShape(
					value,
					descriptor,
					`${label}.${key}`,
				);
			}
		}
		for (const field of fields) {
			assert(
				input[field] !== undefined || optional.has(field),
				`[rovy/scribe] ${label} omits required field '${field}'`,
			);
		}
		const args = new Array<defined>();
		let lastPresent = -1;
		for (let index = 0; index < fields.size(); index += 1) {
			if (input[fields[index]] !== undefined) lastPresent = index;
		}
		for (let index = 0; index <= lastPresent; index += 1) {
			const value = input[fields[index]];
			assert(
				value !== undefined,
				`[rovy/scribe] ${label} omits non-trailing field '${fields[index]}'`,
			);
			args.push(
				freezeScribeValue(cloneScribeValue(value)) as defined,
			);
		}
		const factory = ctor as UnknownFactory;
		const instance = new factory(...(args as Array<never>));
		return table.freeze(instance);
	});
	return ok
		? { ok: true, value: valueOrError as object }
		: { ok: false, error: tostring(valueOrError) };
}

function encodeServerEnvelope(
	definition: RuntimeScribeCommandDefinition,
	response: ScribeCommandResult<unknown>,
): Readonly<Record<string, unknown>> {
	if (!response.ok) {
		return table.freeze({
			__rovyScribeCommand: 1,
			Ok: false,
			Error: response.error,
		});
	}
	return table.freeze({
		__rovyScribeCommand: 1,
		Ok: true,
		Value: encodeClassFields(
			definition.resultFields,
			definition.resultFieldTypes ?? [],
			response.value as object,
			"command result",
		),
	});
}

function decodeClientEnvelope(
	definition: RuntimeScribeCommandDefinition,
	raw: unknown,
): ScribeCommandResult<unknown> {
	if (
		!typeIs(raw, "table") ||
		(raw as UnknownTable).__rovyScribeCommand !== 1
	) {
		return table.freeze({
			ok: false,
			error: "malformed-command-reply",
		});
	}
	const envelope = raw as UnknownTable;
	if (envelope.Ok !== true) {
		return table.freeze({
			ok: false,
			error: typeIs(envelope.Error, "string")
				? envelope.Error
				: "command-rejected",
		});
	}
	const decoded = decodeClassFields(
		definition.result,
		definition.resultFields,
		definition.resultOptionalFields ?? [],
		definition.resultFieldTypes ?? [],
		envelope.Value,
		"command result",
	);
	return decoded.ok
		? table.freeze({ ok: true, value: decoded.value })
		: table.freeze({
				ok: false,
				error: `malformed-command-result: ${decoded.error}`,
			});
}

function findCommandWriteFailure(
	failures: ReadonlyArray<ScribeWriteFailure>,
	handleId: number,
): ScribeWriteFailure | undefined {
	for (const failure of failures) {
		for (const operation of failure.operations) {
			if (operation.commandHandleId === handleId) return failure;
		}
	}
	return undefined;
}

function commandTimeout(bundle: ScribeInstalledBundle): number {
	const raw =
		bundle.definition.options?.RequestTimeout ??
		bundle.definition.options?.requestTimeout;
	return typeIs(raw, "number") && raw > 0
		? raw
		: DEFAULT_REQUEST_TIMEOUT;
}

function assertWireShape(
	value: unknown,
	descriptor: RuntimeScribeWireDescriptor,
	path: string,
): void {
	switch (descriptor.kind) {
		case "serializable":
			return;
		case "nil":
			assert(
				value === undefined,
				`[rovy/scribe] ${path} must be nil`,
			);
			return;
		case "string":
		case "number":
		case "boolean":
		case "buffer":
			assert(
				typeIs(value, descriptor.kind),
				`[rovy/scribe] ${path} must be ${descriptor.kind}, got ${typeOf(value)}`,
			);
			return;
		case "datatype":
			assert(
				typeOf(value) === descriptor.name,
				`[rovy/scribe] ${path} must be ${descriptor.name ?? "the declared datatype"}, got ${typeOf(value)}`,
			);
			return;
		case "literal":
			assert(
				value === descriptor.literal,
				`[rovy/scribe] ${path} must equal ${tostring(descriptor.literal)}`,
			);
			return;
		case "array": {
			const count = strictArrayLength(value, path);
			const element = descriptor.element;
			if (element === undefined) return;
			for (let index = 1; index <= count; index += 1) {
				assertWireShape(
					(value as UnknownTable)[index],
					element,
					`${path}[${index}]`,
				);
			}
			return;
		}
		case "tuple": {
			const count = strictArrayLength(value, path);
			const elements = descriptor.elements ?? [];
			assert(
				count <= elements.size(),
				`[rovy/scribe] ${path} has too many tuple elements`,
			);
			for (
				let index = 0;
				index < elements.size();
				index += 1
			) {
				const field = elements[index];
				const child = (value as UnknownTable)[index + 1];
				assert(
					child !== undefined || field.optional,
					`[rovy/scribe] ${path}[${index + 1}] is required`,
				);
				if (child !== undefined) {
					assertWireShape(
						child,
						field.value,
						`${path}[${index + 1}]`,
					);
				}
			}
			return;
		}
		case "object": {
			assert(
				typeIs(value, "table"),
				`[rovy/scribe] ${path} must be an object table`,
			);
			const fields = descriptor.fields ?? {};
			const input = value as UnknownTable;
			for (const [key] of pairs(input)) {
				assert(
					typeIs(key, "string") &&
						fields[key] !== undefined,
					`[rovy/scribe] ${path} contains unknown field '${tostring(key)}'`,
				);
			}
			for (const [key, field] of pairs(fields)) {
				const child = input[key];
				assert(
					child !== undefined || field.optional,
					`[rovy/scribe] ${path}.${key} is required`,
				);
				if (child !== undefined) {
					assertWireShape(
						child,
						field.value,
						`${path}.${key}`,
					);
				}
			}
			return;
		}
		case "record": {
			assert(
				typeIs(value, "table"),
				`[rovy/scribe] ${path} must be a record table`,
			);
			const keyType = descriptor.key;
			const element = descriptor.element;
			for (const [key, child] of pairs(value as UnknownTable)) {
				if (keyType !== undefined) {
					assertWireShape(
						key,
						keyType,
						`${path}<key>`,
					);
				}
				if (element !== undefined) {
					assertWireShape(
						child,
						element,
						`${path}.${tostring(key)}`,
					);
				}
			}
			return;
		}
		case "union":
			for (const option of descriptor.options ?? []) {
				const [ok] = pcall(() => {
					assertWireShape(value, option, path);
				});
				if (ok) return;
			}
			error(
				`[rovy/scribe] ${path} does not match any declared union member`,
				0,
			);
	}
}

function strictArrayLength(value: unknown, path: string): number {
	assert(
		typeIs(value, "table"),
		`[rovy/scribe] ${path} must be an array table`,
	);
	let count = 0;
	let maximum = 0;
	for (const [key] of pairs(value as UnknownTable)) {
		assert(
			typeIs(key, "number") &&
				key >= 1 &&
				key % 1 === 0,
			`[rovy/scribe] ${path} contains a non-array key`,
		);
		count += 1;
		if (key > maximum) maximum = key;
	}
	assert(
		count === maximum,
		`[rovy/scribe] ${path} contains an array hole`,
	);
	return count;
}
