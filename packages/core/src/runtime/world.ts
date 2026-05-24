/**
 * jecs `World` wrapper. Translates rovy class constructors ↔ jecs component
 * ids via `componentMap`. Phase 2 scope: structural ops + resources. Commands
 * (deferred mutation) layer lands in Phase 3 — direct world ops here are the
 * escape hatch and the substrate Commands flushes onto.
 */

import {
	world as createJecsWorld,
	pair as jecsPair,
	record as jecsRecord,
	bulk_insert as jecsBulkInsert,
	ChildOf as JecsChildOf,
	Wildcard as JecsWildcard,
	OnDelete as JecsOnDelete,
	OnDeleteTarget as JecsOnDeleteTarget,
	Delete as JecsDelete,
	Remove as JecsRemove,
	Exclusive as JecsExclusive,
} from "@rovy/jecs";
import type { Entity as JecsEntity, World as JecsWorld } from "@rovy/jecs";
import type { CleanupPolicy, ComponentReg, Ctor } from "../contract";
import {
	ChildOf,
	Delete,
	Exclusive,
	OnDelete,
	OnDeleteTarget,
	Remove,
	Wildcard,
} from "../types";
import type { ComponentInspection, Entity, RefCleanupOptions, World } from "../types";
import { EntityRefStore } from "./ref";

/** Sentinel entity that holds every resource singleton as a jecs component. */
export class RovyWorld implements World {
	readonly jecs: JecsWorld;
	/** rovy component class → jecs component id. */
	readonly componentMap = new Map<Ctor, JecsEntity>();
	/** jecs component id → rovy component registry entry, for inspection. */
	private readonly componentRegById = new Map<JecsEntity, ComponentReg>();
	private readonly componentRegs = new Array<ComponentReg>();
	private readonly trackedEntities = new Set<Entity>();
	/** rovy resource class → jecs component id. */
	readonly resourceMap = new Map<Ctor, JecsEntity>();
	private readonly refs = new EntityRefStore();
	/** Bumped once per schedule run (Phase 4); change detection reads it. */
	changeTick = 0;
	/** Prefab ctors known to the runtime (set by App.start). */
	prefabCtors?: Set<Ctor>;
	/** Invokes a prefab's build() against a target entity. */
	prefabInvoker?: (ctor: Ctor, entity: Entity) => void;

	// ── change detection stores (Phase 7), keyed by jecs component id ────────
	/** entity → tick of last add OR set. */
	private changeStore = new Map<JecsEntity, Map<Entity, number>>();
	/** entity → tick of last add only (Added ⊂ Changed). */
	private addedStore = new Map<JecsEntity, Map<Entity, number>>();
	/** removed records since last drain. */
	private removedBuf = new Map<JecsEntity, Array<{ entity: Entity; value: unknown; tick: number }>>();

	private resourceEntity: JecsEntity;

	constructor() {
		this.jecs = createJecsWorld();
		this.resourceEntity = this.jecs.entity();
		this.initBuiltinRelations();
	}

	// ── change detection ────────────────────────────────────────────────────

	private initChangeStore(jecsId: JecsEntity): {
		changed: Map<Entity, number>;
		added: Map<Entity, number>;
		removed: Array<{ entity: Entity; value: unknown; tick: number }>;
	} {
		let changed = this.changeStore.get(jecsId);
		let added = this.addedStore.get(jecsId);
		let removed = this.removedBuf.get(jecsId);
		if (changed === undefined) {
			changed = new Map<Entity, number>();
			this.changeStore.set(jecsId, changed);
		}
		if (added === undefined) {
			added = new Map<Entity, number>();
			this.addedStore.set(jecsId, added);
		}
		if (removed === undefined) {
			removed = [];
			this.removedBuf.set(jecsId, removed);
		}
		return { changed, added, removed };
	}

