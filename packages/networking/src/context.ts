/**
 * Tracks which Roblox `Player` originated a received client→server event so
 * server systems can authorize by sender. Only client→server received events
 * have a sender.
 */
export class NetEventContext {
	private readonly senders = new Map<object, Player>();

	senderOf(event: object): Player | undefined {
		return this.senders.get(event);
	}

	setCurrentSender(event: object, player: Player): void {
		this.senders.set(event, player);
	}

	clear(): void {
		this.senders.clear();
	}
}
