import type { ComponentInspection, ComponentReg, Entity, ResourceInspection, ResourceReg, World } from "@rovy/core";
import { buildComponentChoices, componentShortName } from "./component-names";
import { resolveInstanceExpression } from "./instance-expression";
import type { WorldInspectorState } from "../state";

export type WorldInspectorTargetKind = "local" | "server" | "player";

export interface WorldInspectorTargetChoice {
	readonly key: string;
	readonly label: string;
	readonly kind: WorldInspectorTargetKind;
	readonly playerUserId?: number;
}

export interface WorldInspectorFieldDto {
	readonly key: string;
	readonly typeLabel: string;
	readonly valueText: string;
}

export interface WorldInspectorComponentDto {
	readonly componentId: string;
	readonly componentName: string;
	readonly tag: boolean;
	readonly fields: ReadonlyArray<WorldInspectorFieldDto>;
}

export interface WorldInspectorResourceFieldDto {
	readonly key: string;
	readonly path: ReadonlyArray<string>;
	readonly typeLabel: string;
	readonly valueText: string;
	readonly editable: boolean;
	readonly depth: number;
}

export interface WorldInspectorResourceDto {
	readonly resourceId: string;
	readonly resourceName: string;
	readonly fields: ReadonlyArray<WorldInspectorResourceFieldDto>;
	readonly revision: number;
	readonly changedPaths: ReadonlyArray<ReadonlyArray<string>>;
}

export interface WorldInspectorRegisteredComponentDto {
	readonly componentId: string;
	readonly componentName: string;
	readonly fields: ReadonlyArray<Omit<WorldInspectorFieldDto, "valueText">>;
	readonly tag: boolean;
}

export interface WorldInspectorEntityDto {
	readonly entityId: number;
	readonly components: ReadonlyArray<WorldInspectorComponentDto>;
}

export interface WorldInspectorSnapshotDto {
	readonly targetKey: string;
	readonly entities: ReadonlyArray<WorldInspectorEntityDto>;
	readonly registeredComponents: ReadonlyArray<WorldInspectorRegisteredComponentDto>;
	readonly resources: ReadonlyArray<WorldInspectorResourceDto>;
}

export type WorldInspectorEditDto =
	| { readonly kind: "spawn" }
	| { readonly kind: "despawn"; readonly entityId: number }
	| { readonly kind: "insert"; readonly entityId: number; readonly componentId: string; readonly fields: ReadonlyArray<WorldInspectorFieldDto> }
	| { readonly kind: "set"; readonly entityId: number; readonly componentId: string; readonly fields: ReadonlyArray<WorldInspectorFieldDto> }
	| { readonly kind: "remove"; readonly entityId: number; readonly componentId: string }
	| { readonly kind: "setResource"; readonly resourceId: string; readonly path: ReadonlyArray<string>; readonly field: WorldInspectorFieldDto };

export interface WorldInspectorEditResult {
	ok: boolean;
	error?: string;
	entityId?: number;
}

export interface WorldInspectorTarget {
	readonly key: string;
	readonly label: string;
	listEntities(): ReadonlyArray<WorldInspectorEntityDto>;
	listComponents(entityId: number): ReadonlyArray<WorldInspectorComponentDto>;
	listRegisteredComponents(): ReadonlyArray<WorldInspectorRegisteredComponentDto>;
	listResources(): ReadonlyArray<WorldInspectorResourceDto>;
	apply(edit: WorldInspectorEditDto): WorldInspectorEditResult;
}

export const LOCAL_TARGET: WorldInspectorTargetChoice = {
	key: "local",
	label: "Local",
	kind: "local",
};

export function targetChoices(state: WorldInspectorState): WorldInspectorTargetChoice[] {
	return [LOCAL_TARGET, ...state.remoteTargets];
}

export function targetForState(world: World, state: WorldInspectorState): WorldInspectorTarget {
	return targetForKey(world, state, state.selectedTargetKey);
}

export function targetForKey(world: World, state: WorldInspectorState, targetKey: string): WorldInspectorTarget {
	if (targetKey === LOCAL_TARGET.key) return new LocalWorldInspectorTarget(world);
	return new RemoteWorldInspectorTarget(state, targetKey);
}

