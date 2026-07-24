import type {
	Ctor,
	FlushContext,
	ParamDescriptor,
	RovyRegistry,
} from "@rovy/core";
import type {
	ScribeBinding,
} from "./binding";
import type {
	ScribeCommandHandle,
	ScribeCommandResult,
} from "./commands";
import {
	ScribeChangeJournal,
	type ScribeJournalRecord,
} from "./change-journal";
import type {
	ScribeChangeSource,
} from "./events";
import {
	immutableIngressPath,
	immutableIngressValue,
	ScribeIngressCollector,
} from "./ingress-collector";
import type {
	RuntimeScribeEventDefinition,
} from "./registry";
import type {
	ScribeInstalledBundle,
} from "./runtime";
import type {
	ScribeWriteFailure,
} from "./write-queue";
import type {
	ScribeJobHandle,
	ScribeJobResult,
	ScribeLogEntry,
	ScribeSaveInfo,
	ScribeStatus,
} from "./types";

type UnknownTable = Record<string | number, unknown>;
type NativeCallback = (...args: ReadonlyArray<unknown>) => void;

export interface ScribeEventRoute {
	readonly definition: RuntimeScribeEventDefinition;
	readonly send: boolean;
	readonly trigger: boolean;
	readonly path?: ReadonlyArray<string | number>;
}

interface ServerProfileState {
	readonly status: "pending" | "ready" | "ended";
	readonly root?: object;
	readonly cleanups: ReadonlyArray<() => void>;
}

export function compileScribeEventRoutes(
	registry: RovyRegistry,
	definitions: ReadonlyArray<RuntimeScribeEventDefinition>,
): ReadonlyArray<ScribeEventRoute> {
	const routes = new Array<ScribeEventRoute>();
	for (const definition of definitions) {
		const send = registryHasEventReader(registry, definition.ctor);
		const trigger = registry.observers.some(
			(observer) => observer.event === definition.ctor,
		);
		if (!send && !trigger) continue;
		routes.push(
			table.freeze({
				definition,
				send,
				trigger,
				path:
					definition.path === undefined
						? undefined
						: parseStaticPath(definition.path),
			}),
		);
	}
	return routes;
}

/**
 * Owns native subscriptions, callback ingress, canonicalization, and deferred
 * Rovy event publication. Native callbacks never dispatch observers directly.
 */
export class ScribeEventRuntime {
	private readonly ingress = new ScribeIngressCollector();
	private readonly journal = new ScribeChangeJournal();
	private readonly bundleById = new Map<string, ScribeInstalledBundle>();
	private readonly serverProfiles = new Map<
		string,
		Map<Player, ServerProfileState>
	>();
	private readonly clientReady = new Set<string>();
	private readonly cleanups = new Array<() => void>();

	constructor(
		private readonly boundary: "client" | "server",
		private readonly binding: ScribeBinding,
		bundles: ReadonlyArray<ScribeInstalledBundle>,
		private readonly routes: ReadonlyArray<ScribeEventRoute>,
		private readonly sourceForChange: (dataId: string) => ScribeChangeSource,
	) {
		for (const bundle of bundles) {
			this.bundleById.set(bundle.definition.id, bundle);
			this.installBundleSignals(bundle);
		}
		this.installModuleSignals();
		if (boundary === "server") this.installPlayerLifecycle();
	}

	hasPending(): boolean {
		return this.ingress.hasPending();
	}

	flush(context: FlushContext, revision: number): boolean {
		const records = this.ingress.drain();
		if (records.size() === 0) return false;
		const canonical = this.journal.canonicalize(records, revision);
		for (const record of canonical) {
			for (const route of this.routes) {
				if (!routeMatches(route, record)) continue;
				const event = this.createEvent(route, record);
				if (route.send) context.commands.send(event);
				if (route.trigger) context.commands.trigger(event);
			}
		}
		return true;
	}

