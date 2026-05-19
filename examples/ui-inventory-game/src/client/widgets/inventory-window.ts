import {
  button,
  heading,
  label,
  selectableLabel,
  separator,
  useKey,
  useState,
  window,
} from "@rovy/ui";
import type { InventoryItem } from "shared/inventory";

function actionLabel(item: InventoryItem): string {
  if (item.kind === "consumable") return "Use";
  if (item.kind === "quest") return "Inspect";
  return "Equip";
}

function itemLine(item: InventoryItem, equippedId: string): string {
  const suffix = item.id === equippedId ? " [equipped]" : "";
  return `${item.name} x${item.quantity}${suffix}`;
}

/** @widget */
export function InventoryWindow(items: ReadonlyArray<InventoryItem>): void {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [equippedId, setEquippedId] = useState(items[0]?.id ?? "");
  const [status, setStatus] = useState("Select an item to inspect it.");
  const selected = items[selectedIndex] ?? items[0];

  window(
    {
      title: "Inventory",
      size: new Vector2(340, 320),
      position: new Vector2(380, 60),
    },
    () => {
      heading("Starter Pack");
      label("Custom widget authored in example game code.");

      for (let index = 0; index < items.size(); index++) {
        const item = items[index];
        if (item === undefined) continue;

        useKey(item.id);
        const handle = selectableLabel(itemLine(item, equippedId), { selected: index === selectedIndex });
        if (handle.clicked()) {
          setSelectedIndex(index);
          setStatus(`Selected ${item.name}.`);
        }
      }

      separator();

      if (selected === undefined) {
        label("Inventory is empty.");
        return;
      }

      label(`Type: ${selected.kind}`);
      label(selected.description);

      const action = button(actionLabel(selected));
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

      label(status);
    },
  );
}