export function worldToSnapshot(world: World, targetKey: string): WorldInspectorSnapshotDto {
	const entities = world.inspectEntities().map((entity) => entityToDto(world, entity));
	const registeredComponents = registeredComponentsToDto(world.inspectRegisteredComponents());
	const resources = world.inspectResources().map(resourceToDto);
	return { targetKey, entities, registeredComponents, resources };
}

export function applyWorldInspectorEdit(world: World, edit: WorldInspectorEditDto): WorldInspectorEditResult {
	if (edit.kind === "setResource") {
		const resource = findResource(world, edit.resourceId);
		if (resource === undefined) return { ok: false, error: `resource '${edit.resourceId}' is not inspectable` };
		const parsed = parseFieldValue(edit.field);
		if (!parsed.ok) return parsed;
		return world.inspectSetResourceValue(resource.ctor, edit.path, parsed.value);
	}

	const component = edit.kind === "spawn" || edit.kind === "despawn" ? undefined : findComponent(world, edit.componentId);
	if (edit.kind !== "spawn" && edit.kind !== "despawn" && component === undefined) {
		return { ok: false, error: `component '${edit.componentId}' is not registered` };
	}

	if (edit.kind === "spawn") {
		const id = world.spawn();
		return { ok: true, entityId: id as number };
	}
	if (edit.kind === "despawn") {
		world.despawn(edit.entityId as Entity);
		return { ok: true };
	}
	if (edit.kind === "remove") {
		world.remove(edit.entityId as Entity, component!.ctor);
		return { ok: true };
	}
	if (edit.fields.size() === 0) {
		world.insert(edit.entityId as Entity, component!.ctor);
		return { ok: true };
	}

	const built = buildComponentValue(component!, edit.fields);
	if (!built.ok) return built;
	world.set(edit.entityId as Entity, component!.ctor, built.value);
	return { ok: true };
}

export class LocalWorldInspectorTarget implements WorldInspectorTarget {
	readonly key = LOCAL_TARGET.key;
	readonly label = LOCAL_TARGET.label;

	constructor(private readonly world: World) {}

	listEntities(): ReadonlyArray<WorldInspectorEntityDto> {
		return this.world.inspectEntities().map((entity) => entityToDto(this.world, entity));
	}

	listComponents(entityId: number): ReadonlyArray<WorldInspectorComponentDto> {
		return entityToDto(this.world, entityId as Entity).components;
	}

	listRegisteredComponents(): ReadonlyArray<WorldInspectorRegisteredComponentDto> {
		return registeredComponentsToDto(this.world.inspectRegisteredComponents());
	}

	listResources(): ReadonlyArray<WorldInspectorResourceDto> {
		return this.world.inspectResources().map(resourceToDto);
	}

	apply(edit: WorldInspectorEditDto): WorldInspectorEditResult {
		return applyWorldInspectorEdit(this.world, edit);
	}
}

export class RemoteWorldInspectorTarget implements WorldInspectorTarget {
	readonly label: string;

	constructor(
		private readonly state: WorldInspectorState,
		readonly key: string,
	) {
		let label = key;
		for (const target of targetChoices(state)) {
			if (target.key === key) {
				label = target.label;
				break;
			}
		}
		this.label = label;
	}

	private snapshot(): WorldInspectorSnapshotDto | undefined {
		return this.state.snapshots.get(this.key);
	}

	listEntities(): ReadonlyArray<WorldInspectorEntityDto> {
		return this.snapshot()?.entities ?? [];
	}

	listComponents(entityId: number): ReadonlyArray<WorldInspectorComponentDto> {
		for (const entity of this.snapshot()?.entities ?? []) {
			if (entity.entityId === entityId) return entity.components;
		}
		return [];
	}

	listRegisteredComponents(): ReadonlyArray<WorldInspectorRegisteredComponentDto> {
		return this.snapshot()?.registeredComponents ?? [];
	}

	listResources(): ReadonlyArray<WorldInspectorResourceDto> {
		return this.snapshot()?.resources ?? [];
	}

	apply(edit: WorldInspectorEditDto): WorldInspectorEditResult {
		this.state.queueEdit(this.key, edit);
		return { ok: true };
	}
}