	/** Install jecs add/change/remove listeners for a component (App.start). */
	registerChangeDetection(jecsId: JecsEntity): void {
		const { changed, added, removed } = this.initChangeStore(jecsId);

		this.jecs.added(jecsId as never, (e: Entity) => {
			changed.set(e, this.changeTick);
			added.set(e, this.changeTick);
		});
		this.jecs.changed(jecsId as never, (e: Entity) => {
			changed.set(e, this.changeTick);
		});
		this.jecs.removed(jecsId as never, (e: Entity) => {
			// on_remove fires before the archetype move → value still readable
			const value = this.jecs.get(e, jecsId as never);
			removed.push({ entity: e, value, tick: this.changeTick });
			changed.delete(e);
			added.delete(e);
		});
	}

	changedTickOf(jecsId: JecsEntity, entity: Entity): number | undefined {
		return this.changeStore.get(jecsId)?.get(entity);
	}
	addedTickOf(jecsId: JecsEntity, entity: Entity): number | undefined {
		return this.addedStore.get(jecsId)?.get(entity);
	}
	changedSince(jecsId: JecsEntity, lastRunTick: number): Array<Entity> {
		return ticksSince(this.changeStore.get(jecsId), lastRunTick);
	}
	addedSince(jecsId: JecsEntity, lastRunTick: number): Array<Entity> {
		return ticksSince(this.addedStore.get(jecsId), lastRunTick);
	}
	removedSince(jecsId: JecsEntity, lastRunTick: number): Array<Entity> {
		const buf = this.removedBuf.get(jecsId);
		if (buf === undefined) return [];
		const out: Array<Entity> = [];
		for (const rec of buf) if (rec.tick > lastRunTick) out.push(rec.entity);
		return out;
	}
	/** Drain removed buffers at the schedule-run boundary. */
	clearRemoved(): void {
		for (const [, buf] of this.removedBuf) {
			while (buf.size() > 0) buf.pop();
		}
	}

	// ── id resolution ───────────────────────────────────────────────────────

	private idOf(component: Ctor): JecsEntity {
		const builtin = this.builtinComponentMap.get(component);
		if (builtin !== undefined) return builtin;
		const id = this.componentMap.get(component);
		assert(id !== undefined, `[rovy] component not registered: ${tostring(component)} — did rovy.loadPaths run before app.start?`);
		return id;
	}
	componentId(component: Ctor): JecsEntity {
		return this.idOf(component);
	}

	/** Register a component class (called by App.start finalize). */
	registerComponent(component: Ctor): JecsEntity {
		let id = this.componentMap.get(component);
		if (id === undefined) {
			id = this.jecs.component();
			this.componentMap.set(component, id);
		}
		return id;
	}

	/** Register a component and keep its authoring metadata available for tools. */
	registerComponentEntry(entry: ComponentReg): JecsEntity {
		const id = this.registerComponent(entry.ctor);
		this.componentRegById.set(id, entry);
		let seen = false;
		for (const existing of this.componentRegs) {
			if (existing.ctor === entry.ctor) {
				seen = true;
				break;
			}
		}
		if (!seen) this.componentRegs.push(entry);
		return id;
	}

	/** Register a resource class + return its jecs id (App.start finalize). */
	registerResource(resource: Ctor): JecsEntity {
		let id = this.resourceMap.get(resource);
		if (id === undefined) {
			id = this.jecs.component();
			this.resourceMap.set(resource, id);
		}
		return id;
	}

	// ── bundle classification ───────────────────────────────────────────────

	private applyBundle(entity: JecsEntity, bundle: ReadonlyArray<object>): void {
		for (const item of bundle) {
			if (this.prefabCtors !== undefined && this.prefabCtors.has(item as unknown as Ctor)) {
				this.applyBundleSlow(entity, bundle);
				return;
			}
		}
		const ids = new Array<JecsEntity>();
		const values = new Array<defined>();
		for (const item of bundle) {
			if (this.componentMap.has(item as unknown as Ctor)) {
				ids.push(this.idOf(item as unknown as Ctor));
				values.push(false);
			} else {
				const cls = getmetatable(item) as unknown as Ctor;
				ids.push(this.idOf(cls));
				values.push(item as defined);
			}
		}
		if (ids.size() > 0) jecsBulkInsert(this.jecs, entity, ids as never, values as never);
	}

