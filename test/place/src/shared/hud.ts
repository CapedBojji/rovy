import { frame, textLabel, ui, uiCorner, uiListLayout, uiPadding, type UiNode } from "@rovy/ui";

/**
 * Shared so the playtest client can show it and the headless runner can build
 * the same tree and assert what it produces.
 */
export const hudState = {
	frames: 0,
	inspectorOpen: false,
};

@ui
export class Hud {
	render(): UiNode {
		return frame(
			{
				Name: "HudPanel",
				BackgroundColor3: Color3.fromRGB(24, 28, 35),
				Position: UDim2.fromOffset(24, 24),
				Size: UDim2.fromOffset(280, 96),
			},
			[
				uiCorner({ CornerRadius: new UDim(0, 8) }),
				uiPadding({
					PaddingTop: new UDim(0, 10),
					PaddingLeft: new UDim(0, 12),
					PaddingRight: new UDim(0, 12),
				}),
				uiListLayout({ Padding: new UDim(0, 4) }),
				textLabel({
					Name: "Title",
					BackgroundTransparency: 1,
					Size: UDim2.fromOffset(256, 22),
					Font: Enum.Font.GothamBold,
					TextSize: 16,
					TextXAlignment: Enum.TextXAlignment.Left,
					TextColor3: Color3.fromRGB(245, 247, 250),
					Text: "Rovy UI",
				}),
				textLabel({
					Name: "Frames",
					BackgroundTransparency: 1,
					Size: UDim2.fromOffset(256, 18),
					TextSize: 14,
					TextXAlignment: Enum.TextXAlignment.Left,
					TextColor3: Color3.fromRGB(160, 200, 255),
					Text: `rendered frames: ${hudState.frames}`,
				}),
				textLabel({
					Name: "Hint",
					BackgroundTransparency: 1,
					Size: UDim2.fromOffset(256, 18),
					TextSize: 14,
					TextXAlignment: Enum.TextXAlignment.Left,
					TextColor3: Color3.fromRGB(150, 158, 170),
					Text: hudState.inspectorOpen ? "world inspector: open" : "world inspector: closed",
				}),
			],
		);
	}
}