const INSTANCE_TYPE_LABELS = new Set<string>([
	"instance",
	"workspace",
	"model",
	"basepart",
	"part",
	"meshpart",
	"unionoperation",
	"folder",
	"player",
	"humanoid",
	"attachment",
	"tool",
	"remoteevent",
	"remotefunction",
	"bindableevent",
	"bindablefunction",
	"screengui",
	"frame",
	"guiobject",
	"textlabel",
	"textbutton",
	"imagelabel",
	"imagebutton",
]);

function trimText(text: string): string {
	return text.gsub("^%s*(.-)%s*$", "%1")[0];
}

function parseNumberTuple(text: string): number[] | undefined {
	let source = trimText(text).gsub("^new%s+", "")[0];
	const openIndex = source.find("(", 1, true)[0];
	if (openIndex !== undefined && source.sub(source.size(), source.size()) === ")") {
		source = source.sub(openIndex + 1, source.size() - 1);
	}
	const cleaned = source.gsub("[^%d%-%+%.]+", ",")[0];
	const values = new Array<number>();
	for (const piece of cleaned.split(",")) {
		if (piece.size() === 0) continue;
		const value = tonumber(piece);
		if (value === undefined) return undefined;
		values.push(value);
	}
	return values;
}

function isInstanceTypeLabel(typeLabel: string): boolean {
	return (
		INSTANCE_TYPE_LABELS.has(typeLabel) ||
		typeLabel.find("instance", 1, true)[0] !== undefined ||
		typeLabel.find("part", 1, true)[0] !== undefined ||
		typeLabel.find("model", 1, true)[0] !== undefined
	);
}

function valueToText(value: unknown): string {
	if (value === undefined) return "";
	if (typeIs(value, "string")) return value;
	if (typeIs(value, "number") || typeIs(value, "boolean")) return tostring(value);
	if (typeIs(value, "Instance")) return value.GetFullName();
	if (typeIs(value, "Vector2")) return `Vector2(${tostring(value.X)}, ${tostring(value.Y)})`;
	if (typeIs(value, "Vector3")) return `Vector3(${tostring(value.X)}, ${tostring(value.Y)}, ${tostring(value.Z)})`;
	if (typeIs(value, "UDim")) return `UDim(${tostring(value.Scale)}, ${tostring(value.Offset)})`;
	if (typeIs(value, "UDim2")) {
		return `UDim2(${tostring(value.X.Scale)}, ${tostring(value.X.Offset)}, ${tostring(value.Y.Scale)}, ${tostring(value.Y.Offset)})`;
	}
	if (typeIs(value, "Color3")) return `Color3(${tostring(value.R)}, ${tostring(value.G)}, ${tostring(value.B)})`;
	if (typeIs(value, "CFrame")) {
		const [x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22] = value.GetComponents();
		return `CFrame(${tostring(x)}, ${tostring(y)}, ${tostring(z)}, ${tostring(r00)}, ${tostring(r01)}, ${tostring(r02)}, ${tostring(r10)}, ${tostring(r11)}, ${tostring(r12)}, ${tostring(r20)}, ${tostring(r21)}, ${tostring(r22)})`;
	}
	return tostring(value);
}

function valueTypeLabel(value: unknown): string {
	if (value === undefined) return "unknown";
	if (typeIs(value, "string")) return "string";
	if (typeIs(value, "number")) return "number";
	if (typeIs(value, "boolean")) return "boolean";
	if (typeIs(value, "Instance")) return "Instance";
	const label = typeOf(value);
	return label !== undefined ? label : "unknown";
}

function isEditableTypeLabel(typeLabel: string): boolean {
	const lowered = typeLabel.lower();
	return (
		lowered === "string" ||
		lowered === "number" ||
		lowered === "boolean" ||
		lowered.find("vector2", 1, true)[0] !== undefined ||
		lowered.find("vector3", 1, true)[0] !== undefined ||
		lowered === "udim" ||
		lowered.find("udim2", 1, true)[0] !== undefined ||
		lowered.find("color3", 1, true)[0] !== undefined ||
		lowered.find("cframe", 1, true)[0] !== undefined ||
		isInstanceTypeLabel(lowered)
	);
}

function shouldBrowseResourceValue(value: unknown, depth: number): boolean {
	return typeIs(value, "table") && depth < 4 && !isEditableTypeLabel(valueTypeLabel(value));
}

