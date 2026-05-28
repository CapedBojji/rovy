import type { World } from "@rovy/core";
import {
	__scope,
	button,
	checkbox,
	childWindow,
	collapsingHeader,
	comboBox,
	heading,
	input,
	label,
	row,
	selectableLabel,
	separator,
	space,
	uiTable,
	tableRow,
	tableCell,
	useKey,
	window,
	type WindowHandle,
} from "@rovy/ui";
import { matchesWorldInspectorQuery } from "../runtime/query";
import { WorldInspectorRecorderState } from "../runtime/recorder";
import {
	targetChoices,
	targetForKey,
	targetForState,
	type WorldInspectorComponentDto,
	type WorldInspectorFieldDto,
	type WorldInspectorRegisteredComponentDto,
	type WorldInspectorTarget,
} from "../runtime/target";
import { WorldInspectorState } from "../state";
import { recorderPanel } from "./recorder-panel";

export interface WorldInspectorOptions {
	readonly world: World;
	readonly state: WorldInspectorState;
	readonly recorder?: WorldInspectorRecorderState;
}

function draftKey(targetKey: string, entity: number | undefined, componentId: string, fieldKey: string): string {
	return `${targetKey}:${entity ?? "new"}:${componentId}:${fieldKey}`;
}

function componentErrorKey(targetKey: string, entity: number, componentId: string): string {
	return `component:${targetKey}:${tostring(entity)}:${componentId}`;
}

function addComponentErrorKey(targetKey: string, entity: number, componentId: string): string {
	return `add:${targetKey}:${tostring(entity)}:${componentId}`;
}

function valueToText(value: unknown): string {
	if (value === undefined) return "";
	if (typeIs(value, "string")) return value;
	if (typeIs(value, "number") || typeIs(value, "boolean")) return tostring(value);
	return tostring(value);
}

function renderFields(
	state: WorldInspectorState,
	targetKey: string,
	entity: number | undefined,
	componentId: string,
	fields: ReadonlyArray<WorldInspectorFieldDto | Omit<WorldInspectorFieldDto, "valueText">>,
	live = false,
): WorldInspectorFieldDto[] {
	const values = new Array<WorldInspectorFieldDto>();
	uiTable({ columns: [{ width: 90 }, { fill: true }] }, () => {
		for (const field of fields) {
			const key = draftKey(targetKey, entity, componentId, field.key);
			const upstream = "valueText" in field ? field.valueText : "";
			let displayValue = upstream;
			if (live || !state.drafts.has(key)) {
				state.drafts.set(key, upstream);
			}
			if (!live) displayValue = state.drafts.get(key) as string;
			tableRow(() => {
				tableCell(() => {
					label(field.key);
				});
				tableCell(() => {
					if (live) {
						label(upstream);
					} else {
						const fieldInput = __scope("world-inspector:field", () => {
							useKey(key);
							return input({
								text: displayValue,
								placeholder: field.typeLabel,
							});
						});
						if (fieldInput.changed() || fieldInput.submitted()) {
							state.drafts.set(key, fieldInput.value());
							displayValue = fieldInput.value();
						}
					}
				});
			});
			values.push({ key: field.key, typeLabel: field.typeLabel, valueText: live ? upstream : displayValue });
		}
	});
	return values;
}

function selectedComponent(
	components: ReadonlyArray<WorldInspectorRegisteredComponentDto>,
	selected: string,
): WorldInspectorRegisteredComponentDto | undefined {
	if (selected.size() === 0) return components[0];
	for (const component of components) {
		if (component.componentName === selected || component.componentId === selected) return component;
	}
	return undefined;
}

function renderTargetPicker(state: WorldInspectorState): void {
	const choices = targetChoices(state);
	const labels = choices.map((choice) => choice.label);
	const current = choices.find((choice) => choice.key === state.selectedTargetKey) ?? choices[0];
	const picker = comboBox({ items: labels, selected: current.label });
	if (picker.changed()) {
		for (const choice of choices) {
				if (choice.label === picker.value()) {
					state.selectedTargetKey = choice.key;
					state.componentPicker = "";
					state.lastSnapshotAt = 0;
					if (choice.key !== "local") state.queueSnapshot(choice.key);
					break;
			}
		}
	}
}