	/**
	 * Writer/read selection can establish a server accessor before the
	 * PlayerAdded background waiter resumes. This makes subscriptions present
	 * before the first wrapper-owned write.
	 */
	trackServerPlayer(dataId: string, player: Player): void {
		if (this.boundary !== "server") return;
		const bundle = this.bundleById.get(dataId);
		if (bundle === undefined || !this.needsProfile(dataId)) return;
		const profiles = this.profiles(dataId);
		const existing = profiles.get(player);
		if (existing?.status === "ready" || existing?.status === "ended") return;

		const root = tryReadyServerRoot(bundle.active, player);
		if (root !== undefined) {
			this.attachServerRoot(bundle, player, root);
			return;
		}
		if (existing?.status === "pending") return;
		profiles.set(player, {
			status: "pending",
			cleanups: [],
		});
		const wait = (bundle.active as UnknownTable).WaitForData;
		if (!typeIs(wait, "function")) return;
		task.spawn(() => {
			const [ok, rootOrError, reason] = pcall(() => {
				return (wait as (
					player: Player,
				) => LuaTuple<[unknown, string?]>)(player);
			});
			const current = profiles.get(player);
			if (current?.status === "ready" || current?.status === "ended") {
				return;
			}
			if (ok && typeIs(rootOrError, "table")) {
				this.attachServerRoot(bundle, player, rootOrError);
				return;
			}
			profiles.set(player, {
				status: "ended",
				cleanups: [],
			});
			this.enqueueUnavailable(
				dataId,
				player,
				ok ? (reason ?? "load-failed") : tostring(rootOrError),
			);
		});
	}

	recordWriteFailure(failure: ScribeWriteFailure): void {
		const player = failure.player;
		if (player === undefined) return;
		const first = failure.operations[0];
		this.ingress.enqueue({
			kind: "anomaly",
			dataId: failure.dataId,
			player,
			path: immutableIngressPath(first?.path ?? []),
			reason: failure.error,
		});
	}

	publishCommandCompletion(
		commandId: string,
		handle: ScribeCommandHandle<object, unknown>,
		request: object,
		result: ScribeCommandResult<unknown>,
	): void {
		this.ingress.enqueue({
			kind: "commandCompleted",
			commandId,
			handle,
			request,
			result,
		});
	}

	publishJobCompletion(
		dataId: string,
		handle: ScribeJobHandle<unknown>,
		result: ScribeJobResult<unknown>,
		player?: Player,
	): void {
		this.ingress.enqueue({
			kind: "jobCompleted",
			dataId,
			player,
			handle,
			result,
		});
	}

	private installBundleSignals(bundle: ScribeInstalledBundle): void {
		const dataId = bundle.definition.id;
		if (this.boundary === "client") {
			this.subscribePathRoutes(bundle, bundle.active);
			if (this.hasRoute(dataId, "ready") || this.hasRoute(dataId, "unavailable")) {
				this.startClientReady(bundle);
			}
			this.connectClientSignals(bundle);
		} else {
			this.connectServerSignals(bundle);
		}
	}

	private subscribePathRoutes(
		bundle: ScribeInstalledBundle,
		root: object,
		player?: Player,
	): ReadonlyArray<() => void> {
		const cleanups = new Array<() => void>();
		const subscribed = new Set<string>();
		for (const route of this.routes) {
			const definition = route.definition;
			if (
				definition.dataId !== bundle.definition.id ||
				route.path === undefined ||
				!isPathEventKind(definition.kind)
			) {
				continue;
			}
			const nativeName = nativePathSignalName(definition.kind);
			const subscriptionKey = `${definition.path}:${nativeName}`;
			if (subscribed.has(subscriptionKey)) continue;
			subscribed.add(subscriptionKey);
			const node = resolveNativePath(root, route.path);
			const callback = this.pathCallback(
				bundle.definition.id,
				route.path,
				definition.kind,
				player,
			);
			const method = (node as UnknownTable)[nativeName];
			assert(
				typeIs(method, "function"),
				`[rovy/scribe] native accessor '${definition.path}' does not expose ${nativeName}`,
			);
			const disconnect = (method as (
				callback: NativeCallback,
			) => unknown)(callback);
			cleanups.push(normalizeDisconnect(disconnect));
		}
		return cleanups;
	}

