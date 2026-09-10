import { document } from "@rovy/datastore";

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
	// The transformer checks this against AuthorDocumentDef<T, unknown>, which
	// drops the Owner type argument, so the cast is required today.
	key: (owner) => (owner as ProfileOwner).slot,
	default: () => ({ coins: 0, level: 1 }),
	lifecycle: { autoOpen: false, autoClose: false },
});

export const OWNER: ProfileOwner = { slot: "integration" };
