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
import type { Entity as JecsEntity, Id as JecsId, Query as JecsQuery, World as JecsWorld } from "@rovy/jecs";
import type { CleanupPolicy, ComponentReg, Ctor, ResourceInspectFieldReg, ResourceReg } from "../contract";
import {
	ChildOf,
	Delete,
	Exclusive,
	OnDelete,
	OnDeleteTarget,
	Remove,
	Wildcard,
} from "../types";
import type { ComponentInspection, Entity, RefCleanupOptions, RefOptions, ResourceInspection, World } from "../types";
import type { LifecycleHub } from "./lifecycle";
import { EntityRefStore } from "./ref";

export interface ResourceTrackScope {
	readonly baselines: Map<Ctor, object>;
	readonly clones: Map<Ctor, object>;
}

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
	private readonly resourceRegByCtor = new Map<Ctor, ResourceReg>();
	private readonly resourceRegs = new Array<ResourceReg>();
	private readonly resourceRevisions = new Map<Ctor, number>();
	private readonly resourceChangedPaths = new Map<Ctor, Array<ReadonlyArray<string>>>();
	private readonly refs = new EntityRefStore();
	/** Bumped once per schedule run (Phase 4); change detection reads it. */
	changeTick = 0;
	/** Prefab ctors known to the runtime (set by App.start). */
	prefabCtors?: Set<Ctor>;
	/** Invokes a prefab's build() against a target entity. */
	prefabInvoker?: (ctor: Ctor, entity: Entity) => void;
	lifecycle?: LifecycleHub;

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
			const entry = this.componentRegById.get(jecsId);
			if (entry !== undefined) {
				this.lifecycle?.emit({
					kind: "component_added",
					ctor: entry.ctor,
					id: entry.id,
					name: shortComponentName(entry.id),
					entity: e,
					value: this.jecs.get(e, jecsId as never),
				});
			}
		});
		this.jecs.changed(jecsId as never, (e: Entity) => {
			changed.set(e, this.changeTick);
			const entry = this.componentRegById.get(jecsId);
			if (entry !== undefined) {
				this.lifecycle?.emit({
					kind: "component_changed",
					ctor: entry.ctor,
					id: entry.id,
					name: shortComponentName(entry.id),
					entity: e,
					value: this.jecs.get(e, jecsId as never),
				});
			}
		});
		this.jecs.removed(jecsId as never, (e: Entity) => {
			// on_remove fires before the archetype move → value still readable
			const value = this.jecs.get(e, jecsId as never);
			removed.push({ entity: e, value, tick: this.changeTick });
			changed.delete(e);
			added.delete(e);
			const entry = this.componentRegById.get(jecsId);
			if (entry !== undefined) {
				this.lifecycle?.emit({
					kind: "component_removed",
					ctor: entry.ctor,
					id: entry.id,
					name: shortComponentName(entry.id),
					entity: e,
					oldValue: value,
				});
			}
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
	/** Like `removedSince`, but returns full records including pre-remove value. Frame recorder uses this. */
	removedRecordsSince(jecsId: JecsEntity, lastRunTick: number): Array<{ entity: Entity; value: unknown; tick: number }> {
		const buf = this.removedBuf.get(jecsId);
		if (buf === undefined) return [];
		const out: Array<{ entity: Entity; value: unknown; tick: number }> = [];
		for (const rec of buf) if (rec.tick > lastRunTick) out.push(rec);
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

	registerResourceEntry(entry: ResourceReg): JecsEntity {
		const id = this.registerResource(entry.ctor);
		this.resourceRegByCtor.set(entry.ctor, entry);
		let seen = false;
		for (const existing of this.resourceRegs) {
			if (existing.ctor === entry.ctor) {
				seen = true;
				break;
			}
		}
		if (!seen) this.resourceRegs.push(entry);
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
		return this.withLifecycleMutation(() => {
			const entity = this.jecs.entity();
			this.trackedEntities.add(entity);
			this.lifecycle?.emit({ kind: "entity_spawned", entity });
			this.applyBundle(entity, bundle);
			return entity;
		});
	}

	despawn(entity: Entity, options?: RefCleanupOptions): void {
		this.withLifecycleMutation(() => {
			if (options?.cleanupRefs === true) this.refs.deleteEntity(entity, options);
			this.lifecycle?.emit({ kind: "entity_despawned", entity });
			this.trackedEntities.delete(entity);
			this.jecs.delete(entity);
		});
	}

	insert(entity: Entity, componentOrTag: object | Ctor): void {
		this.withLifecycleMutation(() => {
			this.applyBundleSlow(entity, [componentOrTag as object]);
		});
	}

	set<T extends object>(entity: Entity, component: Ctor<T>, value: T): void {
		this.withLifecycleMutation(() => {
			this.jecs.set(entity, this.idOf(component), value as never);
		});
	}

	remove(entity: Entity, component: Ctor): void {
		this.withLifecycleMutation(() => {
			this.jecs.remove(entity, this.idOf(component));
		});
	}

	has(entity: Entity, component: Ctor): boolean {
		return this.jecs.has(entity, this.idOf(component));
	}

	get<T extends object>(entity: Entity, component: Ctor<T>): T | undefined {
		return this.jecs.get(entity, this.idOf(component)) as T | undefined;
	}

	ref(key: unknown, options?: RefOptions): Entity {
		return this.refs.ensure(key, () => {
			const entity = this.jecs.entity();
			this.trackedEntities.add(entity);
			return entity;
		}, options);
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
		this.withLifecycleMutation(() => {
			const cls = getmetatable(instance) as unknown as Ctor;
			// allow override before or after start: register lazily if needed
			if (!this.resourceMap.has(cls)) {
				this.registerResource(cls);
			}
			this.setResource(cls, instance);
			this.markResourceChanged(cls, []);
		});
	}

	beginResourceScope(): ResourceTrackScope {
		return { baselines: new Map(), clones: new Map() };
	}

	resolveResourceForInjection<T extends object>(
		resource: Ctor<T>,
		optional: boolean,
		scope?: ResourceTrackScope,
	): T | undefined {
		const raw = optional ? this.optResource(resource) : this.resource(resource);
		if (raw === undefined) return undefined;
		if (scope === undefined || this.resourceRegByCtor.get(resource as unknown as Ctor)?.inspect === undefined) {
			return raw;
		}
		const ctor = resource as unknown as Ctor;
		const existing = scope.clones.get(ctor) as T | undefined;
		if (existing !== undefined) return existing;
		const baseline = cloneResourceValue(raw) as object;
		const clone = cloneResourceValue(raw) as object;
		scope.baselines.set(ctor, baseline);
		scope.clones.set(ctor, clone);
		return clone as T;
	}

	commitResourceScope(scope: ResourceTrackScope): void {
		for (const [ctor, clone] of scope.clones) {
			const baseline = scope.baselines.get(ctor);
			if (baseline === undefined || inspectValuesEqual(baseline, clone)) continue;
			const entry = this.resourceRegByCtor.get(ctor);
			const paths = diffResourceValues(baseline, clone, entry?.inspect?.fields.map((field) => field.key) ?? []);
			this.setResource(ctor, clone);
			this.markResourceChanged(ctor, paths);
		}
	}

	inspectRegisteredResources(): ReadonlyArray<ResourceReg> {
		return this.resourceRegs.filter((entry) => entry.inspect !== undefined);
	}

	inspectResources(): ReadonlyArray<ResourceInspection> {
		const out = new Array<ResourceInspection>();
		for (const entry of this.inspectRegisteredResources()) {
			const inspected = this.inspectResource(entry.ctor);
			if (inspected !== undefined) out.push(inspected);
		}
		return out;
	}

	inspectResource(resource: Ctor): ResourceInspection | undefined {
		const entry = this.resourceRegByCtor.get(resource);
		if (entry?.inspect === undefined) return undefined;
		const value = this.optResource(resource as never);
		if (value === undefined) return undefined;
		return {
			ctor: entry.ctor,
			id: entry.id,
			name: shortComponentName(entry.id),
			value,
			inspect: entry.inspect,
			revision: this.resourceRevisions.get(entry.ctor) ?? 0,
			changedPaths: this.resourceChangedPaths.get(entry.ctor) ?? [],
		};
	}

	inspectSetResourceValue(resource: Ctor, path: ReadonlyArray<string>, value: unknown): { ok: boolean; error?: string } {
		return this.withLifecycleMutation(() => {
			const entry = this.resourceRegByCtor.get(resource);
			if (entry?.inspect === undefined) return { ok: false, error: "resource is not inspectable" };
			if (path.size() === 0) return { ok: false, error: "resource edit path is empty" };
			const topKey = path[0];
			let topField: ResourceInspectFieldReg | undefined;
			for (const field of entry.inspect.fields) {
				if (field.key === topKey) {
					topField = field;
					break;
				}
			}
			if (topField === undefined) return { ok: false, error: `resource field '${topKey}' is not inspectable` };
			if (path.size() === 1 && !topField.validator(value)) return { ok: false, error: `field '${topKey}' failed validator` };
			const root = this.resource(resource as never) as Record<string, unknown>;
			const target = resolveResourcePathParent(root, path);
			if (!target.ok) return target;
			target.parent[target.key as never] = value as never;
			this.markResourceChanged(resource, [path]);
			return { ok: true };
		});
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
		this.withLifecycleMutation(() => {
			const pid = this.pairId(relation, target);
			const changeId = this.wildcardPairId(relation);
			const had = this.jecs.has(source, pid as never);
			if (data !== undefined) this.jecs.set(source, pid as never, data as never);
			else this.jecs.add(source, pid as never);
			if (!had) {
				this.markRelationAdded(changeId, source);
				this.lifecycle?.emit({ kind: "relation_added", ctor: relation, relation, entity: source, target, data });
			} else if (data !== undefined) {
				this.markRelationChanged(changeId, source);
				this.lifecycle?.emit({ kind: "relation_changed", ctor: relation, relation, entity: source, target, data });
			}
		});
	}
	unrelate(source: Entity, relation: Ctor, target: Entity): void {
		this.withLifecycleMutation(() => {
			const pid = this.pairId(relation, target);
			if (this.jecs.has(source, pid as never)) {
				const value = this.jecs.get(source, pid as never);
				this.jecs.remove(source, pid as never);
				this.markRelationRemoved(this.wildcardPairId(relation), source, value);
				this.lifecycle?.emit({ kind: "relation_removed", ctor: relation, relation, entity: source, target, oldValue: value });
			}
		});
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

	/** Iterate every live entity holding the given component. Skips the resource sentinel entity. */
	entitiesWith(component: Ctor): Array<Entity> {
		const id = this.componentId(component);
		const out = new Array<Entity>();
		const q = this.jecs.query(id as never) as JecsQuery<Array<JecsId>>;
		for (const arch of q.archetypes()) {
			for (const e of arch.entities) {
				if (e === this.resourceEntity) continue;
				out.push(e);
			}
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

	private markResourceChanged(resource: Ctor, paths: ReadonlyArray<ReadonlyArray<string>>): void {
		const entry = this.resourceRegByCtor.get(resource);
		if (entry?.inspect !== undefined) {
			this.resourceRevisions.set(resource, (this.resourceRevisions.get(resource) ?? 0) + 1);
			this.resourceChangedPaths.set(resource, [...paths]);
		}
		this.lifecycle?.emit({
			kind: "resource_changed",
			ctor: resource,
			id: entry?.id,
			name: entry !== undefined ? shortComponentName(entry.id) : tostring(resource),
			value: this.optResource(resource as never),
			paths,
		});
	}

	private withLifecycleMutation<T>(body: () => T): T {
		const lifecycle = this.lifecycle;
		return lifecycle !== undefined ? lifecycle.withMutation(body) : body();
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

function cloneResourceValue(value: unknown, seen = new Map<object, object>()): unknown {
	if (!typeIs(value, "table")) return value;
	const source = value as object;
	const existing = seen.get(source);
	if (existing !== undefined) return existing;
	const out = {} as Record<string | number, unknown>;
	seen.set(source, out);
	for (const [key, child] of pairs(source as Record<never, unknown>)) {
		const outKey = typeIs(key, "number") || typeIs(key, "string") ? key : tostring(key);
		out[outKey] = cloneResourceValue(child, seen);
	}
	setmetatable(out, getmetatable(source) as never);
	return out;
}

function inspectValuesEqual(a: unknown, b: unknown, seen = new Map<object, Set<object>>()): boolean {
	if (a === b) return true;
	if (typeOf(a) !== typeOf(b)) return false;
	if (!typeIs(a, "table") || !typeIs(b, "table")) return false;
	const ao = a as object;
	const bo = b as object;
	let paired = seen.get(ao);
	if (paired?.has(bo)) return true;
	if (paired === undefined) {
		paired = new Set<object>();
		seen.set(ao, paired);
	}
	paired.add(bo);
	for (const [key, av] of pairs(ao as Record<never, unknown>)) {
		const bv = (bo as Record<never, unknown>)[key as never];
		if (!inspectValuesEqual(av, bv, seen)) return false;
	}
	for (const [key] of pairs(bo as Record<never, unknown>)) {
		if ((ao as Record<never, unknown>)[key as never] === undefined) return false;
	}
	return true;
}

function diffResourceValues(
	before: object,
	after: object,
	fieldKeys: ReadonlyArray<string>,
): Array<ReadonlyArray<string>> {
	const out = new Array<ReadonlyArray<string>>();
	if (fieldKeys.size() === 0) {
		diffValue(before, after, [], out, 0);
		return out;
	}
	for (const key of fieldKeys) {
		diffValue((before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key], [key], out, 0);
	}
	return out;
}

function diffValue(
	before: unknown,
	after: unknown,
	path: ReadonlyArray<string>,
	out: Array<ReadonlyArray<string>>,
	depth: number,
): void {
	if (inspectValuesEqual(before, after)) return;
	if (depth >= 4 || !typeIs(before, "table") || !typeIs(after, "table")) {
		out.push(path);
		return;
	}
	const keys = new Map<string, true>();
	for (const [key] of pairs(before as Record<never, unknown>)) keys.set(tostring(key), true);
	for (const [key] of pairs(after as Record<never, unknown>)) keys.set(tostring(key), true);
	for (const [key] of keys) {
		diffValue(
			findPathValue(before, key),
			findPathValue(after, key),
			[...path, key],
			out,
			depth + 1,
		);
	}
}

function findPathValue(parent: unknown, segment: string): unknown {
	if (!typeIs(parent, "table")) return undefined;
	for (const [key, value] of pairs(parent as Record<never, unknown>)) {
		if (tostring(key) === segment) return value;
	}
	return undefined;
}

function resolveResourcePathParent(
	root: Record<string, unknown>,
	path: ReadonlyArray<string>,
): { ok: true; parent: Record<never, unknown>; key: unknown } | { ok: false; error: string } {
	let current = root as unknown;
	for (let i = 0; i < path.size() - 1; i++) {
		const child = findPathValue(current, path[i]);
		if (!typeIs(child, "table")) return { ok: false, error: `resource path '${path.join(".")}' is not a table` };
		current = child;
	}
	if (!typeIs(current, "table")) return { ok: false, error: `resource path '${path.join(".")}' is not a table` };
	const finalSegment = path[path.size() - 1];
	for (const [key] of pairs(current as Record<never, unknown>)) {
		if (tostring(key) === finalSegment) return { ok: true, parent: current as Record<never, unknown>, key };
	}
	return { ok: true, parent: current as Record<never, unknown>, key: finalSegment };
}
