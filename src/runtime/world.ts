/**
 * jecs `World` wrapper. Translates rovy class constructors ↔ jecs component
 * ids via `componentMap`. Phase 2 scope: structural ops + resources. Commands
 * (deferred mutation) layer lands in Phase 3 — direct world ops here are the
 * escape hatch and the substrate Commands flushes onto.
 */

import { world as createJecsWorld } from "@rbxts/jecs";
import type { Entity as JecsEntity, World as JecsWorld } from "@rbxts/jecs";
import type { Ctor } from "../contract";
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

	private resourceEntity: JecsEntity;

	constructor() {
		this.jecs = createJecsWorld();
		this.resourceEntity = this.jecs.entity();
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

	relate(): void {
		error("[rovy] world.relate not implemented until Phase 10");
	}
	unrelate(): void {
		error("[rovy] world.unrelate not implemented until Phase 10");
	}
	hasRelation(): boolean {
		return error("[rovy] world.hasRelation not implemented until Phase 10");
	}
	getRelation<T extends object>(): T | undefined {
		return error("[rovy] world.getRelation not implemented until Phase 10");
	}
	trigger(): void {
		error("[rovy] world.trigger not implemented until Phase 6");
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