	private pathCallback(
		dataId: string,
		path: ReadonlyArray<string | number>,
		kind: string,
		player?: Player,
	): NativeCallback {
		if (kind === "changed") {
			return (after: unknown, before: unknown) => {
				const reliableBefore = !(
					after === before &&
					typeIs(after, "table")
				);
				this.ingress.enqueue({
					kind: "changed",
					dataId,
					player,
					path: immutableIngressPath(path),
					before: reliableBefore
						? immutableIngressValue(before)
						: undefined,
					after: immutableIngressValue(after),
					source: this.sourceForChange(dataId),
				});
			};
		}
		if (kind === "inserted" || kind === "removed") {
			return (value: unknown, nativeIndex: unknown) => {
				assert(
					typeIs(nativeIndex, "number"),
					`[rovy/scribe] native ${nativePathSignalName(kind)} emitted a non-numeric index`,
				);
				this.ingress.enqueue({
					kind,
					dataId,
					player,
					path: immutableIngressPath(path),
					index: nativeIndex - 1,
					value: immutableIngressValue(value),
					source: this.sourceForChange(dataId),
				});
			};
		}
		return (key: unknown, value: unknown) => {
			assert(
				typeIs(key, "string"),
				`[rovy/scribe] native ${nativePathSignalName(kind)} emitted a non-string key`,
			);
			this.ingress.enqueue({
				kind: kind as "keyAdded" | "keyRemoved",
				dataId,
				player,
				path: immutableIngressPath(path),
				key,
				value: immutableIngressValue(value),
				source: this.sourceForChange(dataId),
			});
		};
	}

	private startClientReady(bundle: ScribeInstalledBundle): void {
		const dataId = bundle.definition.id;
		const active = bundle.active as UnknownTable;
		const isReady = active.IsReady;
		if (
			typeIs(isReady, "function") &&
			(isReady as () => boolean)()
		) {
			this.enqueueClientReady(dataId);
			return;
		}
		const wait = active.WaitForData;
		if (!typeIs(wait, "function")) return;
		task.spawn(() => {
			const [ok, readyOrError] = pcall(() =>
				(wait as (timeout?: number) => boolean)(),
			);
			if (ok && readyOrError === true) {
				this.enqueueClientReady(dataId);
			} else {
				this.enqueueUnavailable(
					dataId,
					undefined,
					ok ? "timeout" : tostring(readyOrError),
				);
			}
		});
	}

	private enqueueClientReady(dataId: string): void {
		if (this.clientReady.has(dataId)) return;
		this.clientReady.add(dataId);
		this.ingress.enqueue({ kind: "ready", dataId });
	}

	private attachServerRoot(
		bundle: ScribeInstalledBundle,
		player: Player,
		root: object,
	): void {
		const profiles = this.profiles(bundle.definition.id);
		const existing = profiles.get(player);
		if (existing?.status === "ready" || existing?.status === "ended") return;
		for (const cleanup of existing?.cleanups ?? []) cleanup();
		const cleanups = this.subscribePathRoutes(bundle, root, player);
		profiles.set(player, {
			status: "ready",
			root,
			cleanups,
		});
		if (this.hasRoute(bundle.definition.id, "ready")) {
			this.ingress.enqueue({
				kind: "ready",
				dataId: bundle.definition.id,
				player,
			});
		}
	}