function pushResourceField(
	out: Array<WorldInspectorResourceFieldDto>,
	key: string,
	path: ReadonlyArray<string>,
	typeLabel: string,
	value: unknown,
	depth: number,
): void {
	const runtimeLabel = valueTypeLabel(value);
	const editable = isEditableTypeLabel(typeLabel) || isEditableTypeLabel(runtimeLabel);
	const label = isEditableTypeLabel(typeLabel) ? typeLabel : runtimeLabel;
	out.push({
		key,
		path,
		typeLabel: label,
		valueText: valueToText(value),
		editable,
		depth,
	});
	if (!shouldBrowseResourceValue(value, depth)) return;
	for (const [childKey, childValue] of pairs(value as Record<never, unknown>)) {
		const childText = tostring(childKey);
		pushResourceField(out, childText, [...path, childText], valueTypeLabel(childValue), childValue, depth + 1);
	}
}

function registeredComponentsToDto(components: ReadonlyArray<ComponentReg>): WorldInspectorRegisteredComponentDto[] {
	const choices = buildComponentChoices(components);
	return choices.map((choice) => componentRegToDto(choice.component, choice.label));
}

function componentRegToDto(component: ComponentReg, label = componentShortName(component.id)): WorldInspectorRegisteredComponentDto {
	const fields = new Array<Omit<WorldInspectorFieldDto, "valueText">>();
	for (const field of component.editor?.fields ?? []) {
		fields.push({ key: field.key, typeLabel: field.typeLabel });
	}
	return {
		componentId: component.id,
		componentName: label,
		fields,
		tag: fields.size() === 0,
	};
}

function componentToDto(component: ComponentInspection): WorldInspectorComponentDto {
	const fields = new Array<WorldInspectorFieldDto>();
	const value = component.value as Record<string, unknown> | undefined;
	for (const field of component.editor?.fields ?? []) {
		fields.push({
			key: field.key,
			typeLabel: field.typeLabel,
			valueText: valueToText(value !== undefined ? value[field.key] : undefined),
		});
	}
	return {
		componentId: component.id,
		componentName: component.name,
		tag: component.tag,
		fields,
	};
}

function resourceToDto(resource: ResourceInspection): WorldInspectorResourceDto {
	return {
		resourceId: resource.id,
		resourceName: resource.name,
		fields: resourceFieldsToDto(resource),
		revision: resource.revision,
		changedPaths: resource.changedPaths,
	};
}

function resourceFieldsToDto(resource: ResourceInspection): WorldInspectorResourceFieldDto[] {
	const out = new Array<WorldInspectorResourceFieldDto>();
	const root = resource.value as Record<string, unknown> | undefined;
	for (const field of resource.inspect.fields) {
		const value = root !== undefined ? root[field.key] : undefined;
		pushResourceField(out, field.key, [field.key], field.typeLabel, value, 0);
	}
	return out;
}

function entityToDto(world: World, entity: Entity): WorldInspectorEntityDto {
	return {
		entityId: entity as number,
		components: world.inspectEntityComponents(entity).map(componentToDto),
	};
}

function findComponent(world: World, componentId: string): ComponentReg | undefined {
	for (const component of world.inspectRegisteredComponents()) {
		if (component.id === componentId) return component;
	}
	return undefined;
}

function findResource(world: World, resourceId: string): ResourceReg | undefined {
	for (const resource of world.inspectRegisteredResources()) {
		if (resource.id === resourceId) return resource;
	}
	return undefined;
}

function parseVector2Text(text: string): Vector2 | undefined {
	const values = parseNumberTuple(text);
	if (values === undefined || values.size() !== 2) return undefined;
	return new Vector2(values[0], values[1]);
}

function parseVector3Text(text: string): Vector3 | undefined {
	const values = parseNumberTuple(text);
	if (values === undefined || values.size() !== 3) return undefined;
	return new Vector3(values[0], values[1], values[2]);
}

function parseUDimText(text: string): UDim | undefined {
	const values = parseNumberTuple(text);
	if (values === undefined || values.size() !== 2) return undefined;
	return new UDim(values[0], values[1]);
}

function parseUDim2Text(text: string): UDim2 | undefined {
	const values = parseNumberTuple(text);
	if (values === undefined || values.size() !== 4) return undefined;
	return new UDim2(values[0], values[1], values[2], values[3]);
}

