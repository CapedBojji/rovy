import type {
	AnyScribeData,
} from "./definitions";
import type {
	ScribeCooldownState,
	ScribeCooldowns,
} from "./services";
import type {
	ScribeJobHandle,
	ScribeJobResult,
} from "./types";
import {
	failedJob,
	ScribeJobRuntime,
	type ScribeJobOwner,
	successfulJob,
} from "./job-runtime";
import type {
	ScribeWriteQueue,
} from "./write-queue";
import {
	assertScribeFeatureBoundary,
	assertScribeFeatureName,
	assertScribePlayer,
	callScribeFeature,
	callScribeFeatureTuple,
	type ScribeFeatureBoundary,
} from "./feature-utils";

export class ScribeCooldownsRuntime
	implements ScribeCooldowns<AnyScribeData>
{
	private readonly owner: ScribeJobOwner;

	constructor(
		readonly definition: AnyScribeData,
		private readonly boundary: ScribeFeatureBoundary,
		private readonly native: object,
		private readonly jobs: ScribeJobRuntime,
		private readonly writes: ScribeWriteQueue,
	) {
		this.owner = jobs.owner("cooldowns", definition.id);
	}

	onCooldown(
		player: Player,
		key: string,
		seconds: number,
	): ScribeJobHandle<ScribeCooldownState> {
		this.assertServerOperation(player, key, "onCooldown");
		assert(
			seconds >= 0 && seconds === seconds,
			"[rovy/scribe] cooldowns.onCooldown seconds must be a non-negative number",
		);
		const handle = this.jobs.reserveBuffered<ScribeCooldownState>(
			this.owner,
			"onCooldown",
			player,
		);
		this.writes.enqueueCustom(
			this.definition.id,
			player,
			"onCooldown",
			() => {
				if (!this.jobs.canRunBuffered(this.owner, handle)) return;
				const [called, activeOrError, remaining] = pcall(() =>
					callScribeFeatureTuple(
						this.native,
						"OnCooldown",
						this.boundary,
						player,
						key,
						seconds,
					),
				);
				if (!called) {
					this.jobs.completeBuffered(
						this.owner,
						handle,
						failedJob(
							`onCooldown-error: ${tostring(activeOrError)}`,
						),
					);
					error(activeOrError);
				}
				this.jobs.completeBuffered(
					this.owner,
					handle,
					successfulJob(
						normalizeCooldownState(
							activeOrError,
							remaining,
							"OnCooldown",
						),
					),
				);
			},
			(errorMessage) => {
				if (!this.jobs.canRunBuffered(this.owner, handle)) return;
				this.jobs.completeBuffered(
					this.owner,
					handle,
					failedJob(`onCooldown-write-failed: ${errorMessage}`),
				);
			},
		);
		return handle;
	}

	peek(player: Player, key: string): ScribeCooldownState {
		this.assertServerOperation(player, key, "peek");
		const [active, remaining] = callScribeFeatureTuple(
			this.native,
			"PeekCooldown",
			this.boundary,
			player,
			key,
		);
		return normalizeCooldownState(active, remaining, "PeekCooldown");
	}

	clear(player: Player, key: string): void {
		this.assertServerOperation(player, key, "clear");
		this.writes.enqueueCustom(
			this.definition.id,
			player,
			"clearCooldown",
			() => {
				callScribeFeature(
					this.native,
					"ClearCooldown",
					this.boundary,
					player,
					key,
				);
			},
		);
	}

	hasResult<T>(handle: ScribeJobHandle<T>): boolean {
		return this.jobs.hasResult(this.owner, handle);
	}

	takeResult<T>(
		handle: ScribeJobHandle<T>,
	): ScribeJobResult<T> | undefined {
		return this.jobs.takeResult(this.owner, handle);
	}

	private assertServerOperation(
		player: Player,
		key: string,
		operation: string,
	): void {
		assertScribeFeatureBoundary(
			this.boundary,
			"server",
			`cooldowns.${operation}`,
		);
		assertScribePlayer(player, `cooldowns.${operation}`);
		assertScribeFeatureName(key, `cooldowns.${operation}`, "key");
	}
}

function normalizeCooldownState(
	active: unknown,
	remaining: unknown,
	nativeName: string,
): ScribeCooldownState {
	assert(
		typeIs(active, "boolean") && typeIs(remaining, "number"),
		`[rovy/scribe] native ${nativeName} returned a malformed cooldown state`,
	);
	return table.freeze({
		onCooldown: active,
		remaining,
	});
}
