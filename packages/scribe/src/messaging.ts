import type { AnyScribeData } from "./definitions";
import type {
	ScribeMessaging,
} from "./services";
import type {
	ScribeJobHandle,
	ScribeJobResult,
	ScribeSerializable,
} from "./types";
import {
	cloneScribeValue,
	freezeScribeValue,
} from "./reader-tree";
import {
	failedJob,
	ScribeJobRuntime,
	type ScribeJobOwner,
	successfulJob,
} from "./job-runtime";
import {
	assertScribeSerializable,
} from "./serialization";

type UnknownTable = Record<string | number, unknown>;

export class ScribeMessagingRuntime
	implements ScribeMessaging<AnyScribeData>
{
	readonly definition: AnyScribeData;
	private readonly owner: ScribeJobOwner;

	constructor(
		definition: AnyScribeData,
		private readonly native: object,
		private readonly jobs: ScribeJobRuntime,
	) {
		this.definition = definition;
		this.owner = jobs.owner("messaging", definition.id);
	}

	send<Payload extends ScribeSerializable>(
		userId: number,
		message: Payload,
	): ScribeJobHandle<boolean> {
		assert(
			userId >= 1 && userId % 1 === 0,
			"[rovy/scribe] messaging.send userId must be a positive integer",
		);
		assertScribeSerializable(message, "messaging.send message");
		const immutableMessage = freezeScribeValue(
			cloneScribeValue(message),
		) as Payload;
		return this.jobs.enqueue(
			this.owner,
			"sendMessage",
			() => {
				const method = (this.native as UnknownTable).SendMessage;
				assert(
					typeIs(method, "function"),
					"[rovy/scribe] native server API does not expose SendMessage",
				);
				const committed = (method as (
					userId: number,
					message: Payload,
				) => boolean)(userId, immutableMessage);
				return committed === true
					? successfulJob(true)
					: failedJob("message-not-committed");
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
}
