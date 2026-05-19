import {
	__scope,
	button,
	heading,
	label,
	selectableLabel,
	separator,
	useKey,
	useState,
	widget,
	window,
} from "@rovy/ui";
import type { InventoryItem } from "shared/inventory";

type WidgetCaller<TReturn> = (...args: ReadonlyArray<unknown>) => TReturn;
const windowWidget = window as unknown as WidgetCaller<ReturnType<typeof window>>;
const headingWidget = heading as unknown as WidgetCaller<void>;
const labelWidget = label as unknown as WidgetCaller<void>;
const selectableLabelWidget = selectableLabel as unknown as WidgetCaller<ReturnType<typeof selectableLabel>>;
const separatorWidget = separator as unknown as WidgetCaller<void>;
const buttonWidget = button as unknown as WidgetCaller<ReturnType<typeof button>>;

function actionLabel(item: InventoryItem): string {
	if (item.kind === "consumable") return "Use";
	if (item.kind === "quest") return "Inspect";
	return "Equip";
}

function itemLine(item: InventoryItem, equippedId: string): string {
	const suffix = item.id === equippedId ? " [equipped]" : "";
	return `${item.name} x${item.quantity}${suffix}`;
}

export const InventoryWindow = widget((items: ReadonlyArray<InventoryItem>): void => {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [equippedId, setEquippedId] = useState(items[0]?.id ?? "");
	const [status, setStatus] = useState("Select an item to inspect it.");
	const selected = items[selectedIndex] ?? items[0];

	__scope("example/ui-inventory/window", () => windowWidget(
		{
			title: "Inventory",
			size: new Vector2(340, 320),
			position: new Vector2(380, 60),
		}, () => {
			__scope("example/ui-inventory/heading", () => headingWidget("Starter Pack"));
			__scope("example/ui-inventory/intro", () => labelWidget("Custom widget authored in example game code."));

			for (let index = 0; index < items.size(); index++) {
				const item = items[index];
				if (item === undefined) continue;

				useKey(item.id);
				const handle = __scope("example/ui-inventory/item", () =>
					selectableLabelWidget(
						itemLine(item, equippedId),
						{ selected: index === selectedIndex },
					),
				);
				if (handle.clicked()) {
					setSelectedIndex(index);
					setStatus(`Selected ${item.name}.`);
				}
			}

			__scope("example/ui-inventory/separator", () => separatorWidget());

			if (selected === undefined) {
				__scope("example/ui-inventory/empty", () => labelWidget("Inventory is empty."));
				return;
			}

			__scope("example/ui-inventory/type", () => labelWidget(`Type: ${selected.kind}`));
			__scope("example/ui-inventory/description", () => labelWidget(selected.description));

			const action = __scope("example/ui-inventory/action", () => buttonWidget(actionLabel(selected)));
			if (action.clicked()) {
				if (selected.kind === "consumable") {
					setStatus(`Used ${selected.name}.`);
				} else if (selected.kind === "quest") {
					setStatus(`Inspected ${selected.name}.`);
				} else {
					setEquippedId(selected.id);
					setStatus(`Equipped ${selected.name}.`);
				}
			}

			__scope("example/ui-inventory/status", () => labelWidget(status));
		},
	));
}, "example/ui-inventory/InventoryWindow");
