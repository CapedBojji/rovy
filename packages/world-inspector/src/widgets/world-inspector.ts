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
	type WorldInspectorResourceDto,
	type WorldInspectorResourceFieldDto,
	type WorldInspectorTarget,
} from "../runtime/target";
import { type WorldInspectorValueNodeDto } from "../runtime/value-tree";
import { WorldInspectorState, type WorldInspectorExplorerSource } from "../state";
import { tableExplorer } from "./table-explorer";
import { recorderDetail } from "./recorder-detail";

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

function resourceDraftKey(targetKey: string, resourceId: string, path: ReadonlyArray<string>): string {
	return `resource:${targetKey}:${resourceId}:${path.join(".")}`;
}

function resourceErrorKey(targetKey: string, resourceId: string, path: ReadonlyArray<string>): string {
	return `resource-error:${targetKey}:${resourceId}:${path.join(".")}`;
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
			if (live || !state.hasDraft(key)) {
				state.setDraft(key, upstream);
			}
			if (!live) displayValue = state.getDraft(key) as string;
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
							state.setDraft(key, fieldInput.value());
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

function renderMainTabs(state: WorldInspectorState): void {
	row(() => {
		const entities = selectableLabel("Entities", { selected: state.activeTab === "entities" });
		if (entities.clicked()) state.activeTab = "entities";
		const resources = selectableLabel("Resources", { selected: state.activeTab === "resources" });
		if (resources.clicked()) state.activeTab = "resources";
		const frames = selectableLabel("Frames", { selected: state.activeTab === "frames" });
		if (frames.clicked()) state.activeTab = "frames";
	});
}

function renderFramesTab(recorder: WorldInspectorRecorderState, state: WorldInspectorState): void {
	label("Records mutations on the LOCAL world only.");
	row(() => {
		const recording = recorder.phase === "recording";
		if (button(recording ? "Stop" : "Record").clicked()) {
			if (recording) recorder.queueStop();
			else recorder.queueStart();
		}
		if (button("Clear").clicked()) {
			recorder.clearBuffer();
			recorder.openDetailFrames.clear();
		}
		__scope("frames:max-frames", () => {
			useKey("max-frames");
			const cap = input({ text: recorder.maxFramesDraft, placeholder: "max frames" });
			if (cap.changed() || cap.submitted()) {
				recorder.maxFramesDraft = cap.value();
				if (cap.submitted()) recorder.applyMaxFramesDraft();
			}
		});
	});
	label(`phase: ${recorder.phase}   frames: ${tostring(recorder.count)} / ${tostring(recorder.config.maxFrames)}`);
	separator();

	if (recorder.count === 0) {
		label("No frames recorded.");
		return;
	}

	const pageSize = recorder.pageSize;
	const totalPages = math.max(1, math.ceil(recorder.count / pageSize));
	if (recorder.page >= totalPages) recorder.page = totalPages - 1;
	if (recorder.page < 0) recorder.page = 0;

	row(() => {
		// page 0 = newest frames
		if (button("Prev").clicked()) recorder.page = math.max(0, recorder.page - 1);
		if (button("Next").clicked()) recorder.page = math.min(totalPages - 1, recorder.page + 1);
		label(`page ${tostring(recorder.page + 1)} / ${tostring(totalPages)}  (Prev = newer, Next = older)`);
	});

	// newest first: uiIndex count-1 is the latest frame
	const newest = recorder.count - 1;
	const start = newest - recorder.page * pageSize;
	const endInclusive = math.max(0, start - pageSize + 1);
	childWindow({ title: "Frames", height: 280, scrollY: true, minimizable: false }, () => {
		uiTable({ columns: [{ width: 70 }, { width: 50 }, { width: 50 }, { width: 50 }, { width: 50 }, { width: 70 }] }, () => {
			tableRow(() => {
				tableCell(() => label("Frame"));
				tableCell(() => label("Ent"));
				tableCell(() => label("Comp"));
				tableCell(() => label("Res"));
				tableCell(() => label("Rel"));
				tableCell(() => label(""));
			});
			for (let i = start; i >= endInclusive; i--) {
				const uiIdx = i;
				const record = recorder.getFrameAt(uiIdx);
				if (record === undefined) continue;
				__scope("frames:row", () => {
					useKey(tostring(uiIdx));
					tableRow(() => {
						tableCell(() => label(tostring(record.relativeIndex)));
						tableCell(() => label(tostring(record.entityChanges)));
						tableCell(() => label(tostring(record.componentChanges)));
						tableCell(() => label(tostring(record.resourceChanges)));
						tableCell(() => label(tostring(record.relationChanges)));
						tableCell(() => {
							const open = recorder.openDetailFrames.has(uiIdx);
							if (button(open ? "Hide" : "Details").clicked()) {
								if (open) recorder.openDetailFrames.delete(uiIdx);
								else recorder.openDetailFrames.add(uiIdx);
							}
						});
					});
				});
			}
		});
	});
}

/** Resolve the root value-tree rows a table explorer should display, from its source descriptor. */
function explorerRootRows(
	source: WorldInspectorExplorerSource,
	target: WorldInspectorTarget,
	recorder: WorldInspectorRecorderState | undefined,
): ReadonlyArray<WorldInspectorValueNodeDto> {
	if (source.kind === "resource") {
		for (const resource of target.listResources()) {
			if (resource.resourceId === source.resourceId) return resource.valueTree;
		}
		return [];
	}
	if (recorder === undefined) return [];
	const record = recorder.getFrameAt(source.frameIndex);
	if (record === undefined) return [];
	const entry = record.entries[source.entryIndex];
	if (entry === undefined) return [];
	const tree = source.side === "old" ? entry.oldTree : entry.newTree;
	return tree?.children ?? [];
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

function resourceExplorerKey(resourceId: string): string {
	return `res:${resourceId}`;
}

function renderResourceField(
	target: WorldInspectorTarget,
	state: WorldInspectorState,
	resource: WorldInspectorResourceDto,
	field: WorldInspectorResourceFieldDto,
): void {
	const key = resourceDraftKey(target.key, resource.resourceId, field.path);
	const errorKey = resourceErrorKey(target.key, resource.resourceId, field.path);
	const upstream = field.valueText;
	if (state.getDraftRevision(key) !== resource.revision) {
		state.setDraft(key, upstream, resource.revision);
		state.setActionError(errorKey);
	}
	const displayValue = state.getDraft(key) as string;
	tableRow(() => {
		tableCell(() => {
			const indent = string.rep("  ", field.depth);
			label(`${indent}${field.key}`);
		});
		tableCell(() => {
			if (!field.editable) {
				label(upstream);
				return;
			}
			const fieldInput = __scope("world-inspector:resource-field", () => {
				useKey(key);
				return input({ text: displayValue, placeholder: field.typeLabel });
			});
			if (fieldInput.changed() || fieldInput.submitted()) state.setDraft(key, fieldInput.value(), resource.revision);
			row(() => {
				if (button("Commit").clicked()) {
					const result = target.apply({
						kind: "setResource",
						resourceId: resource.resourceId,
						path: field.path,
						field: {
							key: field.key,
							typeLabel: field.typeLabel,
							valueText: state.getDraft(key) as string,
						},
					});
					if (result.ok) {
						state.clearDraft(key);
						state.setActionError(errorKey);
					} else {
						state.setActionError(errorKey, result.error);
					}
				}
			});
			const scopedError = state.actionErrors.get(errorKey);
			if (scopedError !== undefined) label(scopedError);
		});
	});
}

function renderResource(resource: WorldInspectorResourceDto, target: WorldInspectorTarget, state: WorldInspectorState): void {
	collapsingHeader(resource.resourceName, () => {
		label(resource.resourceId);
		const key = resourceExplorerKey(resource.resourceId);
		const open = state.tableExplorers.has(key);
		row(() => {
			if (button(open ? "Close table" : "Open table").clicked()) {
				if (open) state.closeTableExplorer(key);
				else state.openTableExplorer(key, resource.resourceName, { kind: "resource", resourceId: resource.resourceId });
			}
		});
		uiTable({ columns: [{ width: 120 }, { fill: true }] }, () => {
			for (const field of resource.fields) {
				__scope("world-inspector:resource-row", () => {
					useKey(`${resource.resourceId}:${field.path.join(".")}`);
					renderResourceField(target, state, resource, field);
				});
			}
		});
		if (resource.fields.size() === 0) label("No inspectable fields.");
	});
}

function renderResourceList(target: WorldInspectorTarget, state: WorldInspectorState): void {
	const filterInput = input({ text: state.resourceQuery, placeholder: "filter by resource name" });
	if (filterInput.changed() || filterInput.submitted()) state.resourceQuery = filterInput.value();
	separator();

	const resources = target.listResources();
	const query = state.resourceQuery.lower();
	childWindow({ title: `Resources (${resources.size()})`, height: 320, scrollY: true, minimizable: false }, () => {
		let shown = 0;
		for (const resource of resources) {
			if (query.size() > 0 && resource.resourceName.lower().find(query, 1, true)[0] === undefined) continue;
			shown += 1;
			__scope("world-inspector:resource", () => {
				useKey(resource.resourceId);
				renderResource(resource, target, state);
			});
		}
		if (shown === 0) label("No resources match.");
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
					state.clearDraft(draftKey(target.key, entity, component.componentId, field.key));
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
			renderMainTabs(state);
			space(4);
			if (state.activeTab === "resources") renderResourceList(target, state);
			else if (state.activeTab === "frames") {
				if (recorder !== undefined) renderFramesTab(recorder, state);
				else label("Frame recorder unavailable.");
			} else renderEntityList(target, state);
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

	if (recorder !== undefined) {
		const detailIndices = new Array<number>();
		for (const idx of recorder.openDetailFrames) detailIndices.push(idx);
		for (const idx of detailIndices) {
			__scope("world-inspector:frame-detail", () => {
				useKey(tostring(idx));
				recorderDetail(state, recorder, idx);
			});
		}
	}

	const explorerKeys = new Array<string>();
	for (const [key] of state.tableExplorers) explorerKeys.push(key);
	for (const explorerKey of explorerKeys) {
		const explorer = state.tableExplorers.get(explorerKey);
		if (explorer === undefined) continue;
		__scope("world-inspector:table-explorer", () => {
			useKey(explorerKey);
			tableExplorer(state, explorerKey, explorerRootRows(explorer.source, target, recorder));
		});
	}
}