	private connectServerSignals(bundle: ScribeInstalledBundle): void {
		const active = bundle.active;
		const dataId = bundle.definition.id;
		if (this.hasRoute(dataId, "sessionEnded") || this.needsProfile(dataId)) {
			this.connectSignal(active, "SessionEnded", (player, reason) => {
				if (!typeIs(player, "Instance") && !typeIs(player, "table")) return;
				const profiles = this.profiles(dataId);
				const previous = profiles.get(player as Player);
				for (const cleanup of previous?.cleanups ?? []) cleanup();
				profiles.set(player as Player, {
					status: "ended",
					cleanups: [],
				});
				if (this.hasRoute(dataId, "sessionEnded")) {
					this.ingress.enqueue({
						kind: "sessionEnded",
						dataId,
						player: player as Player,
						reason: tostring(reason),
					});
				}
			});
		}
		if (this.hasRoute(dataId, "save")) {
			this.connectSignal(active, "OnSave", (raw) => {
				if (!typeIs(raw, "table")) return;
				const info = raw as UnknownTable;
				const player = info.Player as Player;
				this.ingress.enqueue({
					kind: "save",
					dataId,
					player,
					ok: info.Ok === true,
					duration: typeIs(info.Duration, "number")
						? info.Duration
						: 0,
					at: typeIs(info.At, "number") ? info.At : os.time(),
					saveInfo: readSaveInfo(active, player),
				});
			});
		}
		if (this.hasRoute(dataId, "anomaly")) {
			this.connectSignal(active, "OnAnomaly", (raw) => {
				if (!typeIs(raw, "table")) return;
				const anomaly = raw as UnknownTable;
				this.ingress.enqueue({
					kind: "anomaly",
					dataId,
					player: anomaly.Player as Player,
					path: immutableIngressPath(
						typeIs(anomaly.Path, "table")
							? anomaly.Path as ReadonlyArray<string | number>
							: [],
					),
					value:
						anomaly.Value === undefined
							? undefined
							: immutableIngressValue(anomaly.Value),
					reason: tostring(anomaly.Reason),
				});
			});
		}
		if (this.hasRoute(dataId, "giftReceived")) {
			this.connectSignal(active, "OnGiftReceived", (player, raw) => {
				if (!typeIs(raw, "table")) return;
				const gift = raw as UnknownTable;
				this.ingress.enqueue({
					kind: "giftReceived",
					dataId,
					player: player as Player,
					fromUserId: gift.FromUserId as number,
					product: tostring(gift.Product),
					giftId: tostring(gift.GiftId),
				});
			});
		}
		if (this.hasRoute(dataId, "giftCredit")) {
			this.connectSignal(active, "OnGiftCredit", (player, product) => {
				this.ingress.enqueue({
					kind: "giftCredit",
					dataId,
					player: player as Player,
					product: tostring(product),
				});
			});
		}
		if (this.hasRoute(dataId, "ownershipChanged")) {
			this.connectSignal(active, "OnOwnershipChanged", (player, key, owned) => {
				this.ingress.enqueue({
					kind: "ownershipChanged",
					dataId,
					player: player as Player,
					key: tostring(key),
					owned: owned === true,
				});
			});
		}
		if (this.hasRoute(dataId, "message")) {
			this.connectSignal(active, "OnMessage", (player, value) => {
				this.ingress.enqueue({
					kind: "message",
					dataId,
					player: player as Player,
					value: immutableIngressValue(value),
				});
			});
		}
	}

	private connectClientSignals(bundle: ScribeInstalledBundle): void {
		const active = bundle.active;
		const dataId = bundle.definition.id;
		if (this.hasRoute(dataId, "serviceStatus")) {
			this.connectSignal(active, "OnServiceStatus", (status) => {
				this.ingress.enqueue({
					kind: "serviceStatus",
					dataId,
					status: status as ScribeStatus,
				});
			});
		}
		if (this.hasRoute(dataId, "sharedChanged")) {
			this.connectSignal(active, "OnSharedChanged", (userId, value) => {
				this.ingress.enqueue({
					kind: "sharedChanged",
					dataId,
					userId: userId as number,
					value:
						value === undefined
							? undefined
							: immutableIngressValue(value),
				});
			});
		}
		if (this.hasRoute(dataId, "ownershipChanged")) {
			this.connectSignal(active, "OnOwnershipChanged", (key, owned) => {
				this.ingress.enqueue({
					kind: "ownershipChanged",
					dataId,
					key: tostring(key),
					owned: owned === true,
				});
			});
		}
		if (this.hasRoute(dataId, "leaderboard")) {
			this.connectSignal(active, "OnLeaderboard", (name) => {
				const boardName = tostring(name);
				this.ingress.enqueue({
					kind: "leaderboard",
					dataId,
					name: boardName,
					entries: readLeaderboard(active, boardName),
				});
			});
		}
	}

