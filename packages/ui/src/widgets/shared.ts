import { udim, udim2 } from "../primitives";
import type { Style } from "../style";
import { create } from "../create";

export function textProps(text: string, style: Style): Record<string, unknown> {
	return {
		Text: text,
		TextColor3: style.textColor,
		TextSize: style.textSize,
		BackgroundTransparency: 1,
		Size: udim2(1, 0, 0, style.itemHeight),
	};
}

export function frameProps(style: Style): Record<string, unknown> {
	return {
		BackgroundColor3: style.frameBgColor,
		BackgroundTransparency: style.frameBgTransparency,
		BorderSizePixel: 0,
		Size: udim2(1, 0, 0, style.itemHeight),
	};
}

export function basicHandle(
	flag: boolean,
	clear: (value: boolean) => void,
	name: string,
): Record<string, () => boolean> {
	const handle = {
		clicked() {
			if (flag) {
				clear(false);
				return true;
			}
			return false;
		},
	};
	return handle as Record<string, () => boolean>;
}

// ---------------------------------------------------------------------------
// Widget visual helpers
// ---------------------------------------------------------------------------

export type InteractState = "inactive" | "hovered" | "active" | "disabled";

export interface WidgetBg {
	color: Color3;
	transparency: number;
}

export function widgetBgFor(state: InteractState, style: Style): WidgetBg {
	if (state === "disabled") return { color: style.widgetInactiveBgColor, transparency: 0.5 };
	if (state === "active") return { color: style.widgetActiveBgColor, transparency: 0 };
	if (state === "hovered") return { color: style.widgetHoveredBgColor, transparency: 0 };
	return { color: style.widgetInactiveBgColor, transparency: 0 };
}

export function applyWidgetBg(frame: GuiObject, state: InteractState, style: Style): void {
	const bg = widgetBgFor(state, style);
	frame.BackgroundColor3 = bg.color;
	frame.BackgroundTransparency = bg.transparency;
}

export interface StrokeStyle {
	color: Color3;
	transparency: number;
	thickness: number;
}

export function strokeFor(state: InteractState, style: Style): StrokeStyle {
	if (state === "disabled")
		return {
			color: style.strokeInactiveColor,
			transparency: 0.5,
			thickness: style.strokeThickness,
		};
	if (state === "active")
		return {
			color: style.strokeActiveColor,
			transparency: style.strokeActiveTransparency,
			thickness: style.strokeThickness,
		};
	if (state === "hovered")
		return {
			color: style.strokeHoveredColor,
			transparency: style.strokeHoveredTransparency,
			thickness: style.strokeThickness,
		};
	return {
		color: style.strokeInactiveColor,
		transparency: style.strokeInactiveTransparency,
		thickness: style.strokeThickness,
	};
}

export function applyStrokeState(stroke: UIStroke, state: InteractState, style: Style): void {
	const s = strokeFor(state, style);
	stroke.Color = s.color;
	stroke.Transparency = s.transparency;
	stroke.Thickness = s.thickness;
}

export function makeCorner(radius: number): UICorner {
	return create("UICorner", { CornerRadius: udim(0, math.max(0, radius)) });
}

export interface PerCornerRadii {
	tl?: number;
	tr?: number;
	bl?: number;
	br?: number;
}

export function makeCornerPerSide(r: PerCornerRadii): UICorner {
	const max = math.max(r.tl ?? 0, r.tr ?? 0, r.bl ?? 0, r.br ?? 0);
	const corner = create("UICorner", { CornerRadius: udim(0, max) });
	const props = corner as unknown as Record<string, UDim>;
	props.TopLeftRadius = udim(0, r.tl ?? 0);
	props.TopRightRadius = udim(0, r.tr ?? 0);
	props.BottomLeftRadius = udim(0, r.bl ?? 0);
	props.BottomRightRadius = udim(0, r.br ?? 0);
	return corner;
}

export function makeStroke(style: Style, state: InteractState = "inactive"): UIStroke {
	const s = strokeFor(state, style);
	return create("UIStroke", {
		Color: s.color,
		Transparency: s.transparency,
		Thickness: s.thickness,
		ApplyStrokeMode: Enum.ApplyStrokeMode.Border,
	});
}

export function makeShadow(style: Style): UIShadow | undefined {
	if (!style.shadowEnabled) return undefined;
	const [ok, shadow] = pcall(() =>
		create("UIShadow", {
			Color: style.shadowColor,
			BlurRadius: udim(0, style.shadowBlurRadius),
			Offset: udim2(0, style.shadowOffset.X, 0, style.shadowOffset.Y),
			Transparency: style.shadowTransparency,
			Spread: udim2(0, 0, 0, 0),
			ZIndex: -1,
		}),
	);
	return ok ? shadow : undefined;
}
