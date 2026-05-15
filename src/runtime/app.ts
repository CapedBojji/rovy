/**
 * `App` — boot + finalize. Phase 2 scope: finalize steps 1–2 (components →
 * jecs ids; resources → ids + auto-instantiate default ctor; insertResource
 * override). Scheduler / events / monitors / plugins land in later phases.
 */

import { rovy } from "../rovy";
import type { Ctor } from "../contract";
import { CommandsImpl } from "./commands";
import { flush } from "./flush";
import { Scheduler } from "./schedule";
import { RovyWorld } from "./world";

export class App {
	readonly world = new RovyWorld();
	readonly commands: CommandsImpl;
	readonly scheduler: Scheduler;
	private started = false;
	/** Overrides supplied before start(); applied after resource registration. */
	private resourceOverrides = new Map<Ctor, object>();

	/** Plugin support is Phase 11 — accepted now, build() invoked at start. */
	private plugins: Array<{ build(app: App): void }> = [];

	constructor() {
		this.commands = new CommandsImpl(this.world);
		this.scheduler = new Scheduler(this.world, this.commands);
		// wire deferred command → scheduler / world hooks
		this.commands.deferredRunSchedule = (s) => this.scheduler.run(s);
		this.world.runScheduleImpl = (s) => this.scheduler.run(s);
		this.world.flushImpl = () => flush(this.commands);
	}

	/** Apply queued commands to convergence (escape hatch; scheduler flushes at set boundaries). */
	flush(): this {
		flush(this.commands);
		return this;
	}

	/** Declare set order within a schedule. Call before start() (e.g. in a plugin). */
	configureSets(schedule: Ctor, order: ReadonlyArray<Ctor>): this {
		this.scheduler.configureSets(schedule, order);
		return this;
	}

	/** Run a schedule now (drives the game loop). */
	runSchedule(schedule: Ctor): this {
		this.scheduler.run(schedule);
		return this;
	}

	addPlugin(plugin: { build(app: App): void }): this {
		this.plugins.push(plugin);
		return this;
	}

	/**
	 * Override an auto-registered resource's default. Before start(): queued.
	 * After start(): applied immediately.
	 */
	insertResource(instance: object): this {
		if (this.started) {
			this.world.insertResource(instance);
		} else {
			this.resourceOverrides.set(getmetatable(instance) as unknown as Ctor, instance);
		}
		return this;
	}

	/** Finalize the registry into a live world. Must run after rovy.loadPaths. */
	start(): this {
		assert(!this.started, "[rovy] app.start called twice");
		const reg = rovy.registry;
		assert(
			reg.components.size() > 0 || reg.systems.size() > 0 || reg.resources.size() > 0,
			"[rovy] empty registry — call rovy.loadPaths(...) before app.start()",
		);

		for (const plugin of this.plugins) {
			plugin.build(this);
		}

		// 1. components → jecs ids
		for (const entry of reg.components) {
			this.world.registerComponent(entry.ctor);
		}

		// 2. resources → jecs ids + auto-instantiate default ctor (or override)
		for (const entry of reg.resources) {
			this.world.registerResource(entry.ctor);
			const override = this.resourceOverrides.get(entry.ctor);
			if (override !== undefined) {
				this.world.setResource(entry.ctor, override);
			} else {
				const factory = entry.ctor as unknown as new () => object;
				this.world.setResource(entry.ctor, new factory());
			}
		}

		// any overrides for resources NOT in the registry (manual-only)
		for (const [cls, instance] of this.resourceOverrides) {
			if (this.world.resourceMap.get(cls) === undefined) {
				this.world.insertResource(instance);
			}
		}

		// 3. build scheduler (schedules → sets → systems), then fire runOnStart
		this.scheduler.build(reg);
		this.started = true;
		for (const s of this.scheduler.runOnStartList()) {
			this.scheduler.run(s);
		}
		return this;
	}

	/** True once finalize has run. */
	isStarted(): boolean {
		return this.started;
	}
}
