import { udim2 } from "../primitives";
import type { Style } from "../style";

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
