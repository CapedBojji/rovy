import type { ComponentReg } from "@rovy/core";

export interface ComponentChoice {
	readonly label: string;
	readonly component: ComponentReg;
}

export function componentShortName(id: string): string {
	const parts = id.split("/");
	return parts[parts.size() - 1] ?? id;
}

function lastPathParts(id: string, count: number): string {
	const parts = id.split("/");
	const start = math.max(0, parts.size() - count);
	const out = new Array<string>();
	for (let i = start; i < parts.size(); i++) out.push(parts[i]);
	return out.join("/");
}

export function buildComponentChoices(components: ReadonlyArray<ComponentReg>): ComponentChoice[] {
	const shortCounts = new Map<string, number>();
	for (const component of components) {
		const short = componentShortName(component.id);
		shortCounts.set(short, (shortCounts.get(short) ?? 0) + 1);
	}

	const labelCounts = new Map<string, number>();
	const labels = new Map<ComponentReg, string>();
	for (const component of components) {
		const short = componentShortName(component.id);
		const label = (shortCounts.get(short) ?? 0) > 1 ? lastPathParts(component.id, 2) : short;
		labels.set(component, label);
		labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
	}

	const choices = new Array<ComponentChoice>();
	for (const component of components) {
		const label = labels.get(component) ?? component.id;
		choices.push({
			label: (labelCounts.get(label) ?? 0) > 1 ? component.id : label,
			component,
		});
	}
	return choices;
}

export function findComponentChoice(
	components: ReadonlyArray<ComponentReg>,
	labelOrId: string,
): ComponentReg | undefined {
	const choices = buildComponentChoices(components);
	for (const choice of choices) {
		if (choice.label === labelOrId || choice.component.id === labelOrId) return choice.component;
	}
	return undefined;
}
