import { widget, __useInstance, __useState, useContext } from "../runtime";
import { useStyle } from "../style";
import { create } from "../create";
import { udim, udim2, v2 } from "../primitives";
import * as contexts from "../contexts";

export interface CheckboxOptions {
	checked?: boolean;
	disabled?: boolean;
}
export interface CheckboxHandle {
	checked(): boolean;
	clicked(): boolean;
}

interface TableCellState {
	centered?: boolean;
}

function tryGetService(name: string): unknown {
	const [ok, svc] = pcall(() => game.GetService(name as keyof Services));
	return ok ? svc : undefined;
}

/** @widget */
export const checkbox = widget((text: string, options: CheckboxOptions = {}): CheckboxHandle => {
	const [checked, setChecked] = __useState("checkbox:checked", false);
	const [clicked, setClicked] = __useState("checkbox:clicked", false);
	const [hovered, setHovered] = __useState("checkbox:hovered", false);

	const refs = __useInstance("checkbox:instance", (ref) => {
		const style = useStyle();
		const boxSize = style.itemHeight - 4;
		return create("Frame", {
			[ref as never]: "row",
			BackgroundTransparency: 1,
			Size: udim2(1, 0, 0, style.itemHeight),
			0: create("TextButton", {
				[ref as never]: "box",
				BackgroundColor3: style.frameBgColor,
				BackgroundTransparency: style.frameBgTransparency,
				BorderSizePixel: 0,
				Font: Enum.Font.GothamBold,
				TextColor3: style.checkMarkColor,
				TextSize: style.textSize + 2,
				Size: udim2(0, boxSize, 0, boxSize),
				AnchorPoint: v2(0, 0.5),
				Position: udim2(0, 0, 0.5, 0),
				Text: "",
				AutoButtonColor: false,
				0: create("UICorner", { CornerRadius: udim(0, 0) }),
				1: create("UIStroke", {
					[ref as never]: "boxStroke",
					Color: style.borderColor,
					Transparency: style.borderTransparency,
					Thickness: 1,
				}),
				MouseEnter: () => {
					setHovered(true);
				},
				MouseLeave: () => {
					setHovered(false);
				},
				Activated: () => {
					if (options.disabled !== true) {
						setClicked(true);
						setChecked((c) => !c);
					}
				},
			}),
			1: create("TextLabel", {
				[ref as never]: "label",
				BackgroundTransparency: 1,
				Font: Enum.Font.Code,
				TextColor3: style.textColor,
				TextSize: style.textSize,
				TextXAlignment: Enum.TextXAlignment.Left,
				TextYAlignment: Enum.TextYAlignment.Center,
				Size: udim2(1, -(boxSize + 6), 1, 0),
				Position: udim2(0, boxSize + 6, 0, 0),
			}),
		});
	}) as { row: Frame; box: TextButton; boxStroke: UIStroke; label: TextLabel };

	const style = useStyle();
	const isChecked = options.checked !== undefined ? options.checked : checked;
	const tableCellState = useContext(contexts.tableCellState) as TableCellState | undefined;

	const box = refs.box;
	box.Text = isChecked ? "✓" : "";

	if (options.disabled === true) {
		box.BackgroundColor3 = style.frameBgColor;
		box.BackgroundTransparency = 0.7;
		box.TextColor3 = style.textDisabledColor;
	} else if (hovered) {
		box.BackgroundColor3 = style.frameBgHoveredColor;
		box.BackgroundTransparency = style.frameBgHoveredTransparency;
	} else {
		box.BackgroundColor3 = style.frameBgColor;
		box.BackgroundTransparency = style.frameBgTransparency;
		box.TextColor3 = style.checkMarkColor;
	}

	refs.label.Text = text;
	refs.label.TextColor3 = options.disabled === true ? style.textDisabledColor : style.textColor;

	const boxSize = style.itemHeight - 4;
	const TextService = tryGetService("TextService") as TextService | undefined;
	if (tableCellState !== undefined && tableCellState.centered === true && TextService !== undefined) {
		const measured = TextService.GetTextSize(text, style.textSize, Enum.Font.Code, v2(1000, style.itemHeight));
		const rowWidth = boxSize + 6 + measured.X;
		refs.row.Size = udim2(0, rowWidth, 0, style.itemHeight);
		refs.label.Size = udim2(0, measured.X, 1, 0);
	} else {
		refs.row.Size = udim2(1, 0, 0, style.itemHeight);
		refs.label.Size = udim2(1, -(boxSize + 6), 1, 0);
	}

	return {
		checked() {
			return options.checked !== undefined ? options.checked : checked;
		},
		clicked() {
			if (clicked) {
				setClicked(false);
				return true;
			}
			return false;
		},
	};
}, "@rovy/ui/checkbox");