function renderEntityList(target: WorldInspectorTarget, state: WorldInspectorState): void {
	const filterInput = input({
		text: state.query,
		placeholder: "filter: component name, ! to exclude, number = entity id",
	});
	if (filterInput.changed() || filterInput.submitted()) state.query = filterInput.value();
	label("e.g. Health !Dead, or 42");

	row(() => {
		if (button("Create entity").clicked()) {
			const result = target.apply({ kind: "spawn" });
			if (!result.ok) state.error = result.error;
			else if (result.entityId !== undefined) state.openEntityWindow(target.key, result.entityId);
		}
	});

	separator();

	const entities = target.listEntities();
	childWindow({ title: `Entities (${entities.size()})`, height: 280, scrollY: true, minimizable: false }, () => {
		let shown = 0;
		for (const entity of entities) {
			if (!matchesWorldInspectorQuery(entity.components, state.query, entity.entityId)) continue;
			shown += 1;
			const open = state.openEntityWindows.has(state.entityWindowKey(target.key, entity.entityId));
			const item = selectableLabel(`Entity ${tostring(entity.entityId)}  (${tostring(entity.components.size())})`, {
				selected: open,
			});
			if (item.clicked()) {
				if (open) state.closeEntityWindow(target.key, entity.entityId);
				else state.openEntityWindow(target.key, entity.entityId);
			}
		}
		if (shown === 0) label("No entities match.");
	});
}

function renderAddComponent(target: WorldInspectorTarget, state: WorldInspectorState, entity: number): void {
	const registered = target.listRegisteredComponents();
	const labels = registered.map((component) => component.componentName);
	if (labels.size() === 0) {
		label("No registered components");
		return;
	}

	const picker = comboBox({ items: labels, selected: state.componentPicker.size() > 0 ? state.componentPicker : labels[0] });
	if (picker.changed()) state.componentPicker = picker.value();
	const component = selectedComponent(registered, state.componentPicker.size() > 0 ? state.componentPicker : labels[0]);
	if (component === undefined) return;
	const errorKey = addComponentErrorKey(target.key, entity, component.componentId);

	if (component.fields.size() === 0) {
		if (button("Add tag").clicked()) {
			const result = target.apply({ kind: "insert", entityId: entity, componentId: component.componentId, fields: [] });
			state.setActionError(errorKey, result.error);
		}
		const scopedError = state.actionErrors.get(errorKey);
		if (scopedError !== undefined) label(scopedError);
		return;
	}

	const fields = renderFields(state, target.key, undefined, component.componentId, component.fields);
	if (button("Add component").clicked()) {
		const result = target.apply({ kind: "insert", entityId: entity, componentId: component.componentId, fields });
		state.setActionError(errorKey, result.error);
	}
	const scopedError = state.actionErrors.get(errorKey);
	if (scopedError !== undefined) label(scopedError);
}

function renderComponent(target: WorldInspectorTarget, state: WorldInspectorState, entity: number, component: WorldInspectorComponentDto, live: boolean): void {
	const title = component.tag ? `${component.componentName}  [tag]` : component.componentName;
	collapsingHeader(title, () => {
		const errorKey = componentErrorKey(target.key, entity, component.componentId);
		label(component.componentId);
		if (component.tag) {
			if (button("Remove tag").clicked()) {
				const result = target.apply({ kind: "remove", entityId: entity, componentId: component.componentId });
				state.setActionError(errorKey, result.error);
			}
			const scopedError = state.actionErrors.get(errorKey);
			if (scopedError !== undefined) label(scopedError);
			return;
		}

		if (component.fields.size() > 0) {
			const fields = renderFields(state, target.key, entity, component.componentId, component.fields, live);
			if (live) {
				if (button("Remove").clicked()) {
					const result = target.apply({ kind: "remove", entityId: entity, componentId: component.componentId });
					state.setActionError(errorKey, result.error);
				}
			} else {
				row(() => {
					if (button("Commit").clicked()) {
						const result = target.apply({ kind: "set", entityId: entity, componentId: component.componentId, fields });
						state.setActionError(errorKey, result.error);
					}
					if (button("Remove").clicked()) {
						const result = target.apply({ kind: "remove", entityId: entity, componentId: component.componentId });
						state.setActionError(errorKey, result.error);
					}
				});
			}
			const scopedError = state.actionErrors.get(errorKey);
			if (scopedError !== undefined) label(scopedError);
		} else {
			label(valueToText(component.componentId));
			if (button("Remove").clicked()) {
				const result = target.apply({ kind: "remove", entityId: entity, componentId: component.componentId });
				state.setActionError(errorKey, result.error);
			}
			const scopedError = state.actionErrors.get(errorKey);
			if (scopedError !== undefined) label(scopedError);
		}
	});
}