	private applyBundleSlow(entity: JecsEntity, bundle: ReadonlyArray<object>): void {
		for (const item of bundle) {
			if (this.prefabCtors !== undefined && this.prefabCtors.has(item as unknown as Ctor)) {
				this.prefabInvoker!(item as unknown as Ctor, entity);
			} else if (this.componentMap.has(item as unknown as Ctor)) {
				// bare class → tag
				this.jecs.add(entity, this.idOf(item as unknown as Ctor) as never);
			} else {
				// instance → its class is its metatable
				const cls = getmetatable(item) as unknown as Ctor;
				this.jecs.set(entity, this.idOf(cls), item as never);
			}
		}
	}

	// ── World interface ─────────────────────────────────────────────────────

	spawn(...bundle: ReadonlyArray<object>): Entity {
		const entity = this.jecs.entity();
		this.trackedEntities.add(entity);
		this.applyBundle(entity, bundle);
		return entity;
	}

	despawn(entity: Entity, options?: RefCleanupOptions): void {
		if (options?.cleanupRefs === true) this.refs.deleteEntity(entity, options);
		this.trackedEntities.delete(entity);
		this.jecs.delete(entity);
	}

	insert(entity: Entity, componentOrTag: object | Ctor): void {
		this.applyBundleSlow(entity, [componentOrTag as object]);
	}

	set<T extends object>(entity: Entity, component: Ctor<T>, value: T): void {
		this.jecs.set(entity, this.idOf(component), value as never);
	}

	remove(entity: Entity, component: Ctor): void {
		this.jecs.remove(entity, this.idOf(component));
	}

	has(entity: Entity, component: Ctor): boolean {
		return this.jecs.has(entity, this.idOf(component));
	}

	get<T extends object>(entity: Entity, component: Ctor<T>): T | undefined {
		return this.jecs.get(entity, this.idOf(component)) as T | undefined;
	}

	ref(key: unknown): Entity {
		return this.refs.ensure(key, () => {
			const entity = this.jecs.entity();
			this.trackedEntities.add(entity);
			return entity;
		});
	}

	getRef(key: unknown): Entity | undefined {
		return this.refs.get(key);
	}

	hasRef(key: unknown): boolean {
		return this.refs.has(key);
	}

	deleteRef(key: unknown, options?: RefCleanupOptions): boolean {
		return this.refs.delete(key, options);
	}

	// ── resources ───────────────────────────────────────────────────────────

	/** Store a resource instance on the sentinel entity (App.start / insertResource). */
	setResource(resource: Ctor, instance: object): void {
		const id = this.resourceMap.get(resource);
		assert(id !== undefined, `[rovy] resource not registered: ${tostring(resource)}`);
		this.jecs.set(this.resourceEntity, id, instance as never);
	}

	resource<T extends object>(resource: Ctor<T>): T {
		const id = this.resourceMap.get(resource as unknown as Ctor);
		assert(id !== undefined, `[rovy] resource not registered: ${tostring(resource)}`);
		const value = this.jecs.get(this.resourceEntity, id) as T | undefined;
		assert(value !== undefined, `[rovy] resource has no value: ${tostring(resource)}`);
		return value;
	}

	/** Like `resource` but returns undefined instead of asserting (OptRes<T>). */
	optResource<T extends object>(resource: Ctor<T>): T | undefined {
		const id = this.resourceMap.get(resource as unknown as Ctor);
		if (id === undefined) return undefined;
		return this.jecs.get(this.resourceEntity, id) as T | undefined;
	}

	insertResource(instance: object): void {
		const cls = getmetatable(instance) as unknown as Ctor;
		// allow override before or after start: register lazily if needed
		if (!this.resourceMap.has(cls)) {
			this.registerResource(cls);
		}
		this.setResource(cls, instance);
	}

	// ── relationship / trigger / schedule stubs (later phases) ──────────────

	/** rovy relation class → jecs relation component id. */
	readonly relationMap = new Map<Ctor, JecsEntity>();
	private readonly builtinComponentMap = new Map<Ctor, JecsEntity>();
	private readonly builtinRelationMap = new Map<Ctor, JecsEntity>();
	private readonly relationChangeIds = new Set<JecsEntity>();