	private installModuleSignals(): void {
		const module = this.binding.module;
		if (module === undefined) return;
		const issueDataIds = this.routeDataIds("issue");
		if (issueDataIds.size() > 0) {
			this.connectSignal(module, "OnIssue", (entry) => {
				const normalized = normalizeLogEntry(entry);
				for (const dataId of issueDataIds) {
					this.ingress.enqueue({
						kind: "issue",
						dataId,
						entry: normalized,
					});
				}
			});
		}
		if (this.boundary === "server") {
			const statusDataIds = this.routeDataIds("serviceStatus");
			if (statusDataIds.size() > 0) {
				this.connectSignal(module, "OnStatusChanged", (status) => {
					for (const dataId of statusDataIds) {
						this.ingress.enqueue({
							kind: "serviceStatus",
							dataId,
							status: status as ScribeStatus,
						});
					}
				});
			}
		}
	}

	private installPlayerLifecycle(): void {
		const [ok, service] = pcall(() => game.GetService("Players"));
		if (!ok || service === undefined) return;
		const players = service as Players;
		const dataIds = new Array<string>();
		for (const [, bundle] of this.bundleById) {
			if (this.needsProfile(bundle.definition.id)) {
				dataIds.push(bundle.definition.id);
			}
		}
		if (dataIds.size() === 0) return;
		const connection = players.PlayerAdded.Connect((player) => {
			for (const dataId of dataIds) this.trackServerPlayer(dataId, player);
		});
		this.cleanups.push(() => connection.Disconnect());
		for (const player of players.GetPlayers()) {
			for (const dataId of dataIds) this.trackServerPlayer(dataId, player);
		}
	}

	private connectSignal(
		source: object,
		name: string,
		callback: NativeCallback,
	): void {
		const signal = (source as UnknownTable)[name];
		if (!typeIs(signal, "table")) return;
		const connect = (signal as UnknownTable).Connect;
		if (!typeIs(connect, "function")) return;
		const connection = (connect as (
			self: object,
			callback: NativeCallback,
		) => unknown)(signal, callback);
		this.cleanups.push(normalizeDisconnect(connection));
	}

	private needsProfile(dataId: string): boolean {
		return this.routes.some(
			(route) =>
				route.definition.dataId === dataId &&
				(route.path !== undefined ||
					route.definition.kind === "ready" ||
					route.definition.kind === "unavailable"),
		);
	}

	private hasRoute(dataId: string, kind: string): boolean {
		return this.routes.some(
			(route) =>
				route.definition.dataId === dataId &&
				route.definition.kind === kind,
		);
	}

	private routeDataIds(kind: string): ReadonlyArray<string> {
		const seen = new Set<string>();
		const output = new Array<string>();
		for (const route of this.routes) {
			const dataId = route.definition.dataId;
			if (
				route.definition.kind === kind &&
				dataId !== undefined &&
				!seen.has(dataId)
			) {
				seen.add(dataId);
				output.push(dataId);
			}
		}
		return output;
	}

	private profiles(dataId: string): Map<Player, ServerProfileState> {
		let profiles = this.serverProfiles.get(dataId);
		if (profiles === undefined) {
			profiles = new Map<Player, ServerProfileState>();
			this.serverProfiles.set(dataId, profiles);
		}
		return profiles;
	}

	private enqueueUnavailable(
		dataId: string,
		player: Player | undefined,
		reason: string,
	): void {
		if (!this.hasRoute(dataId, "unavailable")) return;
		this.ingress.enqueue({
			kind: "unavailable",
			dataId,
			player,
			reason,
		});
	}

