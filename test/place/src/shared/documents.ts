import { document, sharedDocument } from "@rovy/datastore";

export interface ProfileData {
	coins: number;
	level: number;
}

export interface ProfileOwner {
	readonly slot: string;
}

/**
 * Keyed rather than player-scoped: run-in-roblox drives the place with no
 * connected Player, so the owner is a plain object the test controls.
 */
export const Profile = document<ProfileData, ProfileOwner>()({
	name: "IntegrationProfile",
	store: "RovyIntegrationProfile",
	key: (owner) => owner.slot,
	default: () => ({ coins: 0, level: 1 }),
	lifecycle: { autoOpen: false, autoClose: false },
});

export const OWNER: ProfileOwner = { slot: "integration" };

export interface WorldConfigData {
	season: string;
}

/** Shared documents take a plain string key, not a function. */
export const WorldConfig = sharedDocument<WorldConfigData>()({
	name: "IntegrationWorldConfig",
	store: "RovyIntegrationWorldConfig",
	key: "live",
	default: () => ({ season: "alpha" }),
	session: { lock: false },
	lifecycle: { autoOpen: false, autoClose: false },
});