	private initBuiltinRelations(): void {
		this.builtinComponentMap.set(ChildOf, JecsChildOf);
		this.builtinComponentMap.set(OnDelete, JecsOnDelete);
		this.builtinComponentMap.set(OnDeleteTarget, JecsOnDeleteTarget);
		this.builtinComponentMap.set(Delete, JecsDelete);
		this.builtinComponentMap.set(Remove, JecsRemove);
		this.builtinComponentMap.set(Exclusive, JecsExclusive);
		this.builtinComponentMap.set(Wildcard, JecsWildcard);
		this.builtinRelationMap.set(ChildOf, JecsChildOf);
		this.builtinRelationMap.set(OnDelete, JecsOnDelete);
		this.builtinRelationMap.set(OnDeleteTarget, JecsOnDeleteTarget);
		for (const [, id] of this.builtinRelationMap) this.registerRelationChangeDetection(id);
	}

	registerRelation(
		relation: Ctor,
		opts: { exclusive: boolean; onTargetDelete: CleanupPolicy; onDelete: CleanupPolicy },
	): JecsEntity {
		let rid = this.relationMap.get(relation);
		if (rid === undefined) {
			rid = this.jecs.component();
			this.relationMap.set(relation, rid);
		}
		if (opts.exclusive) this.jecs.add(rid, JecsExclusive);
		const policy = (p: CleanupPolicy) => (p === "cascade" ? JecsDelete : p === "remove" ? JecsRemove : undefined);
		const ondel = policy(opts.onDelete);
		if (ondel !== undefined) this.jecs.add(rid, jecsPair(JecsOnDelete, ondel) as never);
		const ontgt = policy(opts.onTargetDelete);
		if (ontgt !== undefined) this.jecs.add(rid, jecsPair(JecsOnDeleteTarget, ontgt) as never);
		this.registerRelationChangeDetection(rid);
		return rid;
	}

	relationId(relation: Ctor): JecsEntity {
		const builtin = this.builtinRelationMap.get(relation);
		if (builtin !== undefined) return builtin;
		const rid = this.relationMap.get(relation);
		assert(rid !== undefined, `[rovy] relation not registered: ${tostring(relation)}`);
		return rid;
	}

	private registerRelationChangeDetection(relationId: JecsEntity): void {
		const changeId = jecsPair(relationId, JecsWildcard) as unknown as JecsEntity;
		if (this.relationChangeIds.has(changeId)) return;
		this.relationChangeIds.add(changeId);
		this.initChangeStore(changeId);
	}

	private markRelationChanged(changeId: JecsEntity, entity: Entity): void {
		const { changed } = this.initChangeStore(changeId);
		changed.set(entity, this.changeTick);
	}

	private markRelationAdded(changeId: JecsEntity, entity: Entity): void {
		const { changed, added } = this.initChangeStore(changeId);
		changed.set(entity, this.changeTick);
		added.set(entity, this.changeTick);
	}

	private markRelationRemoved(changeId: JecsEntity, entity: Entity, value: unknown): void {
		const { changed, added, removed } = this.initChangeStore(changeId);
		removed.push({ entity, value, tick: this.changeTick });
		changed.delete(entity);
		added.delete(entity);
	}

	/** Component or relation id used by Changed/Added/Removed filters. */
	tickFilterId(token: Ctor): JecsEntity {
		if (this.builtinRelationMap.has(token) || this.relationMap.has(token)) return this.wildcardPairId(token);
		const component = this.componentMap.get(token) ?? this.builtinComponentMap.get(token);
		if (component !== undefined) return component;
		return this.wildcardPairId(token);
	}

	/** jecs pair id for (relation, target). */
	pairId(relation: Ctor, target: Entity): JecsEntity {
		return jecsPair(this.relationId(relation), target) as unknown as JecsEntity;
	}
	/** jecs pair id for (relation, *) — wildcard. */
	wildcardPairId(relation: Ctor): JecsEntity {
		return jecsPair(this.relationId(relation), JecsWildcard) as unknown as JecsEntity;
	}

