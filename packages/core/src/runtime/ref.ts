import { Janitor } from "@rbxts/better-janitor";
import type { Entity, RefCleanupOptions } from "../types";

type JanitorInstance = InstanceType<typeof Janitor>;

interface RefEntry {
	readonly key: unknown;
	readonly entity: Entity;
	readonly janitor: JanitorInstance;
}

function bindKeyCleanup(janitor: JanitorInstance, key: unknown): void {
	if (typeIs(key, "Instance")) {
		janitor.addInstance(key);
		return;
	}
	if (!typeIs(key, "table")) return;

	const maybe = key as {
		destroy?: Callback;
		Destroy?: Callback;
		disconnect?: Callback;
		Disconnect?: Callback;
		cancel?: Callback;
	};
	if (typeIs(maybe.destroy, "function")) {
		janitor.addSelf(maybe as { destroy: (self: unknown, ...args: Array<unknown>) => unknown });
	} else if (typeIs(maybe.Destroy, "function")) {
		janitor.add(maybe, "Destroy");
	} else if (typeIs(maybe.disconnect, "function")) {
		janitor.add(maybe, "disconnect");
	} else if (typeIs(maybe.Disconnect, "function")) {
		janitor.add(maybe, "Disconnect");
	} else if (typeIs(maybe.cancel, "function")) {
		janitor.add(maybe, "cancel");
	}
}

export class EntityRefStore {
	private readonly entryByKey = new Map<unknown, RefEntry>();
	private readonly entryByEntity = new Map<Entity, RefEntry>();

	ensure(key: unknown, create: () => Entity): Entity {
		const existing = this.entryByKey.get(key);
		if (existing !== undefined) return existing.entity;

		const entity = create();
		const janitor = new Janitor();
		bindKeyCleanup(janitor, key);
		const entry: RefEntry = { key, entity, janitor };
		this.entryByKey.set(key, entry);
		this.entryByEntity.set(entity, entry);
		return entity;
	}

	get(key: unknown): Entity | undefined {
		return this.entryByKey.get(key)?.entity;
	}

	has(key: unknown): boolean {
		return this.entryByKey.has(key);
	}

	delete(key: unknown, options?: RefCleanupOptions): boolean {
		const entry = this.entryByKey.get(key);
		if (entry === undefined) return false;
		this.entryByKey.delete(entry.key);
		this.entryByEntity.delete(entry.entity);
		if (options?.cleanupRefs === true) entry.janitor.cleanup();
		return true;
	}

	deleteEntity(entity: Entity, options?: RefCleanupOptions): boolean {
		const entry = this.entryByEntity.get(entity);
		if (entry === undefined) return false;
		this.entryByEntity.delete(entry.entity);
		this.entryByKey.delete(entry.key);
		if (options?.cleanupRefs === true) entry.janitor.cleanup();
		return true;
	}
}
