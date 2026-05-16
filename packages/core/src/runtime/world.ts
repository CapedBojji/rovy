/**
 * jecs `World` wrapper. Translates rovy class constructors ↔ jecs component
 * ids via `componentMap`. Phase 2 scope: structural ops + resources. Commands
 * (deferred mutation) layer lands in Phase 3 — direct world ops here are the
 * escape hatch and the substrate Commands flushes onto.
 */

import {
	world as createJecsWorld,
	pair as jecsPair,
	Wildcard,
	OnDelete,
	OnDeleteTarget,
	Delete,
	Remove,
	Exclusive,
} from "@rbxts/jecs";
import type { Entity as JecsEntity, World as JecsWorld } from "@rbxts/jecs";
import type { CleanupPolicy, Ctor } from "../contract";
import type { Entity, World } from "../types";

/** Sentinel entity that holds every resource singleton as a jecs component. */
export class RovyWorld implements World {
	readonly jecs: JecsWorld;
	/** rovy component class → jecs component id. */
	readonly componentMap = new Map<Ctor, JecsEntity>();
	/** rovy resource class → jecs component id. */
	readonly resourceMap = new Map<Ctor, JecsEntity>();
	/** Bumped once per schedule run (Phase 4); change detection reads it. */
	changeTick = 0;

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
	}

	// ── change detection ────────────────────────────────────────────────────

	/** Install jecs add/change/remove listeners for a component (App.start). */
	registerChangeDetection(jecsId: JecsEntity): void {
		const changed = new Map<Entity, number>();
		const added = new Map<Entity, number>();
		const removed: Array<{ entity: Entity; value: unknown; tick: number }> = [];
		this.changeStore.set(jecsId, changed);
		this.addedStore.set(jecsId, added);
		this.removedBuf.set(jecsId, removed);

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
		const id = this.componentMap.get(component);
		assert(id !== undefined, `[rovy] component not registered: ${tostring(component)} — did rovy.loadPaths run before app.start?`);
		return id;
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
			if (this.componentMap.has(item as unknown as Ctor)) {
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
		this.applyBundle(entity, bundle);
		return entity;
	}

	despawn(entity: Entity): void {
		this.jecs.delete(entity);
	}

	insert(entity: Entity, componentOrTag: object | Ctor): void {
		this.applyBundle(entity, [componentOrTag as object]);
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

	registerRelation(
		relation: Ctor,
		opts: { exclusive: boolean; onTargetDelete: CleanupPolicy; onDelete: CleanupPolicy },
	): JecsEntity {
		let rid = this.relationMap.get(relation);
		if (rid === undefined) {
			rid = this.jecs.component();
			this.relationMap.set(relation, rid);
		}
		if (opts.exclusive) this.jecs.add(rid, Exclusive);
		const policy = (p: CleanupPolicy) => (p === "cascade" ? Delete : p === "remove" ? Remove : undefined);
		const ondel = policy(opts.onDelete);
		if (ondel !== undefined) this.jecs.add(rid, jecsPair(OnDelete, ondel) as never);
		const ontgt = policy(opts.onTargetDelete);
		if (ontgt !== undefined) this.jecs.add(rid, jecsPair(OnDeleteTarget, ontgt) as never);
		return rid;
	}

	private relId(relation: Ctor): JecsEntity {
		const rid = this.relationMap.get(relation);
		assert(rid !== undefined, `[rovy] relation not registered: ${tostring(relation)}`);
		return rid;
	}

	/** jecs pair id for (relation, target). */
	pairId(relation: Ctor, target: Entity): JecsEntity {
		return jecsPair(this.relId(relation), target) as unknown as JecsEntity;
	}
	/** jecs pair id for (relation, *) — wildcard. */
	wildcardPairId(relation: Ctor): JecsEntity {
		return jecsPair(this.relId(relation), Wildcard) as unknown as JecsEntity;
	}

	relate(source: Entity, relation: Ctor, target: Entity, data?: object): void {
		const pid = this.pairId(relation, target);
		if (data !== undefined) this.jecs.set(source, pid as never, data as never);
		else this.jecs.add(source, pid as never);
	}
	unrelate(source: Entity, relation: Ctor, target: Entity): void {
		this.jecs.remove(source, this.pairId(relation, target) as never);
	}
	hasRelation(source: Entity, relation: Ctor, target: Entity): boolean {
		return this.jecs.has(source, this.pairId(relation, target) as never);
	}
	getRelation<T extends object>(source: Entity, relation: Ctor<T>, target: Entity): T | undefined {
		return this.jecs.get(source, this.pairId(relation as unknown as Ctor, target) as never) as T | undefined;
	}
	/** First target of a relation on an entity (or undefined). */
	relationTarget(source: Entity, relation: Ctor): Entity | undefined {
		return this.jecs.target(source, this.relId(relation), 0);
	}
	/** Set by App to dispatch to observers immediately. */
	triggerImpl?: (event: object) => void;
	trigger(event: object): void {
		assert(this.triggerImpl !== undefined, "[rovy] world.trigger unavailable (App not started?)");
		this.triggerImpl(event);
	}
	/** Set by App to delegate into the scheduler. */
	runScheduleImpl?: (schedule: Ctor) => void;
	runSchedule(schedule: Ctor): void {
		assert(this.runScheduleImpl !== undefined, "[rovy] world.runSchedule unavailable (App not constructed?)");
		this.runScheduleImpl(schedule);
	}
	/** Set by App to delegate into the command flush. */
	flushImpl?: () => void;
	flush(): void {
		assert(this.flushImpl !== undefined, "[rovy] world.flush unavailable (App not constructed?)");
		this.flushImpl();
	}
}