	relate(source: Entity, relation: Ctor, target: Entity, data?: object): void {
		const pid = this.pairId(relation, target);
		const changeId = this.wildcardPairId(relation);
		const had = this.jecs.has(source, pid as never);
		if (data !== undefined) this.jecs.set(source, pid as never, data as never);
		else this.jecs.add(source, pid as never);
		if (!had) this.markRelationAdded(changeId, source);
		else if (data !== undefined) this.markRelationChanged(changeId, source);
	}
	unrelate(source: Entity, relation: Ctor, target: Entity): void {
		const pid = this.pairId(relation, target);
		if (this.jecs.has(source, pid as never)) {
			const value = this.jecs.get(source, pid as never);
			this.jecs.remove(source, pid as never);
			this.markRelationRemoved(this.wildcardPairId(relation), source, value);
		}
	}
	hasRelation(source: Entity, relation: Ctor, target: Entity): boolean {
		return this.jecs.has(source, this.pairId(relation, target) as never);
	}
	getRelation<T extends object>(source: Entity, relation: Ctor<T>, target: Entity): T | undefined {
		return this.jecs.get(source, this.pairId(relation as unknown as Ctor, target) as never) as T | undefined;
	}
	/** First target of a relation on an entity (or undefined). */
	relationTarget(source: Entity, relation: Ctor, index = 0): Entity | undefined {
		return this.jecs.target(source, this.relationId(relation), index);
	}
	parent(entity: Entity): Entity | undefined {
		return this.jecs.parent(entity);
	}
	children(parent: Entity): IterableFunction<Entity> {
		return this.jecs.children(parent);
	}
	/** Set by App to dispatch to observers immediately. */
	triggerImpl?: (event: object) => void;
	trigger(event: object): void {
		assert(this.triggerImpl !== undefined, "[rovy] world.trigger unavailable (App not started?)");
		this.triggerImpl(event);
	}
	/** Set by App to delegate into the scheduler. */
	runScheduleImpl?: (schedule: Ctor, dt?: number) => void;
	runSchedule(schedule: Ctor, dt?: number): void {
		assert(this.runScheduleImpl !== undefined, "[rovy] world.runSchedule unavailable (App not constructed?)");
		this.runScheduleImpl(schedule, dt);
	}
	/** Set by App to delegate into the command flush. */
	flushImpl?: () => void;
	flush(): void {
		assert(this.flushImpl !== undefined, "[rovy] world.flush unavailable (App not constructed?)");
		this.flushImpl();
	}

	inspectEntities(): Entity[] {
		const out = new Array<Entity>();
		for (const entity of this.trackedEntities) {
			if (this.jecs.contains(entity)) out.push(entity);
			else this.trackedEntities.delete(entity);
		}
		return out;
	}

	inspectRegisteredComponents(): ReadonlyArray<ComponentReg> {
		return this.componentRegs;
	}

	inspectEntityComponents(entity: Entity): ReadonlyArray<ComponentInspection> {
		if (!this.jecs.contains(entity)) return [];
		const out = new Array<ComponentInspection>();
		const rec = jecsRecord(this.jecs, entity);
		for (const jecsId of rec.archetype.types) {
			const entry = this.componentRegById.get(jecsId);
			if (entry === undefined) continue;
			const value = this.jecs.get(entity, jecsId as never) as unknown;
			out.push({
				ctor: entry.ctor,
				id: entry.id,
				name: shortComponentName(entry.id),
				value,
				tag: value === undefined,
				editor: entry.editor,
			});
		}
		return out;
	}
}

function shortComponentName(id: string): string {
	const pathParts = id.split("/");
	const tail = pathParts[pathParts.size() - 1] ?? id;
	const scopeParts = tail.split("@");
	return scopeParts[scopeParts.size() - 1] ?? tail;
}

function ticksSince(store: Map<Entity, number> | undefined, lastRunTick: number): Array<Entity> {
	if (store === undefined) return [];
	const out = new Array<Entity>();
	for (const [entity, tick] of store) {
		if (tick > lastRunTick) out.push(entity);
	}
	return out;
}