function parseColor3Text(text: string): Color3 | undefined {
	const values = parseNumberTuple(text);
	if (values === undefined || values.size() !== 3) return undefined;
	if (trimText(text).lower().find("fromrgb", 1, true)[0] !== undefined) {
		return Color3.fromRGB(values[0], values[1], values[2]);
	}
	return new Color3(values[0], values[1], values[2]);
}

function parseCFrameText(text: string): CFrame | undefined {
	const values = parseNumberTuple(text);
	if (values === undefined) return undefined;
	if (values.size() === 3) return new CFrame(values[0], values[1], values[2]);
	if (values.size() === 12) {
		return new CFrame(
			values[0],
			values[1],
			values[2],
			values[3],
			values[4],
			values[5],
			values[6],
			values[7],
			values[8],
			values[9],
			values[10],
			values[11],
		);
	}
	return undefined;
}

function parseFieldValue(field: WorldInspectorFieldDto): { ok: true; value: defined } | { ok: false; error: string } {
	const typeLabel = field.typeLabel.lower();
	const text = field.valueText;
	if (typeLabel === "string") return { ok: true, value: text };
	if (typeLabel === "number") {
		const value = tonumber(text);
		return value === undefined ? { ok: false, error: `expected number for '${field.key}'` } : { ok: true, value };
	}
	if (typeLabel === "boolean") {
		const lowered = text.lower();
		if (lowered === "true") return { ok: true, value: true };
		if (lowered === "false") return { ok: true, value: false };
		return { ok: false, error: `expected boolean for '${field.key}'` };
	}
	if (typeLabel.find("vector2", 1, true)[0] !== undefined) {
		const value = parseVector2Text(text);
		return value === undefined ? { ok: false, error: `expected Vector2 for '${field.key}'` } : { ok: true, value };
	}
	if (typeLabel.find("vector3", 1, true)[0] !== undefined) {
		const value = parseVector3Text(text);
		return value === undefined ? { ok: false, error: `expected Vector3 for '${field.key}'` } : { ok: true, value };
	}
	if (typeLabel.find("udim2", 1, true)[0] !== undefined) {
		const value = parseUDim2Text(text);
		return value === undefined ? { ok: false, error: `expected UDim2 for '${field.key}'` } : { ok: true, value };
	}
	if (typeLabel === "udim") {
		const value = parseUDimText(text);
		return value === undefined ? { ok: false, error: `expected UDim for '${field.key}'` } : { ok: true, value };
	}
	if (typeLabel.find("color3", 1, true)[0] !== undefined) {
		const value = parseColor3Text(text);
		return value === undefined ? { ok: false, error: `expected Color3 for '${field.key}'` } : { ok: true, value };
	}
	if (typeLabel.find("cframe", 1, true)[0] !== undefined) {
		const value = parseCFrameText(text);
		return value === undefined ? { ok: false, error: `expected CFrame for '${field.key}'` } : { ok: true, value };
	}
	if (isInstanceTypeLabel(typeLabel)) {
		const resolved = resolveInstanceExpression(text);
		return resolved.ok ? { ok: true, value: resolved.value as defined } : { ok: false, error: resolved.error ?? `invalid instance expression for '${field.key}'` };
	}
	return { ok: true, value: text };
}

function buildComponentValue(
	component: ComponentReg,
	fields: ReadonlyArray<WorldInspectorFieldDto>,
): { ok: true; value: object } | { ok: false; error: string } {
	const editor = component.editor;
	if (editor === undefined) return { ok: false, error: `component '${component.id}' has no editor metadata` };

	const args = new Array<defined>();
	for (const editorField of editor.fields) {
		let incoming: WorldInspectorFieldDto | undefined;
		for (const field of fields) {
			if (field.key === editorField.key) {
				incoming = field;
				break;
			}
		}
		if (incoming === undefined) return { ok: false, error: `missing field '${editorField.key}'` };
		const parsed = parseFieldValue(incoming);
		if (!parsed.ok) return parsed;
		if (!editorField.validator(parsed.value)) return { ok: false, error: `field '${editorField.key}' failed validator` };
		args.push(parsed.value);
	}
	if (!editor.constructorValidator(args)) return { ok: false, error: "constructor validator failed" };

	const factory = component.ctor as unknown as new (...values: Array<defined>) => object;
	return { ok: true, value: new factory(...args) };
}
