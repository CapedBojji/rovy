// Type shims for beta Roblox UI capabilities. Per-corner UICorner radii are
// not yet in @rbxts/types; the UIShadow class is already present so we only
// augment UICorner here.

declare global {
	interface UICorner {
		TopLeftRadius: UDim;
		TopRightRadius: UDim;
		BottomLeftRadius: UDim;
		BottomRightRadius: UDim;
	}
}

export {};