	private createEvent(
		route: ScribeEventRoute,
		record: ScribeJournalRecord,
	): object {
		const factory = route.definition.ctor as unknown as new () => object;
		const event = new factory() as UnknownTable;
		const bundle = "dataId" in record
			? this.bundleById.get(record.dataId)
			: undefined;
		if (bundle !== undefined) {
			event.definition = bundle.definition.publicToken;
		}
		if ("player" in record && record.player !== undefined) {
			event.player = record.player;
		}
		switch (record.kind) {
			case "changed":
				event.path = record.path;
				event.before = record.before;
				event.after = record.after;
				event.source = record.source;
				event.revision = record.revision;
				break;
			case "inserted":
			case "removed":
				event.path = record.path;
				event.index = record.index;
				event.value = record.value;
				event.source = record.source;
				break;
			case "keyAdded":
			case "keyRemoved":
				event.path = record.path;
				event.key = record.key;
				event.value = record.value;
				event.source = record.source;
				break;
			case "unavailable":
			case "sessionEnded":
				event.reason = record.reason;
				break;
			case "save":
				event.ok = record.ok;
				event.duration = record.duration;
				event.at = record.at;
				event.saveInfo = record.saveInfo;
				break;
			case "anomaly":
				event.path = record.path;
				event.value = record.value;
				event.reason = record.reason;
				break;
			case "giftReceived":
				event.fromUserId = record.fromUserId;
				event.product = record.product;
				event.giftId = record.giftId;
				break;
			case "giftCredit":
				event.product = record.product;
				break;
			case "ownershipChanged":
				event.key = record.key;
				event.owned = record.owned;
				break;
			case "message":
				event.value = record.value;
				break;
			case "leaderboard":
				event.name = record.name;
				event.entries = record.entries;
				break;
			case "serviceStatus":
				event.status = record.status;
				break;
			case "sharedChanged":
				event.userId = record.userId;
				event.value = record.value;
				break;
			case "issue":
				event.entry = record.entry;
				break;
			case "commandCompleted":
				event.handle = record.handle;
				event.request = record.request;
				event.result = record.result;
				break;
			case "jobCompleted":
				event.handle = record.handle;
				event.result = record.result;
				break;
		}
		return table.freeze(event);
	}
}

function registryHasEventReader(
	registry: RovyRegistry,
	event: Ctor,
): boolean {
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
				if (param.kind === "eventReader" && param.ctor === event) {
					return true;
				}
			}
		}
	}
	return false;
}

function routeMatches(
	route: ScribeEventRoute,
	record: ScribeJournalRecord,
): boolean {
	if (record.kind === "commandCompleted") {
		return (
			route.definition.kind === "commandCompleted" &&
			route.definition.commandId === record.commandId
		);
	}
	if (
		!("dataId" in record) ||
		route.definition.dataId !== record.dataId ||
		route.definition.kind !== record.kind
	) {
		return false;
	}
	if (route.path === undefined) return true;
	if (!("path" in record)) return false;
	return samePath(route.path, record.path);
}

function parseStaticPath(path: string): ReadonlyArray<string | number> {
	const output = new Array<string | number>();
	for (const segment of path.split(".")) {
		assert(
			segment.size() > 0,
			`[rovy/scribe] invalid empty event path segment in '${path}'`,
		);
		output.push(segment);
	}
	return table.freeze(output);
}

function samePath(
	left: ReadonlyArray<string | number>,
	right: ReadonlyArray<string | number>,
): boolean {
	if (left.size() !== right.size()) return false;
	for (let index = 0; index < left.size(); index += 1) {
		if (left[index] !== right[index]) return false;
	}
	return true;
}

function isPathEventKind(kind: string): boolean {
	return (
		kind === "changed" ||
		kind === "inserted" ||
		kind === "removed" ||
		kind === "keyAdded" ||
		kind === "keyRemoved"
	);
}

