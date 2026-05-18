import { widget } from "../runtime";
import { window } from "./window";
import { heading } from "./heading";
import { label } from "./label";
import { button } from "./button";
import { checkbox } from "./checkbox";
import { progressBar } from "./progress-bar";

/** @widget */
export const demoWindow = widget((): void => {
	window("Rovy UI Demo", () => {
		heading("Rovy UI");
		label("TS-first immediate UI");
		button("Button");
		checkbox("Checkbox");
		progressBar({ value: 0.5, label: "Progress" });
	});
}, "@rovy/ui/demoWindow");
