import { createContext, provideContext, useContext, useKey, __scope } from "./runtime";
import { c, v2 } from "./primitives";

export interface Style {
	textColor: Color3;
	textDisabledColor: Color3;
	textSize: number;
	windowBgColor: Color3;
	windowBgTransparency: number;
	popupBgColor: Color3;
	titleBgColor: Color3;
	titleBgActiveColor: Color3;
	frameBgColor: Color3;
	frameBgTransparency: number;
	frameBgHoveredColor: Color3;
	frameBgHoveredTransparency: number;
	buttonColor: Color3;
	buttonTransparency: number;
	buttonHoveredColor: Color3;
	buttonHoveredTransparency: number;
	buttonActiveColor: Color3;
	buttonActiveTransparency: number;
	sliderGrabColor: Color3;
	checkMarkColor: Color3;
	separatorColor: Color3;
	separatorTransparency: number;
	borderColor: Color3;
	borderTransparency: number;
	scrollbarGrabColor: Color3;
	headerColor: Color3;
	headerTransparency: number;
	selectableColor: Color3;
	selectableTransparency: number;
	toggleOnColor: Color3;
	toggleOffColor: Color3;
	toggleHandleColor: Color3;
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
}

export type StylePatch = Partial<Style>;
export interface StyleScopeOptions {
	readonly patch: StylePatch;
	readonly discriminator?: string | number;
}

export const defaultStyle: Style = {
	textColor: c(255, 255, 255),
	textDisabledColor: c(128, 128, 128),
	textSize: 13,
	windowBgColor: c(15, 15, 15),
	windowBgTransparency: 0.06,
	popupBgColor: c(20, 20, 20),
	titleBgColor: c(10, 10, 10),
	titleBgActiveColor: c(41, 74, 122),
	frameBgColor: c(41, 74, 122),
	frameBgTransparency: 0.46,
	frameBgHoveredColor: c(66, 150, 250),
	frameBgHoveredTransparency: 0.46,
	buttonColor: c(66, 150, 250),
	buttonTransparency: 0.6,
	buttonHoveredColor: c(66, 150, 250),
	buttonHoveredTransparency: 0,
	buttonActiveColor: c(15, 135, 250),
	buttonActiveTransparency: 0,
	sliderGrabColor: c(66, 150, 250),
	checkMarkColor: c(66, 150, 250),
	separatorColor: c(110, 110, 128),
	separatorTransparency: 0.5,
	borderColor: c(110, 110, 125),
	borderTransparency: 0.5,
	scrollbarGrabColor: c(79, 79, 79),
	headerColor: c(66, 150, 250),
	headerTransparency: 0.69,
	selectableColor: c(66, 150, 250),
	selectableTransparency: 0.69,
	toggleOnColor: c(66, 150, 250),
	toggleOffColor: c(79, 79, 79),
	toggleHandleColor: c(255, 255, 255),
	modalOverlayColor: c(0, 0, 0),
	modalOverlayTransparency: 0.5,
	tableHeaderColor: c(41, 74, 122),
	tableHeaderTransparency: 0.15,
	tableStripeRowColor: c(255, 255, 255),
	tableStripeRowTransparency: 0.94,
	tableStripeColumnColor: c(255, 255, 255),
	tableStripeColumnTransparency: 0.97,
	tableBorderColor: c(110, 110, 125),
	tableBorderTransparency: 0.5,
	tableRowHeight: 30,
	tableCellPadding: v2(6, 4),
	framePadding: v2(4, 3),
	itemSpacing: v2(8, 4),
	windowPadding: v2(8, 8),
	itemHeight: 22,
	titleBarHeight: 24,
	scrollbarSize: 7,
};

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
