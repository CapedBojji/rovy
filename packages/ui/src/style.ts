import { createContext, provideContext, useContext, useKey, __scope } from "./runtime";
import { c, v2 } from "./primitives";

export interface Style {
	textColor: Color3;
	textDisabledColor: Color3;
	weakTextColor: Color3;
	strongTextColor: Color3;
	textSize: number;

	windowBgColor: Color3;
	windowBgTransparency: number;
	panelBgColor: Color3;
	popupBgColor: Color3;
	faintBgColor: Color3;
	extremeBgColor: Color3;
	titleBgColor: Color3;
	titleBgActiveColor: Color3;

	frameBgColor: Color3;
	frameBgTransparency: number;
	frameBgHoveredColor: Color3;
	frameBgHoveredTransparency: number;

	widgetInactiveBgColor: Color3;
	widgetHoveredBgColor: Color3;
	widgetActiveBgColor: Color3;

	buttonColor: Color3;
	buttonTransparency: number;
	buttonHoveredColor: Color3;
	buttonHoveredTransparency: number;
	buttonActiveColor: Color3;
	buttonActiveTransparency: number;

	accentColor: Color3;
	selectionBgColor: Color3;

	sliderGrabColor: Color3;
	checkMarkColor: Color3;
	scrollbarGrabColor: Color3;
	headerColor: Color3;
	headerTransparency: number;
	selectableColor: Color3;
	selectableTransparency: number;
	toggleOnColor: Color3;
	toggleOffColor: Color3;
	toggleHandleColor: Color3;

	separatorColor: Color3;
	separatorTransparency: number;
	borderColor: Color3;
	borderTransparency: number;

	strokeThickness: number;
	strokeInactiveColor: Color3;
	strokeInactiveTransparency: number;
	strokeHoveredColor: Color3;
	strokeHoveredTransparency: number;
	strokeActiveColor: Color3;
	strokeActiveTransparency: number;

	modalOverlayColor: Color3;
	modalOverlayTransparency: number;

	tableHeaderColor: Color3;
	tableHeaderTransparency: number;
	tableStripeRowColor: Color3;
	tableStripeRowTransparency: number;
	tableStripeColumnColor: Color3;
	tableStripeColumnTransparency: number;
	tableBorderColor: Color3;
	tableBorderTransparency: number;
	tableRowHeight: number;
	tableCellPadding: Vector2;

	framePadding: Vector2;
	itemSpacing: Vector2;
	windowPadding: Vector2;
	itemHeight: number;
	titleBarHeight: number;
	scrollbarSize: number;

	cornerRadius: number;
	windowCornerRadius: number;
	menuCornerRadius: number;

	shadowEnabled: boolean;
	shadowColor: Color3;
	shadowBlurRadius: number;
	shadowOffset: Vector2;
	shadowTransparency: number;
}

export type StylePatch = Partial<Style>;
export interface StyleScopeOptions {
	readonly patch: StylePatch;
	readonly discriminator?: string | number;
}

// egui default dark theme — values mirror crates/egui/src/style.rs `Visuals::dark`
export const darkStyle: Style = {
	textColor: c(180, 180, 180),
	textDisabledColor: c(100, 100, 100),
	weakTextColor: c(140, 140, 140),
	strongTextColor: c(255, 255, 255),
	textSize: 14,

	windowBgColor: c(27, 27, 27),
	windowBgTransparency: 0,
	panelBgColor: c(27, 27, 27),
	popupBgColor: c(27, 27, 27),
	faintBgColor: c(35, 35, 35),
	extremeBgColor: c(10, 10, 10),
	titleBgColor: c(22, 22, 22),
	titleBgActiveColor: c(0, 92, 128),

	frameBgColor: c(60, 60, 60),
	frameBgTransparency: 0,
	frameBgHoveredColor: c(70, 70, 70),
	frameBgHoveredTransparency: 0,

	widgetInactiveBgColor: c(60, 60, 60),
	widgetHoveredBgColor: c(70, 70, 70),
	widgetActiveBgColor: c(55, 55, 55),

	buttonColor: c(60, 60, 60),
	buttonTransparency: 0,
	buttonHoveredColor: c(70, 70, 70),
	buttonHoveredTransparency: 0,
	buttonActiveColor: c(55, 55, 55),
	buttonActiveTransparency: 0,

	accentColor: c(90, 170, 255),
	selectionBgColor: c(0, 92, 128),

	sliderGrabColor: c(255, 255, 255),
	checkMarkColor: c(90, 170, 255),
	scrollbarGrabColor: c(96, 96, 96),
	headerColor: c(0, 92, 128),
	headerTransparency: 0,
	selectableColor: c(0, 92, 128),
	selectableTransparency: 0,
	toggleOnColor: c(90, 170, 255),
	toggleOffColor: c(60, 60, 60),
	toggleHandleColor: c(255, 255, 255),

	separatorColor: c(60, 60, 60),
	separatorTransparency: 0,
	borderColor: c(60, 60, 60),
	borderTransparency: 0,

	strokeThickness: 1,
	strokeInactiveColor: c(60, 60, 60),
	strokeInactiveTransparency: 1,
	strokeHoveredColor: c(150, 150, 150),
	strokeHoveredTransparency: 0,
	strokeActiveColor: c(255, 255, 255),
	strokeActiveTransparency: 0,

	modalOverlayColor: c(0, 0, 0),
	modalOverlayTransparency: 0.5,

	tableHeaderColor: c(60, 60, 60),
	tableHeaderTransparency: 0,
	tableStripeRowColor: c(255, 255, 255),
	tableStripeRowTransparency: 0.97,
	tableStripeColumnColor: c(255, 255, 255),
	tableStripeColumnTransparency: 0.98,
	tableBorderColor: c(60, 60, 60),
	tableBorderTransparency: 0,
	tableRowHeight: 10,
	tableCellPadding: v2(6, 3),

	framePadding: v2(4, 1),
	itemSpacing: v2(8, 3),
	windowPadding: v2(6, 6),
	itemHeight: 18,
	titleBarHeight: 22,
	scrollbarSize: 6,

	cornerRadius: 2,
	windowCornerRadius: 6,
	menuCornerRadius: 6,

	shadowEnabled: true,
	shadowColor: c(0, 0, 0),
	shadowBlurRadius: 15,
	shadowOffset: v2(10, 20),
	shadowTransparency: 1 - 96 / 255,
};