function nativePathSignalName(kind: string): string {
	switch (kind) {
		case "changed":
			return "Changed";
		case "inserted":
			return "OnInsert";
		case "removed":
			return "OnRemove";
		case "keyAdded":
			return "OnKeyAdded";
		case "keyRemoved":
			return "OnKeyRemoved";
		default:
			error(`[rovy/scribe] '${kind}' is not a path event kind`);
	}
}

function resolveNativePath(
	root: object,
	path: ReadonlyArray<string | number>,
): object {
	let current = root as UnknownTable;
	for (const segment of path) {
		const child = current[segment];
		assert(
			typeIs(child, "table"),
			`[rovy/scribe] native accessor is missing event path segment '${tostring(segment)}'`,
		);
		current = child as UnknownTable;
	}
	return current;
}

function normalizeDisconnect(connection: unknown): () => void {
	if (typeIs(connection, "function")) {
		return connection as () => void;
	}
	if (typeIs(connection, "table")) {
		const disconnect = (connection as UnknownTable).Disconnect;
		if (typeIs(disconnect, "function")) {
			return () => {
				(disconnect as (self: object) => void)(connection);
			};
		}
	}
	return () => {};
}

function tryReadyServerRoot(
	active: object,
	player: Player,
): object | undefined {
	const native = active as UnknownTable;
	const state = native.GetState;
	const get = native.Get;
	if (!typeIs(state, "function") || !typeIs(get, "function")) {
		return undefined;
	}
	const [ok, result] = pcall(() => {
		if ((state as (player: Player) => unknown)(player) !== "Ready") {
			return undefined;
		}
		return (get as (player: Player) => unknown)(player);
	});
	return ok && typeIs(result, "table") ? result : undefined;
}

function readSaveInfo(active: object, player: Player): ScribeSaveInfo {
	const method = (active as UnknownTable).GetSaveInfo;
	if (!typeIs(method, "function")) {
		return table.freeze({ dirty: false });
	}
	const [ok, raw] = pcall(() =>
		(method as (player: Player) => unknown)(player),
	);
	if (!ok || !typeIs(raw, "table")) {
		return table.freeze({ dirty: false });
	}
	const info = raw as UnknownTable;
	return table.freeze({
		lastSaveAt: info.LastSaveAt as number | undefined,
		lastResult: info.LastResult as "Ok" | "Fail" | undefined,
		dirty: info.Dirty === true,
		size: info.Size as number | undefined,
	});
}

function readLeaderboard(
	active: object,
	name: string,
): ReadonlyArray<Readonly<Record<string, unknown>>> {
	const method = (active as UnknownTable).GetLeaderboard;
	if (!typeIs(method, "function")) return [];
	const [ok, raw] = pcall(() =>
		(method as (name: string) => unknown)(name),
	);
	if (!ok || !typeIs(raw, "table")) return [];
	const entries = new Array<Readonly<Record<string, unknown>>>();
	for (const value of raw as ReadonlyArray<unknown>) {
		if (!typeIs(value, "table")) continue;
		const entry = value as UnknownTable;
		entries.push(
			table.freeze({
				rank: entry.Rank,
				userId: entry.UserId,
				name: entry.Name,
				score: entry.Score,
			}),
		);
	}
	return table.freeze(entries);
}

function normalizeLogEntry(raw: unknown): ScribeLogEntry {
	if (!typeIs(raw, "table")) {
		return table.freeze({
			at: os.time(),
			level: "Error",
			category: "Integrity",
			code: "UNKNOWN",
			message: tostring(raw),
		});
	}
	const entry = raw as UnknownTable;
	return table.freeze({
		at: (entry.At ?? entry.at ?? os.time()) as number,
		level: (entry.Level ?? entry.level ?? "Error") as ScribeLogEntry["level"],
		category: (entry.Category ??
			entry.category ??
			"Integrity") as ScribeLogEntry["category"],
		code: tostring(entry.Code ?? entry.code ?? "UNKNOWN"),
		message: tostring(entry.Message ?? entry.message ?? ""),
		context:
			immutableIngressValue(
				entry.Context ?? entry.context,
			) as ScribeLogEntry["context"],
	});
}