function renderEntityDetail(target: WorldInspectorTarget, state: WorldInspectorState, entity: number): void {
	const entities = target.listEntities();
	if (entities.find((item) => item.entityId === entity) === undefined) {
		state.closeEntityWindow(target.key, entity);
		return;
	}

	row(() => {
		label(`Entity ${tostring(entity)}`);
		if (button("Despawn").clicked()) {
			const result = target.apply({ kind: "despawn", entityId: entity });
			state.error = result.error;
			state.closeEntityWindow(target.key, entity);
			return;
		}
	});

	const windowKey = state.entityWindowKey(target.key, entity);
	const live = state.liveUpdate.get(windowKey) ?? true;
	const liveBox = checkbox("Live update", { checked: live });
	if (liveBox.clicked()) {
		const nextLive = !live;
		state.liveUpdate.set(windowKey, nextLive);
		if (nextLive) {
			for (const component of target.listComponents(entity)) {
				for (const field of component.fields) {
					state.drafts.delete(draftKey(target.key, entity, component.componentId, field.key));
				}
			}
		}
	}
	const liveNow = state.liveUpdate.get(windowKey) ?? true;

	separator();
	collapsingHeader("Add Component", () => {
		renderAddComponent(target, state, entity);
	});
	separator();
	heading("Components");
	for (const component of target.listComponents(entity)) {
		__scope("world-inspector:component", () => {
			useKey(`${tostring(entity)}:${component.componentId}`);
			renderComponent(target, state, entity, component, liveNow);
		});
	}
}

/** @widget */
export function worldInspector(options: WorldInspectorOptions): void {
	const { world, state, recorder } = options;
	const target = targetForState(world, state);
	const handle: WindowHandle = window(
		{
			title: "Rovy World Inspector",
			closable: true,
			minimizable: true,
			resizable: true,
			scrollY: true,
			visible: state.visible,
			position: state.position,
			size: state.size ?? new Vector2(360, 480),
			onClose: () => state.closeWindow(),
		},
		() => {
			if (state.error !== undefined) label(state.error);
			renderTargetPicker(state);
			space(4);
			renderEntityList(target, state);
			if (recorder !== undefined) {
				separator();
				recorderPanel(recorder);
			}
		},
	);

	if (handle.closed()) state.closeWindow();

	const openWindows = new Array<{ windowKey: string; targetKey: string; entityId: number }>();
	for (const [windowKey, windowState] of state.openEntityWindows) {
		openWindows.push({ windowKey, targetKey: windowState.targetKey, entityId: windowState.entityId });
	}
	for (const openWindow of openWindows) {
		__scope("world-inspector:entity-window", () => {
			useKey(openWindow.windowKey);
			const entityTarget = targetForKey(world, state, openWindow.targetKey);
			const entityHandle = window(
				{
					title: `${entityTarget.label} Entity ${tostring(openWindow.entityId)}`,
					closable: true,
					minimizable: true,
					resizable: true,
					scrollY: true,
					size: new Vector2(320, 400),
					onClose: () => state.closeEntityWindow(openWindow.targetKey, openWindow.entityId),
				},
				() => {
					renderEntityDetail(entityTarget, state, openWindow.entityId);
				},
			);
			if (entityHandle.closed()) state.closeEntityWindow(openWindow.targetKey, openWindow.entityId);
		});
	}
}