// egui default light theme — values mirror crates/egui/src/style.rs `Visuals::light`
export const lightStyle: Style = {
	textColor: c(60, 60, 60),
	textDisabledColor: c(160, 160, 160),
	weakTextColor: c(80, 80, 80),
	strongTextColor: c(0, 0, 0),
	textSize: 14,

	windowBgColor: c(248, 248, 248),
	windowBgTransparency: 0,
	panelBgColor: c(248, 248, 248),
	popupBgColor: c(248, 248, 248),
	faintBgColor: c(242, 242, 242),
	extremeBgColor: c(255, 255, 255),
	titleBgColor: c(230, 230, 230),
	titleBgActiveColor: c(144, 209, 255),

	frameBgColor: c(230, 230, 230),
	frameBgTransparency: 0,
	frameBgHoveredColor: c(220, 220, 220),
	frameBgHoveredTransparency: 0,

	widgetInactiveBgColor: c(230, 230, 230),
	widgetHoveredBgColor: c(220, 220, 220),
	widgetActiveBgColor: c(165, 165, 165),

	buttonColor: c(230, 230, 230),
	buttonTransparency: 0,
	buttonHoveredColor: c(220, 220, 220),
	buttonHoveredTransparency: 0,
	buttonActiveColor: c(165, 165, 165),
	buttonActiveTransparency: 0,

	accentColor: c(0, 155, 255),
	selectionBgColor: c(144, 209, 255),

	sliderGrabColor: c(0, 0, 0),
	checkMarkColor: c(0, 155, 255),
	scrollbarGrabColor: c(170, 170, 170),
	headerColor: c(144, 209, 255),
	headerTransparency: 0,
	selectableColor: c(144, 209, 255),
	selectableTransparency: 0,
	toggleOnColor: c(0, 155, 255),
	toggleOffColor: c(200, 200, 200),
	toggleHandleColor: c(255, 255, 255),

	separatorColor: c(190, 190, 190),
	separatorTransparency: 0,
	borderColor: c(190, 190, 190),
	borderTransparency: 0,

	strokeThickness: 1,
	strokeInactiveColor: c(190, 190, 190),
	strokeInactiveTransparency: 1,
	strokeHoveredColor: c(105, 105, 105),
	strokeHoveredTransparency: 0,
	strokeActiveColor: c(0, 0, 0),
	strokeActiveTransparency: 0,

	modalOverlayColor: c(0, 0, 0),
	modalOverlayTransparency: 0.5,

	tableHeaderColor: c(230, 230, 230),
	tableHeaderTransparency: 0,
	tableStripeRowColor: c(0, 0, 0),
	tableStripeRowTransparency: 0.97,
	tableStripeColumnColor: c(0, 0, 0),
	tableStripeColumnTransparency: 0.98,
	tableBorderColor: c(190, 190, 190),
	tableBorderTransparency: 0,
	tableRowHeight: 10,
	tableCellPadding: v2(6, 3),

	framePadding: v2(4, 1),
	itemSpacing: v2(8, 3),
	windowPadding: v2(6, 6),
	itemHeight: 18,
	titleBarHeight: 22,
	scrollbarSize: 6,

	cornerRadius: 2,
	windowCornerRadius: 6,
	menuCornerRadius: 6,

	shadowEnabled: true,
	shadowColor: c(0, 0, 0),
	shadowBlurRadius: 15,
	shadowOffset: v2(10, 20),
	shadowTransparency: 1 - 25 / 255,
};

export const defaultStyle: Style = darkStyle;

const STYLE_CONTEXT = createContext<Style>("Style");

export function useStyle(): Style {
	return useContext(STYLE_CONTEXT) ?? defaultStyle;
}

export const getActiveStyle = useStyle;

export function setStyle(styleFragment: StylePatch): void {
	const merged = { ...useStyle(), ...styleFragment };
	provideContext(STYLE_CONTEXT, merged);
}

export function __withStyleScope<T>(key: string, options: StyleScopeOptions, fn: () => T): T {
	return __scope(key, () => {
		if (options.discriminator !== undefined) useKey(options.discriminator);
		setStyle(options.patch);
		return fn();
	});
}

export function withStyleScope<T>(options: StyleScopeOptions, fn: () => T): T {
	return __withStyleScope("manual-style-scope", options, fn);
}

export function StyleScope<T>(options: StyleScopeOptions, fn: () => T): T {
	return withStyleScope(options, fn);
}
