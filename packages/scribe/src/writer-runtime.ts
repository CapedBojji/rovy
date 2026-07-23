import {
	createScribeWriteTree,
} from "./writer-tree";
import {
	ScribeWriteQueue,
} from "./write-queue";
import type {
	ScribeTransactionHandle,
} from "./types";

export function createScribeLocalWriterRuntime(
	dataId: string,
	template: object,
	queue: ScribeWriteQueue,
): object {
	return createScribeWriteTree(
		template,
		(write) => queue.enqueue(dataId, undefined, write),
		"client",
	);
}

export class ScribeServerWriterRuntime {
	private readonly byPlayer = new Map<object, object>();

	constructor(
		private readonly dataId: string,
		private readonly template: object,
		private readonly queue: ScribeWriteQueue,
		private readonly onPlayerAccess?: (player: Player) => void,
	) {}

	for(player: Player): object {
		this.onPlayerAccess?.(player);
		const key = player as object;
		let tree = this.byPlayer.get(key);
		if (tree === undefined) {
			tree = createScribeWriteTree(
				this.template,
				(write) => this.queue.enqueue(this.dataId, player, write),
				"server",
			);
			this.byPlayer.set(key, tree);
		}
		return tree;
	}

	transaction(
		player: Player,
		callback: (writes: object) => void,
	): ScribeTransactionHandle {
		this.onPlayerAccess?.(player);
		assert(
			typeIs(callback, "function"),
			"[rovy/scribe] writes.transaction requires a callback",
		);
		return this.queue.transaction(this.dataId, player, (sink) => {
			callback(createScribeWriteTree(this.template, sink, "server"));
		});
	}
}
