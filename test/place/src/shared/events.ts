import { event } from "@rovy/core";

/**
 * `@rovy/scribe` declares its events as ordinary `@scribeEvent` classes, so a
 * UI trigger on one is a plain class constructor — the same `$eventTrigger`
 * branch this event exercises. (Datastore is the other branch: its document
 * events have no class, so the transformer resolves a generated constructor.)
 *
 * Scribe's own runtime is player-profile scoped and needs a joined Player plus
 * real client/server boundaries, which run-in-roblox's edit-mode session does
 * not provide; `packages/scribe/test/studio` covers that under a playtest.
 */
@event
export class ProfileFieldChanged {
	constructor(public readonly field: string) {}
}
