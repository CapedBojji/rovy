import {
	widget,
	__callWidget,
	__scope,
	__useEffect,
	__useInstance,
	__useState,
	provideContext,
	useContext,
	useInputService,
	usePointerDrag,
} from "../runtime";
import { useStyle, type Style } from "../style";
import { create } from "../create";
import { createConnect } from "../createConnect";
import { c, udim, udim2, v2 } from "../primitives";
import { EditableImageBuffer } from "../editable-image-buffer";
import { button } from "./button";
import { label } from "./label";
import { popup } from "./popup";
import { row } from "./row";
import { isTopGuiTarget, pointInsideGuiObject } from "./shared";
import * as contexts from "../contexts";

export interface BezierCurvePoint {
	x: number;
	y: number;
}

export interface BezierCurveAnchor extends BezierCurvePoint {
	inHandle?: BezierCurvePoint;
	outHandle?: BezierCurvePoint;
}

export interface BezierCurve {
	anchors: BezierCurveAnchor[];
}

export interface CurvePreset {
	name: string;
	curve: BezierCurve;
}

export interface CurveEditorOptions {
	initialCurve?: BezierCurve;
	presets?: CurvePreset[];
	width?: number;
	height?: number;
	sampleCount?: number;
	showReadout?: boolean;
	allowScroll?: boolean;
	returnToOriginKey?: unknown;
}

export interface CurveEditorHandle {
	curve(): BezierCurve;
	changed(): boolean;
	selectedAnchor(): number | undefined;
	viewportOffset(): Vector2;
	returnToOrigin(): void;
	presets(): CurvePreset[];
	selectedPreset(): string | undefined;
	getSegments(): CurvePathSnapshot[];
	selectedSegment(): string | undefined;
	selectedPoint(): { segmentId: string; pointIndex: number } | undefined;
	deleteSelectedPoint(): boolean;
}

export interface CurveCanvasPoint {
	x: number;
	y: number;
}

export type CurvePathCommand =
	| { kind: "M"; point: CurveCanvasPoint }
	| { kind: "L"; point: CurveCanvasPoint }
	| { kind: "Q"; control: CurveCanvasPoint; point: CurveCanvasPoint }
	| { kind: "C"; control1: CurveCanvasPoint; control2: CurveCanvasPoint; point: CurveCanvasPoint }
	| { kind: "Z" };

export type CurveSegmentKind = "L" | "Q" | "C";

export interface CurvePathOptions {
	id: string;
	revision?: string | number;
	commands: CurvePathCommand[];
	color?: Color3;
	thickness?: number;
	visible?: boolean;
	locked?: boolean;
	metadata?: unknown;
}

export interface CurvePathPointInfo {
	index: number;
	commandIndex: number;
	commandKind: "M" | "L" | "Q" | "C";
	point: CurveCanvasPoint;
	inHandle?: CurveCanvasPoint;
	outHandle?: CurveCanvasPoint;
}

export interface CurvePathSnapshot {
	id: string;
	revision?: string | number;
	commands: CurvePathCommand[];
	points: CurvePathPointInfo[];
	color?: Color3;
	thickness?: number;
	visible: boolean;
	locked: boolean;
	metadata?: unknown;
}

export interface CurvePathHandle {
	getCommands(): CurvePathCommand[];
	getPoints(): CurvePathPointInfo[];
	getSnapshot(): CurvePathSnapshot | undefined;
	selected(): boolean;
	convertCommand(commandIndex: number, kind: CurveSegmentKind): boolean;
}

interface StoredCurvePath {
	id: string;
	revision?: string | number;
	commands: CurvePathCommand[];
	points: CurvePathPointInfo[];
	color?: Color3;
	thickness?: number;
	visible: boolean;
	locked: boolean;
	metadata?: unknown;
	signature: string;
}

type CurveEditorSelectionKind = "point" | "inHandle" | "outHandle";

interface CurveEditorSelection {
	segmentId: string;
	pointIndex: number;
	kind: CurveEditorSelectionKind;
}

interface CurveEditorPathStore {
	paths: Map<string, StoredCurvePath>;
	order: string[];
	selection?: CurveEditorSelection;
}

interface CurveEditorPathScope {
	register(options: CurvePathOptions): CurvePathHandle;
}

interface CurveEditorPathHit {
	segmentId: string;
	type: "point" | "inHandle" | "outHandle" | "segment";
	pointIndex?: number;
	commandIndex?: number;
	t?: number;
	distance: number;
}

interface CurveEditorActiveDrag {
	kind: "pan" | "point" | "inHandle" | "outHandle";
	selection?: CurveEditorSelection;
}

interface CurveEditorContextMenu {
	position: Vector2;
	segmentId: string;
	pointIndex: number;
}

interface CurveEditorContextHeaderRefs {
	header: TextButton;
	inputChangedConnection?: RBXScriptConnection;
	inputEndedConnection?: RBXScriptConnection;
	dragStartPosition?: Vector2;
	dragStartMenuPosition?: Vector2;
}

interface CurveEditorRefs {
	root: Frame;
	graph: Frame;
	imageLabel: ImageLabel;
	errorLabel: TextLabel;
	overlay: TextButton;
	editableImage?: EditableImage;
	buffer?: EditableImageBuffer;
	size?: Vector2;
	canvasDirty?: boolean;
	imageCreateFailedSize?: Vector2;
	curve?: BezierCurve;
	viewportOffset?: Vector2;
	setChanged?: (changed: boolean) => void;
	setViewportOffset?: (offset: Vector2) => void;
	pathStore?: CurveEditorPathStore;
	allowScroll?: boolean;
	inputBeganConnection?: RBXScriptConnection;
	inputChangedConnection?: RBXScriptConnection;
	inputEndedConnection?: RBXScriptConnection;
	pointerDragging?: boolean;
	endPointerDrag?: () => void;
	panLastPosition?: Vector2;
	activeDrag?: CurveEditorActiveDrag;
	lastBeginClock?: number;
	lastBeginPosition?: Vector2;
	contextMenu?: CurveEditorContextMenu;
}

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 180;
const DEFAULT_SAMPLE_COUNT = 48;
const MIN_ANCHOR_GAP = 0.001;
const GRID_MINOR_STEP = 24;
const GRID_MAJOR_EVERY = 5;
const MAX_EDITABLE_IMAGE_SIZE = 1024;
const PATH_HIT_RADIUS = 9;
const PATH_POINT_RADIUS = 4;
const PATH_HANDLE_RADIUS = 4;
const PATH_CURVE_SAMPLES = 24;
const CONTEXT_PANEL_WIDTH = 158;
const CONTEXT_PANEL_HEIGHT = 142;
const CONTEXT_PANEL_MARGIN = 8;
const CONTEXT_PANEL_GAP = 12;

function clonePoint(point: BezierCurvePoint | undefined): BezierCurvePoint | undefined {
	if (point === undefined) return undefined;
	return { x: point.x, y: point.y };
}

function cloneAnchor(anchor: BezierCurveAnchor): BezierCurveAnchor {
	return {
		x: anchor.x,
		y: anchor.y,
		inHandle: clonePoint(anchor.inHandle),
		outHandle: clonePoint(anchor.outHandle),
	};
}

function cloneCurve(curve: BezierCurve): BezierCurve {
	const anchors = new Array<BezierCurveAnchor>();
	for (const anchor of curve.anchors) anchors.push(cloneAnchor(anchor));
	return { anchors };
}

function point(x: number, y: number): BezierCurvePoint {
	return { x, y };
}

function anchor(x: number, y: number, inHandle?: BezierCurvePoint, outHandle?: BezierCurvePoint): BezierCurveAnchor {
	return { x, y, inHandle, outHandle };
}

function lineCurve(): BezierCurve {
	return { anchors: [anchor(0, 0), anchor(1, 1)] };
}

export const curveEditorBuiltInPresets: CurvePreset[] = [
	{ name: "Line", curve: lineCurve() },
	{
		name: "Ease In",
		curve: { anchors: [anchor(0, 0, undefined, point(0.42, 0)), anchor(1, 1, point(1, 1))] },
	},
	{
		name: "Ease Out",
		curve: { anchors: [anchor(0, 0, undefined, point(0, 0)), anchor(1, 1, point(0.58, 1))] },
	},
	{
		name: "Ease In Out",
		curve: { anchors: [anchor(0, 0, undefined, point(0.42, 0)), anchor(1, 1, point(0.58, 1))] },
	},
	{
		name: "Bounce",
		curve: {
			anchors: [
				anchor(0, 0, undefined, point(0.18, 0.58)),
				anchor(0.55, 0.92, point(0.38, 1), point(0.64, 0.7)),
				anchor(0.78, 0.82, point(0.68, 0.82), point(0.88, 0.97)),
				anchor(1, 1, point(0.94, 1)),
			],
		},
	},
	{
		name: "Overshoot",
		curve: {
			anchors: [
				anchor(0, 0, undefined, point(0.35, 0.84)),
				anchor(0.72, 0.98, point(0.58, 1), point(0.86, 1)),
				anchor(1, 1, point(0.92, 0.9)),
			],
		},
	},
];

function clamp01(value: number): number {
	return math.clamp(value, 0, 1);
}

function clampPointToSegment(handle: BezierCurvePoint | undefined, minX: number, maxX: number): BezierCurvePoint | undefined {
	if (handle === undefined) return undefined;
	return {
		x: math.clamp(handle.x, minX, maxX),
		y: clamp01(handle.y),
	};
}

function normalizeCurve(input?: BezierCurve): BezierCurve {
	const source = input?.anchors ?? lineCurve().anchors;
	const interior = new Array<BezierCurveAnchor>();
	let startOut: BezierCurvePoint | undefined;
	let endIn: BezierCurvePoint | undefined;

	for (const sourceAnchor of source) {
		const rawX = sourceAnchor.x;
		const x = clamp01(sourceAnchor.x);
		const y = clamp01(sourceAnchor.y);
		if (rawX <= 0) {
			startOut = clonePoint(sourceAnchor.outHandle) ?? startOut;
		} else if (rawX >= 1) {
			endIn = clonePoint(sourceAnchor.inHandle) ?? endIn;
		} else {
			interior.push({
				x,
				y,
				inHandle: clonePoint(sourceAnchor.inHandle),
				outHandle: clonePoint(sourceAnchor.outHandle),
			});
		}
	}

	interior.sort((left, right) => left.x < right.x);

	const anchors = new Array<BezierCurveAnchor>();
	anchors.push({ x: 0, y: 0, outHandle: startOut });
	let lastX = 0;
	for (const sourceAnchor of interior) {
		const nextX = math.clamp(sourceAnchor.x, lastX + MIN_ANCHOR_GAP, 1 - MIN_ANCHOR_GAP);
		if (nextX >= 1) continue;
		anchors.push({
			x: nextX,
			y: sourceAnchor.y,
			inHandle: sourceAnchor.inHandle,
			outHandle: sourceAnchor.outHandle,
		});
		lastX = nextX;
	}
	anchors.push({ x: 1, y: 1, inHandle: endIn });

	for (let i = 0; i < anchors.size(); i++) {
		const current = anchors[i];
		const previous = anchors[i - 1];
		const following = anchors[i + 1];
		current.x = i === 0 ? 0 : i === anchors.size() - 1 ? 1 : clamp01(current.x);
		current.y = i === 0 ? 0 : i === anchors.size() - 1 ? 1 : clamp01(current.y);
		current.inHandle = previous !== undefined ? clampPointToSegment(current.inHandle, previous.x, current.x) : undefined;
		current.outHandle = following !== undefined ? clampPointToSegment(current.outHandle, current.x, following.x) : undefined;
	}

	return { anchors };
}

function mergedPresets(optionPresets: ReadonlyArray<CurvePreset> | undefined, userPresets: ReadonlyArray<CurvePreset>): CurvePreset[] {
	const output = new Array<CurvePreset>();
	const names = new Set<string>();
	const append = (preset: CurvePreset): void => {
		const cleanName = normalizePresetName(preset.name);
		if (cleanName === "") return;
		const normalized = { name: cleanName, curve: normalizeCurve(preset.curve) };
		for (let i = 0; i < output.size(); i++) {
			if (output[i].name === cleanName) {
				output[i] = normalized;
				return;
			}
		}
		names.add(cleanName);
		output.push(normalized);
	};

	for (const preset of curveEditorBuiltInPresets) append(preset);
	for (const preset of optionPresets ?? []) append(preset);
	for (const preset of userPresets) append(preset);
	return output;
}

function normalizePresetName(name: string): string {
	return name.gsub("^%s+", "")[0].gsub("%s+$", "")[0] as string;
}

function segmentPoint(t: number, p0: BezierCurvePoint, p1: BezierCurvePoint, p2: BezierCurvePoint, p3: BezierCurvePoint): BezierCurvePoint {
	const inv = 1 - t;
	const a = inv * inv * inv;
	const b = 3 * inv * inv * t;
	const cc = 3 * inv * t * t;
	const d = t * t * t;
	return {
		x: a * p0.x + b * p1.x + cc * p2.x + d * p3.x,
		y: a * p0.y + b * p1.y + cc * p2.y + d * p3.y,
	};
}

export function sampleBezierCurve(curve: BezierCurve, sampleCount: number): Vector2[] {
	const normalized = normalizeCurve(curve);
	const anchors = normalized.anchors;
	const count = math.max(2, math.floor(sampleCount));
	const samples = new Array<Vector2>();
	const segmentCount = math.max(1, anchors.size() - 1);

	for (let i = 0; i < count; i++) {
		const globalT = count === 1 ? 0 : i / (count - 1);
		const rawSegment = math.min(segmentCount - 1, math.floor(globalT * segmentCount));
		const segmentStart = rawSegment / segmentCount;
		const localT = math.clamp((globalT - segmentStart) * segmentCount, 0, 1);
		const left = anchors[rawSegment];
		const right = anchors[rawSegment + 1];
		const p = segmentPoint(
			localT,
			left,
			left.outHandle ?? left,
			right.inHandle ?? right,
			right,
		);
		samples.push(v2(p.x, p.y));
	}

	return samples;
}

function canvasPoint(x: number, y: number): CurveCanvasPoint {
	return { x, y };
}

function cloneCanvasPoint(point: CurveCanvasPoint | undefined): CurveCanvasPoint | undefined {
	if (point === undefined) return undefined;
	return { x: point.x, y: point.y };
}

function clonePathCommand(command: CurvePathCommand): CurvePathCommand {
	if (command.kind === "M") return { kind: "M", point: cloneCanvasPoint(command.point)! };
	if (command.kind === "L") return { kind: "L", point: cloneCanvasPoint(command.point)! };
	if (command.kind === "Q") {
		return {
			kind: "Q",
			control: cloneCanvasPoint(command.control)!,
			point: cloneCanvasPoint(command.point)!,
		};
	}
	if (command.kind === "C") {
		return {
			kind: "C",
			control1: cloneCanvasPoint(command.control1)!,
			control2: cloneCanvasPoint(command.control2)!,
			point: cloneCanvasPoint(command.point)!,
		};
	}
	return { kind: "Z" };
}

function clonePathCommands(commands: ReadonlyArray<CurvePathCommand>): CurvePathCommand[] {
	const cloned = new Array<CurvePathCommand>();
	for (const command of commands) cloned.push(clonePathCommand(command));
	return cloned;
}

function colorEquals(left: Color3 | undefined, right: Color3 | undefined): boolean {
	if (left === right) return true;
	if (left === undefined || right === undefined) return false;
	return left.R === right.R && left.G === right.G && left.B === right.B;
}

function pointEquals(left: CurveCanvasPoint | undefined, right: CurveCanvasPoint | undefined): boolean {
	if (left === right) return true;
	if (left === undefined || right === undefined) return false;
	return left.x === right.x && left.y === right.y;
}

function addCanvasPoints(left: CurveCanvasPoint, right: CurveCanvasPoint): CurveCanvasPoint {
	return { x: left.x + right.x, y: left.y + right.y };
}

function subCanvasPoints(left: CurveCanvasPoint, right: CurveCanvasPoint): CurveCanvasPoint {
	return { x: left.x - right.x, y: left.y - right.y };
}

function lerpCanvasPoint(left: CurveCanvasPoint, right: CurveCanvasPoint, t: number): CurveCanvasPoint {
	return {
		x: left.x + (right.x - left.x) * t,
		y: left.y + (right.y - left.y) * t,
	};
}

function distanceSquared(left: CurveCanvasPoint, right: CurveCanvasPoint): number {
	const dx = left.x - right.x;
	const dy = left.y - right.y;
	return dx * dx + dy * dy;
}

function createPathStore(): CurveEditorPathStore {
	return {
		paths: new Map<string, StoredCurvePath>(),
		order: new Array<string>(),
	};
}

function commandPoint(command: CurvePathCommand): CurveCanvasPoint | undefined {
	if (command.kind === "Z") return undefined;
	return command.point;
}

function commandHasPoint(command: CurvePathCommand): command is Exclude<CurvePathCommand, { kind: "Z" }> {
	return command.kind !== "Z";
}

function commandSignature(commands: ReadonlyArray<CurvePathCommand>): string {
	let signature = `${commands.size()}|`;
	for (const command of commands) {
		if (command.kind === "M" || command.kind === "L") {
			signature += `${command.kind}:${command.point.x},${command.point.y}|`;
		} else if (command.kind === "Q") {
			signature += `Q:${command.control.x},${command.control.y}:${command.point.x},${command.point.y}|`;
		} else if (command.kind === "C") {
			signature += `C:${command.control1.x},${command.control1.y}:${command.control2.x},${command.control2.y}:${command.point.x},${command.point.y}|`;
		} else {
			signature += "Z|";
		}
	}
	return signature;
}

function normalizePathOptions(options: CurvePathOptions): StoredCurvePath | undefined {
	const id = normalizePathId(options.id);
	if (id === "") {
		warn("[rovy-ui] curvePath requires a non-empty id");
		return undefined;
	}
	if (options.commands.size() < 2 || options.commands[0].kind !== "M") {
		warn(`[rovy-ui] curvePath "${id}" must start with M and contain at least two editable points`);
		return undefined;
	}

	let editablePointCount = 0;
	for (const command of options.commands) {
		if (commandHasPoint(command)) editablePointCount += 1;
	}
	if (editablePointCount < 2) {
		warn(`[rovy-ui] curvePath "${id}" must contain at least two editable points`);
		return undefined;
	}

	const path: StoredCurvePath = {
		id,
		revision: options.revision,
		commands: options.commands,
		points: new Array<CurvePathPointInfo>(),
		color: options.color,
		thickness: math.max(1, math.floor(options.thickness ?? 2)),
		visible: options.visible ?? true,
		locked: options.locked ?? false,
		metadata: options.metadata,
		signature: commandSignature(options.commands),
	};
	refreshPathPoints(path);
	return path;
}

function normalizePathId(id: string): string {
	return id.gsub("^%s+", "")[0].gsub("%s+$", "")[0] as string;
}

function pointInfoForCommand(
	command: Exclude<CurvePathCommand, { kind: "Z" }>,
	commandIndex: number,
	pointIndex: number,
	nextCommand: CurvePathCommand | undefined,
): CurvePathPointInfo {
	let inHandle: CurveCanvasPoint | undefined;
	if (command.kind === "Q") inHandle = cloneCanvasPoint(command.control);
	else if (command.kind === "C") inHandle = cloneCanvasPoint(command.control2);

	let outHandle: CurveCanvasPoint | undefined;
	if (nextCommand?.kind === "Q") outHandle = cloneCanvasPoint(nextCommand.control);
	else if (nextCommand?.kind === "C") outHandle = cloneCanvasPoint(nextCommand.control1);

	return {
		index: pointIndex,
		commandIndex,
		commandKind: command.kind,
		point: cloneCanvasPoint(command.point)!,
		inHandle,
		outHandle,
	};
}

function refreshPathPoints(path: StoredCurvePath): void {
	const points = new Array<CurvePathPointInfo>();
	for (let commandIndex = 0; commandIndex < path.commands.size(); commandIndex++) {
		const command = path.commands[commandIndex];
		if (!commandHasPoint(command)) continue;
		points.push(pointInfoForCommand(command, commandIndex, points.size(), path.commands[commandIndex + 1]));
	}
	path.points = points;
}

function commitPathCommands(path: StoredCurvePath): void {
	refreshPathPoints(path);
	path.signature = commandSignature(path.commands);
}

function clonePointInfo(info: CurvePathPointInfo): CurvePathPointInfo {
	return {
		index: info.index,
		commandIndex: info.commandIndex,
		commandKind: info.commandKind,
		point: cloneCanvasPoint(info.point)!,
		inHandle: cloneCanvasPoint(info.inHandle),
		outHandle: cloneCanvasPoint(info.outHandle),
	};
}

function clonePathSnapshot(path: StoredCurvePath): CurvePathSnapshot {
	const points = new Array<CurvePathPointInfo>();
	for (const info of path.points) points.push(clonePointInfo(info));
	return {
		id: path.id,
		revision: path.revision,
		commands: clonePathCommands(path.commands),
		points,
		color: path.color,
		thickness: path.thickness,
		visible: path.visible,
		locked: path.locked,
		metadata: path.metadata,
	};
}

function clonePathPoints(path: StoredCurvePath | undefined): CurvePathPointInfo[] {
	const points = new Array<CurvePathPointInfo>();
	if (path === undefined) return points;
	for (const info of path.points) points.push(clonePointInfo(info));
	return points;
}

function scaleCanvasPoint(point: CurveCanvasPoint, scale: number): CurveCanvasPoint {
	return { x: point.x * scale, y: point.y * scale };
}

function convertPathCommand(path: StoredCurvePath, commandIndex: number, kind: CurveSegmentKind): boolean {
	const command = path.commands[commandIndex];
	if (command === undefined || command.kind === "M" || command.kind === "Z" || command.kind === kind) return false;
	const start = previousDrawablePoint(path, commandIndex);
	if (start === undefined) return false;
	const endpoint = commandPoint(command);
	if (endpoint === undefined) return false;

	let nextCommand: CurvePathCommand | undefined;
	if (kind === "L") {
		nextCommand = { kind: "L", point: cloneCanvasPoint(endpoint)! };
	} else if (kind === "Q") {
		let control: CurveCanvasPoint;
		if (command.kind === "L") {
			control = lerpCanvasPoint(start, endpoint, 0.5);
		} else if (command.kind === "C") {
			const q1 = addCanvasPoints(start, scaleCanvasPoint(subCanvasPoints(command.control1, start), 1.5));
			const q2 = addCanvasPoints(endpoint, scaleCanvasPoint(subCanvasPoints(command.control2, endpoint), 1.5));
			control = lerpCanvasPoint(q1, q2, 0.5);
		} else {
			return false;
		}
		nextCommand = { kind: "Q", control, point: cloneCanvasPoint(endpoint)! };
	} else {
		let control1: CurveCanvasPoint;
		let control2: CurveCanvasPoint;
		if (command.kind === "L") {
			control1 = lerpCanvasPoint(start, endpoint, 1 / 3);
			control2 = lerpCanvasPoint(start, endpoint, 2 / 3);
		} else if (command.kind === "Q") {
			control1 = addCanvasPoints(start, scaleCanvasPoint(subCanvasPoints(command.control, start), 2 / 3));
			control2 = addCanvasPoints(endpoint, scaleCanvasPoint(subCanvasPoints(command.control, endpoint), 2 / 3));
		} else {
			return false;
		}
		nextCommand = { kind: "C", control1, control2, point: cloneCanvasPoint(endpoint)! };
	}

	path.commands[commandIndex] = nextCommand;
	commitPathCommands(path);
	return true;
}

function createCurvePathHandle(
	store: CurveEditorPathStore,
	id: string,
	fallbackCommands: CurvePathCommand[],
	refs?: CurveEditorRefs,
): CurvePathHandle {
	return {
		getCommands() {
			return store.paths.get(id)?.commands ?? fallbackCommands;
		},
		getPoints() {
			return clonePathPoints(store.paths.get(id));
		},
		getSnapshot() {
			const path = store.paths.get(id);
			return path !== undefined ? clonePathSnapshot(path) : undefined;
		},
		selected() {
			return store.selection?.segmentId === id;
		},
		convertCommand(commandIndex: number, kind: CurveSegmentKind) {
			const path = store.paths.get(id);
			if (path === undefined || path.locked) return false;
			const converted = convertPathCommand(path, commandIndex, kind);
			if (converted && refs !== undefined) markPathEdited(refs);
			return converted;
		},
	};
}

function getPointInfo(path: StoredCurvePath, pointIndex: number): CurvePathPointInfo | undefined {
	for (const info of path.points) {
		if (info.index === pointIndex) return info;
	}
	return undefined;
}

function updatePathVisualOptions(path: StoredCurvePath, options: CurvePathOptions): boolean {
	let changed = false;
	const visible = options.visible ?? true;
	const locked = options.locked ?? false;
	const thickness = math.max(1, math.floor(options.thickness ?? 2));
	if (!colorEquals(path.color, options.color)) {
		path.color = options.color;
		changed = true;
	}
	if (path.thickness !== thickness) {
		path.thickness = thickness;
		changed = true;
	}
	if (path.visible !== visible) {
		path.visible = visible;
		changed = true;
	}
	if (path.locked !== locked) {
		path.locked = locked;
		changed = true;
	}
	if (path.metadata !== options.metadata) path.metadata = options.metadata;
	return changed;
}

function updatePathFromOptions(path: StoredCurvePath, options: CurvePathOptions): boolean {
	let dirty = updatePathVisualOptions(path, options);
	const nextSignature = commandSignature(options.commands);
	const commandsChanged = path.signature !== nextSignature;
	if (path.commands !== options.commands || commandsChanged) {
		path.commands = options.commands;
		path.signature = nextSignature;
		refreshPathPoints(path);
		if (commandsChanged) dirty = true;
	}
	if (path.revision !== options.revision) path.revision = options.revision;
	return dirty;
}

function reconcilePathStore(store: CurveEditorPathStore, registrations: ReadonlyArray<CurvePathOptions>): boolean {
	let dirty = false;
	const seen = new Set<string>();
	const nextOrder = new Array<string>();

	for (const registration of registrations) {
		const normalized = normalizePathOptions(registration);
		if (normalized === undefined) continue;
		if (seen.has(normalized.id)) {
			warn(`[rovy-ui] duplicate curvePath id "${normalized.id}" ignored`);
			continue;
		}
		seen.add(normalized.id);
		nextOrder.push(normalized.id);

		const existing = store.paths.get(normalized.id);
		if (existing === undefined) {
			store.paths.set(normalized.id, normalized);
			dirty = true;
		} else if (updatePathFromOptions(existing, registration)) {
			dirty = true;
		}
	}

	for (const id of store.order) {
		if (!seen.has(id)) {
			store.paths.delete(id);
			if (store.selection?.segmentId === id) store.selection = undefined;
			dirty = true;
		}
	}

	if (store.order.size() !== nextOrder.size()) {
		dirty = true;
	} else {
		for (let i = 0; i < nextOrder.size(); i++) {
			if (store.order[i] !== nextOrder[i]) {
				dirty = true;
				break;
			}
		}
	}
	store.order = nextOrder;
	return dirty;
}

function screenToWorld(refs: CurveEditorRefs, inputObject: InputObject, fallbackSize: Vector2): CurveCanvasPoint {
	const localPosition = v2(
		inputObject.Position.X - refs.overlay.AbsolutePosition.X,
		inputObject.Position.Y - refs.overlay.AbsolutePosition.Y,
	);
	const offset = refs.viewportOffset ?? defaultViewportOffset(refs.size ?? fallbackSize);
	return canvasPoint(localPosition.X - offset.X, localPosition.Y - offset.Y);
}

function worldToScreen(point: CurveCanvasPoint, viewportOffset: Vector2): Vector2 {
	return v2(viewportOffset.X + point.x, viewportOffset.Y + point.y);
}

function quadraticPoint(t: number, p0: CurveCanvasPoint, p1: CurveCanvasPoint, p2: CurveCanvasPoint): CurveCanvasPoint {
	const inv = 1 - t;
	return {
		x: inv * inv * p0.x + 2 * inv * t * p1.x + t * t * p2.x,
		y: inv * inv * p0.y + 2 * inv * t * p1.y + t * t * p2.y,
	};
}

function cubicPoint(
	t: number,
	p0: CurveCanvasPoint,
	p1: CurveCanvasPoint,
	p2: CurveCanvasPoint,
	p3: CurveCanvasPoint,
): CurveCanvasPoint {
	const inv = 1 - t;
	const a = inv * inv * inv;
	const b = 3 * inv * inv * t;
	const cc = 3 * inv * t * t;
	const d = t * t * t;
	return {
		x: a * p0.x + b * p1.x + cc * p2.x + d * p3.x,
		y: a * p0.y + b * p1.y + cc * p2.y + d * p3.y,
	};
}

function nearestPointOnLine(
	world: CurveCanvasPoint,
	from: CurveCanvasPoint,
	to: CurveCanvasPoint,
): { distance: number; t: number } {
	const dx = to.x - from.x;
	const dy = to.y - from.y;
	const lengthSq = dx * dx + dy * dy;
	const t = lengthSq <= 0 ? 0 : math.clamp(((world.x - from.x) * dx + (world.y - from.y) * dy) / lengthSq, 0, 1);
	const projected = canvasPoint(from.x + dx * t, from.y + dy * t);
	return { distance: math.sqrt(distanceSquared(world, projected)), t };
}

function nearestSampledCurvePoint(
	world: CurveCanvasPoint,
	pointAt: (t: number) => CurveCanvasPoint,
): { distance: number; t: number } {
	let bestDistance = math.huge;
	let bestT = 0;
	let previousPoint = pointAt(0);
	let previousT = 0;
	for (let i = 1; i <= PATH_CURVE_SAMPLES; i++) {
		const currentT = i / PATH_CURVE_SAMPLES;
		const currentPoint = pointAt(currentT);
		const hit = nearestPointOnLine(world, previousPoint, currentPoint);
		if (hit.distance < bestDistance) {
			bestDistance = hit.distance;
			bestT = previousT + (currentT - previousT) * hit.t;
		}
		previousPoint = currentPoint;
		previousT = currentT;
	}
	return { distance: bestDistance, t: bestT };
}

function selectedPointHandleHit(store: CurveEditorPathStore, world: CurveCanvasPoint): CurveEditorPathHit | undefined {
	const selection = store.selection;
	if (selection === undefined) return undefined;
	const path = store.paths.get(selection.segmentId);
	if (path === undefined || !path.visible || path.locked) return undefined;
	const info = getPointInfo(path, selection.pointIndex);
	if (info === undefined) return undefined;

	let best: CurveEditorPathHit | undefined;
	const consider = (handleKind: "inHandle" | "outHandle", point: CurveCanvasPoint | undefined): void => {
		if (point === undefined) return;
		const distance = math.sqrt(distanceSquared(world, point));
		if (distance > PATH_HIT_RADIUS) return;
		if (best === undefined || distance < best.distance) {
			best = { segmentId: path.id, type: handleKind, pointIndex: info.index, commandIndex: info.commandIndex, distance };
		}
	};
	consider("inHandle", info.inHandle);
	consider("outHandle", info.outHandle);
	return best;
}

function nearestPathHit(store: CurveEditorPathStore, world: CurveCanvasPoint): CurveEditorPathHit | undefined {
	const handleHit = selectedPointHandleHit(store, world);
	if (handleHit !== undefined) return handleHit;

	let bestPoint: CurveEditorPathHit | undefined;
	for (const id of store.order) {
		const path = store.paths.get(id);
		if (path === undefined || !path.visible || path.locked) continue;
		for (const info of path.points) {
			const distance = math.sqrt(distanceSquared(world, info.point));
			if (distance <= PATH_HIT_RADIUS && (bestPoint === undefined || distance < bestPoint.distance)) {
				bestPoint = {
					segmentId: path.id,
					type: "point",
					pointIndex: info.index,
					commandIndex: info.commandIndex,
					distance,
				};
			}
		}
	}
	if (bestPoint !== undefined) return bestPoint;

	let bestSegment: CurveEditorPathHit | undefined;
	for (const id of store.order) {
		const path = store.paths.get(id);
		if (path === undefined || !path.visible || path.locked) continue;
		let currentPoint: CurveCanvasPoint | undefined;
		let subpathStart: CurveCanvasPoint | undefined;
		for (let commandIndex = 0; commandIndex < path.commands.size(); commandIndex++) {
			const command = path.commands[commandIndex];
			if (command.kind === "M") {
				currentPoint = command.point;
				subpathStart = command.point;
				continue;
			}
			if (currentPoint === undefined) continue;

			let hit: { distance: number; t: number } | undefined;
			if (command.kind === "L") {
				hit = nearestPointOnLine(world, currentPoint, command.point);
			} else if (command.kind === "Q") {
				const start = currentPoint;
				hit = nearestSampledCurvePoint(world, (t) => quadraticPoint(t, start, command.control, command.point));
			} else if (command.kind === "C") {
				const start = currentPoint;
				hit = nearestSampledCurvePoint(world, (t) =>
					cubicPoint(t, start, command.control1, command.control2, command.point),
				);
			} else if (command.kind === "Z" && subpathStart !== undefined) {
				hit = nearestPointOnLine(world, currentPoint, subpathStart);
			}

			if (hit !== undefined && hit.distance <= PATH_HIT_RADIUS) {
				if (bestSegment === undefined || hit.distance < bestSegment.distance) {
					bestSegment = {
						segmentId: path.id,
						type: "segment",
						commandIndex,
						t: hit.t,
						distance: hit.distance,
					};
				}
			}

			const nextPoint = commandPoint(command);
			if (nextPoint !== undefined) currentPoint = nextPoint;
			else if (command.kind === "Z" && subpathStart !== undefined) currentPoint = subpathStart;
		}
	}
	return bestSegment;
}

function previousDrawablePoint(path: StoredCurvePath, commandIndex: number): CurveCanvasPoint | undefined {
	let currentPoint: CurveCanvasPoint | undefined;
	let subpathStart: CurveCanvasPoint | undefined;
	for (let i = 0; i < commandIndex; i++) {
		const command = path.commands[i];
		if (command.kind === "M") {
			currentPoint = command.point;
			subpathStart = command.point;
		} else if (command.kind === "Z" && subpathStart !== undefined) {
			currentPoint = subpathStart;
		} else {
			const nextPoint = commandPoint(command);
			if (nextPoint !== undefined) currentPoint = nextPoint;
		}
	}
	return currentPoint;
}

function subpathStartBefore(path: StoredCurvePath, commandIndex: number): CurveCanvasPoint | undefined {
	let subpathStart: CurveCanvasPoint | undefined;
	for (let i = 0; i < commandIndex; i++) {
		const command = path.commands[i];
		if (command.kind === "M") subpathStart = command.point;
	}
	return subpathStart;
}

function pointIndexForCommand(path: StoredCurvePath, commandIndex: number): number | undefined {
	for (const info of path.points) {
		if (info.commandIndex === commandIndex) return info.index;
	}
	return undefined;
}

function insertPointOnPath(path: StoredCurvePath, commandIndex: number, t: number): number | undefined {
	const command = path.commands[commandIndex];
	if (command === undefined || command.kind === "M") return undefined;
	const start = previousDrawablePoint(path, commandIndex);
	if (start === undefined) return undefined;
	const splitT = math.clamp(t, 0, 1);
	let insertedCommand: CurvePathCommand | undefined;
	let followingCommand: CurvePathCommand | undefined;

	if (command.kind === "L") {
		const splitPoint = lerpCanvasPoint(start, command.point, splitT);
		insertedCommand = { kind: "L", point: splitPoint };
		followingCommand = { kind: "L", point: cloneCanvasPoint(command.point)! };
	} else if (command.kind === "Q") {
		const p01 = lerpCanvasPoint(start, command.control, splitT);
		const p12 = lerpCanvasPoint(command.control, command.point, splitT);
		const p012 = lerpCanvasPoint(p01, p12, splitT);
		insertedCommand = { kind: "Q", control: p01, point: p012 };
		followingCommand = { kind: "Q", control: p12, point: cloneCanvasPoint(command.point)! };
	} else if (command.kind === "C") {
		const p01 = lerpCanvasPoint(start, command.control1, splitT);
		const p12 = lerpCanvasPoint(command.control1, command.control2, splitT);
		const p23 = lerpCanvasPoint(command.control2, command.point, splitT);
		const p012 = lerpCanvasPoint(p01, p12, splitT);
		const p123 = lerpCanvasPoint(p12, p23, splitT);
		const p0123 = lerpCanvasPoint(p012, p123, splitT);
		insertedCommand = { kind: "C", control1: p01, control2: p012, point: p0123 };
		followingCommand = { kind: "C", control1: p123, control2: p23, point: cloneCanvasPoint(command.point)! };
	} else if (command.kind === "Z") {
		const subpathStart = subpathStartBefore(path, commandIndex);
		if (subpathStart === undefined) return undefined;
		insertedCommand = { kind: "L", point: lerpCanvasPoint(start, subpathStart, splitT) };
		followingCommand = { kind: "Z" };
	}

	if (insertedCommand === undefined || followingCommand === undefined) return undefined;
	path.commands[commandIndex] = insertedCommand;
	path.commands.insert(commandIndex + 1, followingCommand);
	commitPathCommands(path);
	return pointIndexForCommand(path, commandIndex);
}

function moveSelectedPoint(path: StoredCurvePath, pointIndex: number, nextPoint: CurveCanvasPoint): boolean {
	const info = getPointInfo(path, pointIndex);
	if (info === undefined) return false;
	const command = path.commands[info.commandIndex];
	if (!commandHasPoint(command)) return false;
	const previousPoint = cloneCanvasPoint(command.point)!;
	if (pointEquals(previousPoint, nextPoint)) return false;
	const delta = subCanvasPoints(nextPoint, previousPoint);

	if (command.kind === "Q") command.control = addCanvasPoints(command.control, delta);
	else if (command.kind === "C") command.control2 = addCanvasPoints(command.control2, delta);
	command.point = nextPoint;

	const nextCommand = path.commands[info.commandIndex + 1];
	if (nextCommand?.kind === "Q") nextCommand.control = addCanvasPoints(nextCommand.control, delta);
	else if (nextCommand?.kind === "C") nextCommand.control1 = addCanvasPoints(nextCommand.control1, delta);

	commitPathCommands(path);
	return true;
}

function moveSelectedHandle(
	path: StoredCurvePath,
	pointIndex: number,
	kind: "inHandle" | "outHandle",
	nextPoint: CurveCanvasPoint,
): boolean {
	const info = getPointInfo(path, pointIndex);
	if (info === undefined) return false;
	if (kind === "inHandle") {
		const command = path.commands[info.commandIndex];
		if (command.kind === "Q") {
			if (pointEquals(command.control, nextPoint)) return false;
			command.control = nextPoint;
		} else if (command.kind === "C") {
			if (pointEquals(command.control2, nextPoint)) return false;
			command.control2 = nextPoint;
		} else {
			return false;
		}
	} else {
		const nextCommand = path.commands[info.commandIndex + 1];
		if (nextCommand?.kind === "Q") {
			if (pointEquals(nextCommand.control, nextPoint)) return false;
			nextCommand.control = nextPoint;
		} else if (nextCommand?.kind === "C") {
			if (pointEquals(nextCommand.control1, nextPoint)) return false;
			nextCommand.control1 = nextPoint;
		} else {
			return false;
		}
	}
	commitPathCommands(path);
	return true;
}

function deletePointFromPath(path: StoredCurvePath, pointIndex: number): boolean {
	if (path.points.size() <= 2) return false;
	const info = getPointInfo(path, pointIndex);
	if (info === undefined) return false;

	if (info.commandIndex === 0) {
		const nextInfo = path.points[1];
		if (nextInfo === undefined) return false;
		const nextCommand = path.commands[nextInfo.commandIndex];
		if (!commandHasPoint(nextCommand)) return false;
		path.commands.remove(0);
		path.commands.insert(0, { kind: "M", point: cloneCanvasPoint(nextCommand.point)! });
		path.commands.remove(nextInfo.commandIndex);
	} else {
		path.commands.remove(info.commandIndex);
	}

	if (path.commands[0]?.kind !== "M") {
		const firstPoint = commandPoint(path.commands[0]);
		if (firstPoint !== undefined) path.commands.insert(0, { kind: "M", point: cloneCanvasPoint(firstPoint)! });
	}
	commitPathCommands(path);
	return path.points.size() >= 2;
}

function deleteSelectedPathPoint(store: CurveEditorPathStore): boolean {
	const selection = store.selection;
	if (selection === undefined) return false;
	const path = store.paths.get(selection.segmentId);
	if (path === undefined || path.locked) return false;
	const deleted = deletePointFromPath(path, selection.pointIndex);
	if (deleted) {
		store.selection = undefined;
		commitPathCommands(path);
	}
	return deleted;
}

function canDeletePointFromPath(path: StoredCurvePath, pointIndex: number): boolean {
	if (path.points.size() <= 2) return false;
	const info = getPointInfo(path, pointIndex);
	if (info === undefined) return false;
	if (info.commandIndex === 0) {
		const nextInfo = path.points[1];
		if (nextInfo === undefined) return false;
		const nextCommand = path.commands[nextInfo.commandIndex];
		return commandHasPoint(nextCommand);
	}
	return true;
}

function closeContextMenu(refs: CurveEditorRefs): void {
	refs.contextMenu = undefined;
}

function contextMenuBounds(refs: CurveEditorRefs): { position: Vector2; size: Vector2 } | undefined {
	let current = refs.root.Parent;
	while (current !== undefined) {
		if (current.IsA("GuiObject")) {
			const guiObject = current as GuiObject;
			if (guiObject.AbsoluteSize.X > 0 && guiObject.AbsoluteSize.Y > 0) {
				return { position: guiObject.AbsolutePosition, size: guiObject.AbsoluteSize };
			}
		}
		current = current.Parent;
	}
	return undefined;
}

function clampPanelAxis(value: number, panelSize: number, boundsStart: number, boundsSize: number): number {
	const min = boundsStart + CONTEXT_PANEL_MARGIN;
	const max = boundsStart + boundsSize - panelSize - CONTEXT_PANEL_MARGIN;
	if (max < min) return value;
	return math.clamp(value, min, max);
}

function contextMenuPositionForClick(refs: CurveEditorRefs, clickPosition: Vector2): Vector2 {
	const anchor = clickPosition;
	const bounds = contextMenuBounds(refs);

	let x = anchor.X + CONTEXT_PANEL_GAP;
	let y = anchor.Y;
	if (bounds !== undefined) {
		const right = bounds.position.X + bounds.size.X;
		const canFitX = bounds.size.X >= CONTEXT_PANEL_WIDTH + CONTEXT_PANEL_MARGIN * 2;
		const canFitY = bounds.size.Y >= CONTEXT_PANEL_HEIGHT + CONTEXT_PANEL_MARGIN * 2;
		if (canFitX && x + CONTEXT_PANEL_WIDTH + CONTEXT_PANEL_MARGIN > right) x = anchor.X - CONTEXT_PANEL_WIDTH - CONTEXT_PANEL_GAP;
		if (canFitX) x = clampPanelAxis(x, CONTEXT_PANEL_WIDTH, bounds.position.X, bounds.size.X);
		if (canFitY) y = clampPanelAxis(y, CONTEXT_PANEL_HEIGHT, bounds.position.Y, bounds.size.Y);
	}

	return v2(x, y);
}

function openContextMenu(refs: CurveEditorRefs, hit: CurveEditorPathHit, clickPosition: Vector2): boolean {
	if (hit.pointIndex === undefined) return false;
	if (hit.type !== "point" && hit.type !== "inHandle" && hit.type !== "outHandle") return false;
	const store = refs.pathStore;
	const path = store?.paths.get(hit.segmentId);
	if (store === undefined || path === undefined || path.locked) return false;
	const info = getPointInfo(path, hit.pointIndex);
	if (info === undefined) return false;
	setSelection(refs, { segmentId: hit.segmentId, pointIndex: hit.pointIndex, kind: "point" });
	refs.contextMenu = { position: contextMenuPositionForClick(refs, clickPosition), segmentId: hit.segmentId, pointIndex: hit.pointIndex };
	return true;
}

function convertibleCommandKind(command: CurvePathCommand | undefined): CurveSegmentKind | undefined {
	if (command === undefined) return undefined;
	if (command.kind === "L" || command.kind === "Q" || command.kind === "C") return command.kind;
	return undefined;
}

function segmentKindLabel(kind: CurveSegmentKind | undefined): string {
	if (kind === "L") return "Line";
	if (kind === "Q") return "Quad";
	if (kind === "C") return "Cubic";
	return "Unknown";
}

function incomingCommandIndex(path: StoredCurvePath, pointIndex: number): number | undefined {
	const info = getPointInfo(path, pointIndex);
	if (info === undefined || info.commandKind === "M") return undefined;
	return convertibleCommandKind(path.commands[info.commandIndex]) !== undefined ? info.commandIndex : undefined;
}

function outgoingCommandIndex(path: StoredCurvePath, pointIndex: number): number | undefined {
	const info = getPointInfo(path, pointIndex);
	if (info === undefined) return undefined;
	const commandIndex = info.commandIndex + 1;
	return convertibleCommandKind(path.commands[commandIndex]) !== undefined ? commandIndex : undefined;
}

function popupPanelFromDescendant(instance: Instance): Frame | undefined {
	let current = instance.Parent;
	while (current !== undefined) {
		if (current.Name === "PopupPanel" && current.IsA("Frame")) return current as Frame;
		current = current.Parent;
	}
	return undefined;
}

function setContextMenuPosition(refs: CurveEditorRefs, position: Vector2, panel?: Frame): void {
	if (refs.contextMenu !== undefined) refs.contextMenu.position = position;
	if (panel !== undefined) panel.Position = udim2(0, position.X, 0, position.Y);
}

function stopContextHeaderDrag(
	headerRefs: CurveEditorContextHeaderRefs,
	editorRefs: CurveEditorRefs,
	pointerDrag: { begin(): void; end(): void },
): void {
	headerRefs.inputChangedConnection?.Disconnect();
	headerRefs.inputEndedConnection?.Disconnect();
	headerRefs.inputChangedConnection = undefined;
	headerRefs.inputEndedConnection = undefined;
	headerRefs.dragStartPosition = undefined;
	headerRefs.dragStartMenuPosition = undefined;
	endPointerDrag(editorRefs);
}

const curveEditorContextHeader = widget((editorRefs: CurveEditorRefs, text: string): void => {
	const inputService = useInputService();
	const pointerDrag = usePointerDrag();

	const headerRefs = __useInstance("curveEditorContextHeader:instance", (rawRef) => {
		const ref = rawRef as unknown as CurveEditorContextHeaderRefs;
		const style = useStyle();

		const updateDrag = (inputObject: InputObject): void => {
			if (inputObject.UserInputType !== Enum.UserInputType.MouseMovement) return;
			const dragStart = ref.dragStartPosition;
			const menuStart = ref.dragStartMenuPosition;
			if (dragStart === undefined || menuStart === undefined) return;
			const current = inputPosition(inputObject);
			setContextMenuPosition(
				editorRefs,
				v2(menuStart.X + current.X - dragStart.X, menuStart.Y + current.Y - dragStart.Y),
				popupPanelFromDescendant(ref.header),
			);
		};

		const finishDrag = (inputObject: InputObject): void => {
			if (inputObject.UserInputType !== Enum.UserInputType.MouseButton1) return;
			stopContextHeaderDrag(ref, editorRefs, pointerDrag);
		};

		const beginDrag = (inputObject: InputObject): void => {
			if (inputObject.UserInputType !== Enum.UserInputType.MouseButton1) return;
			if (!isTopGuiTarget(ref.header, inputObject, undefined, inputService)) return;
			const menu = editorRefs.contextMenu;
			if (menu === undefined) return;
			stopContextHeaderDrag(ref, editorRefs, pointerDrag);
			ref.dragStartPosition = inputPosition(inputObject);
			ref.dragStartMenuPosition = menu.position;
			beginPointerDrag(editorRefs, pointerDrag);
			if (inputService !== undefined) {
				ref.inputChangedConnection = inputService.InputChanged.Connect((changedInput) => updateDrag(changedInput));
				ref.inputEndedConnection = inputService.InputEnded.Connect((endedInput) => finishDrag(endedInput));
			}
		};

		const header = create("TextButton", {
			[rawRef as never]: "header",
			Name: "CurveEditorContextHeader",
			BackgroundColor3: style.titleBgColor,
			BackgroundTransparency: 0,
			BorderSizePixel: 0,
			Font: Enum.Font.Code,
			Text: text,
			TextColor3: style.strongTextColor,
			TextSize: style.textSize,
			TextXAlignment: Enum.TextXAlignment.Left,
			AutoButtonColor: false,
			Size: udim2(1, 0, 0, 18),
			Active: true,
			ZIndex: 202,
			InputBegan: (...args: ReadonlyArray<unknown>) => beginDrag(args[0] as InputObject),
			InputChanged: (...args: ReadonlyArray<unknown>) => updateDrag(args[0] as InputObject),
			InputEnded: (...args: ReadonlyArray<unknown>) => finishDrag(args[0] as InputObject),
			0: create("UIPadding", {
				PaddingLeft: udim(0, 6),
				PaddingRight: udim(0, 6),
			}),
		});
		return header;
	}) as unknown as CurveEditorContextHeaderRefs;

	__useEffect("curveEditorContextHeader:cleanup", () => {
		return () => stopContextHeaderDrag(headerRefs, editorRefs, pointerDrag);
	});

	const style = useStyle();
	headerRefs.header.Text = text;
	headerRefs.header.BackgroundColor3 = style.titleBgColor;
	headerRefs.header.TextColor3 = style.strongTextColor;
	headerRefs.header.TextSize = style.textSize;
}, "@rovy/ui/curveEditorContextHeader");

function renderSegmentKindButtons(refs: CurveEditorRefs, path: StoredCurvePath, commandIndex: number): void {
	const command = path.commands[commandIndex];
	const currentKind = convertibleCommandKind(command);
	row({ padding: 3 }, () => {
		const line = button("Line", { width: 44, disabled: currentKind === "L" });
		const quad = button("Quad", { width: 44, disabled: currentKind === "Q" });
		const cubic = button("Cubic", { width: 50, disabled: currentKind === "C" });
		if (line.clicked() && convertPathCommand(path, commandIndex, "L")) markPathEdited(refs);
		if (quad.clicked() && convertPathCommand(path, commandIndex, "Q")) markPathEdited(refs);
		if (cubic.clicked() && convertPathCommand(path, commandIndex, "C")) markPathEdited(refs);
	});
}

function renderCurvePointContextPanel(refs: CurveEditorRefs): void {
	const menu = refs.contextMenu;
	const store = refs.pathStore;
	const path = menu !== undefined ? store?.paths.get(menu.segmentId) : undefined;
	const info = path !== undefined && menu !== undefined ? getPointInfo(path, menu.pointIndex) : undefined;
	const open = menu !== undefined && store !== undefined && path !== undefined && info !== undefined && !path.locked;

	popup({ open, position: menu?.position, width: CONTEXT_PANEL_WIDTH, minWidth: CONTEXT_PANEL_WIDTH }, () => {
		if (store === undefined || path === undefined || info === undefined || menu === undefined) return;
		curveEditorContextHeader(refs, `Point ${info.index}`);

		const deleteDisabled = !canDeletePointFromPath(path, info.index);
		if (button("Delete Point", { disabled: deleteDisabled }).clicked()) {
			store.selection = { segmentId: path.id, pointIndex: info.index, kind: "point" };
			if (deleteSelectedPathPoint(store)) markPathEdited(refs);
			closeContextMenu(refs);
		}

		const incoming = incomingCommandIndex(path, info.index);
		if (incoming !== undefined) {
			label(`In: ${segmentKindLabel(convertibleCommandKind(path.commands[incoming]))}`);
			renderSegmentKindButtons(refs, path, incoming);
		}

		const outgoing = outgoingCommandIndex(path, info.index);
		if (outgoing !== undefined) {
			label(`Out: ${segmentKindLabel(convertibleCommandKind(path.commands[outgoing]))}`);
			renderSegmentKindButtons(refs, path, outgoing);
		}
	});

	if (!open && menu !== undefined) closeContextMenu(refs);
}

function isDeleteSelectedInput(inputObject: InputObject): boolean {
	return (
		inputObject.UserInputType === Enum.UserInputType.Keyboard &&
		(inputObject.KeyCode === Enum.KeyCode.Backspace || inputObject.KeyCode === Enum.KeyCode.Delete)
	);
}

function handleDeleteSelectedInput(
	refs: CurveEditorRefs,
	inputObject: InputObject,
	gameProcessedEvent: boolean,
): boolean {
	if (gameProcessedEvent || !isDeleteSelectedInput(inputObject)) return false;
	const store = refs.pathStore;
	if (store === undefined) return true;
	const deleted = deleteSelectedPathPoint(store);
	if (deleted) markPathEdited(refs);
	return true;
}

function vectorDistance(left: Vector2, right: Vector2): number {
	const dx = left.X - right.X;
	const dy = left.Y - right.Y;
	return math.sqrt(dx * dx + dy * dy);
}

function defaultViewportOffset(size: Vector2): Vector2 {
	return v2(math.floor(size.X / 2), math.floor(size.Y / 2));
}

function readoutReserveHeight(style: Style, showReadout: boolean): number {
	return showReadout ? style.itemHeight + style.itemSpacing.Y : 0;
}

function canvasSizeFromOptions(width: number | undefined, height: number | undefined): Vector2 {
	return sanitizeCanvasSize(v2(width ?? DEFAULT_WIDTH, height ?? DEFAULT_HEIGHT));
}

function sanitizeCanvasSize(size: Vector2): Vector2 {
	return v2(
		math.clamp(math.floor(size.X), 1, MAX_EDITABLE_IMAGE_SIZE),
		math.clamp(math.floor(size.Y), 1, MAX_EDITABLE_IMAGE_SIZE),
	);
}

function sameCanvasSize(left: Vector2 | undefined, right: Vector2): boolean {
	if (left === undefined) return false;
	return left.X === right.X && left.Y === right.Y;
}

function resolveCanvasSize(
	refs: CurveEditorRefs,
	fixedWidth: number | undefined,
	fixedHeight: number | undefined,
	fallback: Vector2,
): Vector2 {
	const absolute = refs.graph?.AbsoluteSize;
	const measuredWidth = absolute !== undefined && absolute.X > 0 ? absolute.X : refs.size?.X ?? fallback.X;
	const measuredHeight = absolute !== undefined && absolute.Y > 0 ? absolute.Y : refs.size?.Y ?? fallback.Y;
	return sanitizeCanvasSize(v2(fixedWidth ?? measuredWidth, fixedHeight ?? measuredHeight));
}

function rootSize(
	fixedWidth: number | undefined,
	fixedHeight: number | undefined,
	showReadout: boolean,
	style: Style,
): UDim2 {
	const reserve = readoutReserveHeight(style, showReadout);
	return udim2(
		fixedWidth === undefined ? 1 : 0,
		fixedWidth ?? 0,
		fixedHeight === undefined ? 1 : 0,
		fixedHeight !== undefined ? fixedHeight + reserve : 0,
	);
}

function graphSize(
	fixedWidth: number | undefined,
	fixedHeight: number | undefined,
	showReadout: boolean,
	style: Style,
): UDim2 {
	const reserve = readoutReserveHeight(style, showReadout);
	return udim2(
		fixedWidth === undefined ? 1 : 0,
		fixedWidth ?? 0,
		fixedHeight === undefined ? 1 : 0,
		fixedHeight !== undefined ? fixedHeight : -reserve,
	);
}

function inputPosition(inputObject: InputObject): Vector2 {
	return v2(inputObject.Position.X, inputObject.Position.Y);
}

function firstGridLine(offset: number, step: number): number {
	return math.floor(-offset / step) * step;
}

function drawCurvePathSegment(
	buffer: EditableImageBuffer,
	viewportOffset: Vector2,
	from: CurveCanvasPoint,
	to: CurveCanvasPoint,
	color: Color3,
	alpha: number,
	thickness: number,
): void {
	buffer.drawLine(worldToScreen(from, viewportOffset), worldToScreen(to, viewportOffset), color, { alpha, thickness });
}

function drawSampledCurve(
	buffer: EditableImageBuffer,
	viewportOffset: Vector2,
	pointAt: (t: number) => CurveCanvasPoint,
	color: Color3,
	alpha: number,
	thickness: number,
): void {
	let previous = pointAt(0);
	for (let i = 1; i <= PATH_CURVE_SAMPLES; i++) {
		const current = pointAt(i / PATH_CURVE_SAMPLES);
		drawCurvePathSegment(buffer, viewportOffset, previous, current, color, alpha, thickness);
		previous = current;
	}
}

function drawStoredPath(buffer: EditableImageBuffer, viewportOffset: Vector2, path: StoredCurvePath): void {
	if (!path.visible) return;
	const color = path.color ?? c(96, 165, 250);
	const alpha = path.locked ? 150 : 255;
	const thickness = math.max(1, path.thickness ?? 2);
	let currentPoint: CurveCanvasPoint | undefined;
	let subpathStart: CurveCanvasPoint | undefined;

	for (const command of path.commands) {
		if (command.kind === "M") {
			currentPoint = command.point;
			subpathStart = command.point;
			continue;
		}
		if (currentPoint === undefined) continue;
		if (command.kind === "L") {
			drawCurvePathSegment(buffer, viewportOffset, currentPoint, command.point, color, alpha, thickness);
			currentPoint = command.point;
		} else if (command.kind === "Q") {
			const start = currentPoint;
			drawSampledCurve(
				buffer,
				viewportOffset,
				(t) => quadraticPoint(t, start, command.control, command.point),
				color,
				alpha,
				thickness,
			);
			currentPoint = command.point;
		} else if (command.kind === "C") {
			const start = currentPoint;
			drawSampledCurve(
				buffer,
				viewportOffset,
				(t) => cubicPoint(t, start, command.control1, command.control2, command.point),
				color,
				alpha,
				thickness,
			);
			currentPoint = command.point;
		} else if (command.kind === "Z" && subpathStart !== undefined) {
			drawCurvePathSegment(buffer, viewportOffset, currentPoint, subpathStart, color, alpha, thickness);
			currentPoint = subpathStart;
		}
	}

	for (const info of path.points) {
		buffer.drawCircle(worldToScreen(info.point, viewportOffset), PATH_POINT_RADIUS, c(226, 232, 240), {
			alpha: path.locked ? 120 : 220,
			fill: true,
		});
	}
}

function drawSelectedPathAffordances(
	buffer: EditableImageBuffer,
	viewportOffset: Vector2,
	store: CurveEditorPathStore | undefined,
): void {
	const selection = store?.selection;
	if (selection === undefined || store === undefined) return;
	const path = store.paths.get(selection.segmentId);
	if (path === undefined || !path.visible) return;
	const info = getPointInfo(path, selection.pointIndex);
	if (info === undefined) return;
	const anchor = worldToScreen(info.point, viewportOffset);
	const handleColor = c(250, 204, 21);
	const selectedColor = c(248, 250, 252);

	const drawHandle = (handle: CurveCanvasPoint | undefined): void => {
		if (handle === undefined) return;
		const screenHandle = worldToScreen(handle, viewportOffset);
		buffer.drawLine(anchor, screenHandle, handleColor, { alpha: 220, thickness: 1 });
		buffer.drawCircle(screenHandle, PATH_HANDLE_RADIUS, handleColor, { alpha: 255, fill: true });
	};

	drawHandle(info.inHandle);
	drawHandle(info.outHandle);
	buffer.drawCircle(anchor, PATH_POINT_RADIUS + 2, selectedColor, { alpha: 255, fill: false, thickness: 2 });
}

function drawInfiniteCanvas(
	buffer: EditableImageBuffer,
	viewportOffset: Vector2,
	pathStore: CurveEditorPathStore | undefined,
): void {
	const size = buffer.size;
	buffer.clear(9, 12, 18, 255);

	const minor = c(28, 37, 52);
	const major = c(47, 62, 84);
	const axis = c(116, 139, 171);

	const firstWorldX = firstGridLine(viewportOffset.X, GRID_MINOR_STEP);
	for (let worldX = firstWorldX; worldX <= size.X - viewportOffset.X; worldX += GRID_MINOR_STEP) {
		const screenX = viewportOffset.X + worldX;
		const lineIndex = math.floor(worldX / GRID_MINOR_STEP);
		const isMajor = lineIndex % GRID_MAJOR_EVERY === 0;
		buffer.drawLine(v2(screenX, 0), v2(screenX, size.Y), isMajor ? major : minor, {
			alpha: isMajor ? 210 : 135,
			thickness: isMajor ? 2 : 1,
		});
	}

	const firstWorldY = firstGridLine(viewportOffset.Y, GRID_MINOR_STEP);
	for (let worldY = firstWorldY; worldY <= size.Y - viewportOffset.Y; worldY += GRID_MINOR_STEP) {
		const screenY = viewportOffset.Y + worldY;
		const lineIndex = math.floor(worldY / GRID_MINOR_STEP);
		const isMajor = lineIndex % GRID_MAJOR_EVERY === 0;
		buffer.drawLine(v2(0, screenY), v2(size.X, screenY), isMajor ? major : minor, {
			alpha: isMajor ? 210 : 135,
			thickness: isMajor ? 2 : 1,
		});
	}

	if (viewportOffset.X >= 0 && viewportOffset.X <= size.X) {
		buffer.drawLine(v2(viewportOffset.X, 0), v2(viewportOffset.X, size.Y), axis, { alpha: 240, thickness: 2 });
	}
	if (viewportOffset.Y >= 0 && viewportOffset.Y <= size.Y) {
		buffer.drawLine(v2(0, viewportOffset.Y), v2(size.X, viewportOffset.Y), axis, { alpha: 240, thickness: 2 });
	}
	buffer.drawCircle(viewportOffset, 3, c(226, 232, 240), { alpha: 255, fill: true });

	if (pathStore !== undefined) {
		for (const id of pathStore.order) {
			const path = pathStore.paths.get(id);
			if (path !== undefined) drawStoredPath(buffer, viewportOffset, path);
		}
		drawSelectedPathAffordances(buffer, viewportOffset, pathStore);
	}
}

function createEditableImageForGraph(refs: CurveEditorRefs, size: Vector2): void {
	const [serviceOk, serviceOrError] = pcall(() => game.GetService("AssetService"));
	if (!serviceOk) {
		refs.errorLabel.Text = `[rovy-ui] curveEditor AssetService unavailable: ${tostring(serviceOrError)}`;
		refs.errorLabel.Visible = true;
		refs.imageLabel.Visible = false;
		refs.imageCreateFailedSize = size;
		return;
	}

	const assetService = serviceOrError as AssetService;
	const [imageOk, imageOrError] = pcall(() => assetService.CreateEditableImage({ Size: size }));
	if (!imageOk) {
		refs.errorLabel.Text = `[rovy-ui] curveEditor image create failed: ${tostring(imageOrError)}`;
		refs.errorLabel.Visible = true;
		refs.imageLabel.Visible = false;
		refs.imageCreateFailedSize = size;
		return;
	}

	refs.editableImage = imageOrError as EditableImage;
	refs.imageCreateFailedSize = undefined;
	const [contentOk, contentError] = pcall(() => {
		refs.imageLabel.ImageContent = Content.fromObject(refs.editableImage as RBXObject);
	});
	if (!contentOk) {
		refs.errorLabel.Text = `[rovy-ui] curveEditor image display failed: ${tostring(contentError)}`;
		refs.errorLabel.Visible = true;
		refs.imageLabel.Visible = false;
		return;
	}

	refs.errorLabel.Visible = false;
	refs.imageLabel.Visible = true;
}

function replaceCanvasImage(refs: CurveEditorRefs, size: Vector2): void {
	const nextSize = sanitizeCanvasSize(size);
	if (
		sameCanvasSize(refs.size, nextSize) &&
		refs.buffer !== undefined &&
		(refs.editableImage !== undefined || sameCanvasSize(refs.imageCreateFailedSize, nextSize))
	) {
		return;
	}

	refs.editableImage?.Destroy();
	refs.editableImage = undefined;
	refs.imageCreateFailedSize = undefined;
	refs.size = nextSize;
	refs.buffer = new EditableImageBuffer(nextSize);
	refs.canvasDirty = true;
	createEditableImageForGraph(refs, nextSize);
}

function redrawIfNeeded(refs: CurveEditorRefs): void {
	if (refs.canvasDirty !== true) return;
	refs.canvasDirty = false;
	if (refs.buffer === undefined || refs.editableImage === undefined) return;
	drawInfiniteCanvas(refs.buffer, refs.viewportOffset ?? defaultViewportOffset(refs.buffer.size), refs.pathStore);
	const [ok, err] = pcall(() => refs.editableImage!.WritePixelsBuffer(v2(0, 0), refs.buffer!.size, refs.buffer!.getBuffer()));
	if (!ok) {
		refs.errorLabel.Text = `[rovy-ui] curveEditor draw failed: ${tostring(err)}`;
		refs.errorLabel.Visible = true;
	}
}

function commitViewportOffset(refs: CurveEditorRefs, offset: Vector2): void {
	const current = refs.viewportOffset ?? defaultViewportOffset(refs.size ?? offset);
	if (current.X === offset.X && current.Y === offset.Y) return;
	refs.viewportOffset = offset;
	refs.canvasDirty = true;
	refs.setViewportOffset?.(offset);
	refs.setChanged?.(true);
	redrawIfNeeded(refs);
}

function returnViewportToOrigin(refs: CurveEditorRefs, fallbackSize: Vector2): void {
	const offset = defaultViewportOffset(refs.size ?? fallbackSize);
	const current = refs.viewportOffset ?? defaultViewportOffset(refs.size ?? fallbackSize);
	refs.panLastPosition = undefined;
	refs.activeDrag = undefined;
	endPointerDrag(refs);
	refs.viewportOffset = offset;
	refs.canvasDirty = true;
	refs.setViewportOffset?.(offset);
	if (current.X !== offset.X || current.Y !== offset.Y) refs.setChanged?.(true);
	redrawIfNeeded(refs);
}

function beginPointerDrag(refs: CurveEditorRefs, pointerDrag: { begin(): void; end(): void }): void {
	if (refs.pointerDragging === true) return;
	refs.pointerDragging = true;
	pointerDrag.begin();
}

function endPointerDrag(refs: CurveEditorRefs): void {
	if (refs.pointerDragging !== true) return;
	refs.pointerDragging = false;
	refs.endPointerDrag?.();
}

function isDuplicateBegin(refs: CurveEditorRefs, inputObject: InputObject): boolean {
	const now = os.clock();
	const position = v2(inputObject.Position.X, inputObject.Position.Y);
	const previous = refs.lastBeginPosition;
	if (previous !== undefined && refs.lastBeginClock !== undefined && now - refs.lastBeginClock < 0.001) {
		if (vectorDistance(previous, position) <= 1) return true;
	}
	refs.lastBeginClock = now;
	refs.lastBeginPosition = position;
	return false;
}

function setSelection(refs: CurveEditorRefs, selection: CurveEditorSelection | undefined): void {
	const store = refs.pathStore;
	if (store === undefined) return;
	const previous = store.selection;
	if (
		previous?.segmentId === selection?.segmentId &&
		previous?.pointIndex === selection?.pointIndex &&
		previous?.kind === selection?.kind
	) {
		return;
	}
	store.selection = selection;
	refs.canvasDirty = true;
	redrawIfNeeded(refs);
}

function markPathEdited(refs: CurveEditorRefs): void {
	refs.canvasDirty = true;
	refs.setChanged?.(true);
	redrawIfNeeded(refs);
}

function beginPathDrag(
	refs: CurveEditorRefs,
	pointerDrag: { begin(): void; end(): void },
	selection: CurveEditorSelection,
): void {
	setSelection(refs, selection);
	refs.activeDrag = { kind: selection.kind, selection };
	beginPointerDrag(refs, pointerDrag);
}

function beginPathHitInteraction(
	refs: CurveEditorRefs,
	pointerDrag: { begin(): void; end(): void },
	hit: CurveEditorPathHit,
): boolean {
	const store = refs.pathStore;
	if (store === undefined) return false;
	const path = store.paths.get(hit.segmentId);
	if (path === undefined || path.locked) return false;

	if (hit.type === "point" && hit.pointIndex !== undefined) {
		beginPathDrag(refs, pointerDrag, { segmentId: hit.segmentId, pointIndex: hit.pointIndex, kind: "point" });
		return true;
	}
	if ((hit.type === "inHandle" || hit.type === "outHandle") && hit.pointIndex !== undefined) {
		beginPathDrag(refs, pointerDrag, { segmentId: hit.segmentId, pointIndex: hit.pointIndex, kind: hit.type });
		return true;
	}
	if (hit.type === "segment" && hit.commandIndex !== undefined) {
		const pointIndex = insertPointOnPath(path, hit.commandIndex, hit.t ?? 0.5);
		if (pointIndex === undefined) return false;
		const selection = { segmentId: hit.segmentId, pointIndex, kind: "point" as const };
		beginPathDrag(refs, pointerDrag, selection);
		markPathEdited(refs);
		return true;
	}

	return false;
}

function continuePathDrag(refs: CurveEditorRefs, inputObject: InputObject, fallbackSize: Vector2): boolean {
	const drag = refs.activeDrag;
	const selection = drag?.selection;
	const store = refs.pathStore;
	if (drag === undefined || selection === undefined || store === undefined) return false;
	if (inputObject.UserInputType !== Enum.UserInputType.MouseMovement) return false;

	const path = store.paths.get(selection.segmentId);
	if (path === undefined || path.locked) return false;
	const world = screenToWorld(refs, inputObject, fallbackSize);
	let edited = false;
	if (drag.kind === "point") edited = moveSelectedPoint(path, selection.pointIndex, world);
	else if (drag.kind === "inHandle" || drag.kind === "outHandle") {
		edited = moveSelectedHandle(path, selection.pointIndex, drag.kind, world);
	}
	if (edited) markPathEdited(refs);
	return true;
}

function finishCanvasInteraction(refs: CurveEditorRefs, inputObject: InputObject): void {
	if (inputObject.UserInputType !== Enum.UserInputType.MouseButton1) return;
	refs.panLastPosition = undefined;
	refs.activeDrag = undefined;
	endPointerDrag(refs);
}

/** @widget */
const curveEditorWidget = widget((options: CurveEditorOptions = {}, children?: () => void): CurveEditorHandle => {
	const fixedWidth = options.width !== undefined ? math.floor(options.width) : undefined;
	const fixedHeight = options.height !== undefined ? math.floor(options.height) : undefined;
	const imageSize = canvasSizeFromOptions(fixedWidth, fixedHeight);
	const sampleCount = options.sampleCount ?? DEFAULT_SAMPLE_COUNT;
	const showReadout = options.showReadout ?? true;

	const [curve] = __useState("curveEditor:curve", () => normalizeCurve(options.initialCurve));
	const [changed, setChanged] = __useState("curveEditor:changed", false);
	const [viewportOffset, setViewportOffset] = __useState<Vector2 | undefined>("curveEditor:viewportOffset", undefined);
	const [selectedPreset] = __useState<string | undefined>("curveEditor:selectedPreset", "Line");
	const [userPresets] = __useState<CurvePreset[]>("curveEditor:userPresets", []);
	const [pathStore] = __useState("curveEditor:pathStore", createPathStore);

	const inputService = useInputService();
	const pointerDrag = usePointerDrag();

	const refs = __useInstance("curveEditor:instance", (rawRef) => {
			const ref = rawRef as unknown as CurveEditorRefs;
			const style = useStyle();
			const connectEvent = createConnect();

			ref.size = imageSize;
			ref.buffer = new EditableImageBuffer(imageSize);
			ref.canvasDirty = true;
			ref.pathStore = pathStore;
			ref.allowScroll = options.allowScroll ?? true;
			ref.inputBeganConnection = undefined;
			ref.inputChangedConnection = undefined;
			ref.inputEndedConnection = undefined;
			ref.pointerDragging = false;
			ref.endPointerDrag = pointerDrag.end;

			const acceptsCanvasInput = (inputObject: InputObject, requirePointInside: boolean): boolean => {
				if (requirePointInside && !pointInsideGuiObject(ref.overlay, inputObject)) return false;
				return isTopGuiTarget(ref.overlay, inputObject, undefined, inputService);
			};

			const beginCanvasInteraction = (inputObject: InputObject, requirePointInside = false): void => {
				if (inputObject.UserInputType !== Enum.UserInputType.MouseButton1) return;
				if (requirePointInside && !pointInsideGuiObject(ref.overlay, inputObject)) return;
				if (isDuplicateBegin(ref, inputObject)) return;
				if (!acceptsCanvasInput(inputObject, requirePointInside)) return;
				closeContextMenu(ref);

				const store = ref.pathStore;
				if (store !== undefined) {
					const hit = nearestPathHit(store, screenToWorld(ref, inputObject, imageSize));
					if (hit !== undefined && beginPathHitInteraction(ref, pointerDrag, hit)) return;
				}

				setSelection(ref, undefined);
				if (ref.allowScroll === false) return;
				ref.panLastPosition = inputPosition(inputObject);
				ref.activeDrag = { kind: "pan" };
				beginPointerDrag(ref, pointerDrag);
			};

			const beginContextMenuInteraction = (inputObject: InputObject, requirePointInside = false): boolean => {
				if (inputObject.UserInputType !== Enum.UserInputType.MouseButton2) return false;
				if (requirePointInside && !pointInsideGuiObject(ref.overlay, inputObject)) return false;
				if (isDuplicateBegin(ref, inputObject)) return true;
				if (!acceptsCanvasInput(inputObject, requirePointInside)) return true;

				ref.panLastPosition = undefined;
				ref.activeDrag = undefined;
				endPointerDrag(ref);

				const store = ref.pathStore;
				if (store !== undefined) {
					const hit = nearestPathHit(store, screenToWorld(ref, inputObject, imageSize));
					if (hit !== undefined && openContextMenu(ref, hit, inputPosition(inputObject))) return true;
				}

				closeContextMenu(ref);
				return true;
			};

			const continuePanOrScroll = (inputObject: InputObject): void => {
				if (inputObject.UserInputType === Enum.UserInputType.MouseWheel) {
					ref.panLastPosition = undefined;
					ref.activeDrag = undefined;
					endPointerDrag(ref);
					return;
				}

				if (inputObject.UserInputType === Enum.UserInputType.MouseMovement) {
					if (continuePathDrag(ref, inputObject, imageSize)) return;
					const previous = ref.pointerDragging === true && ref.activeDrag?.kind === "pan" ? ref.panLastPosition : undefined;
					if (previous === undefined) return;
					const current = inputPosition(inputObject);
					ref.panLastPosition = current;
					const offset = ref.viewportOffset ?? defaultViewportOffset(ref.size ?? imageSize);
					commitViewportOffset(ref, v2(offset.X + current.X - previous.X, offset.Y + current.Y - previous.Y));
					return;
				}
			};

			const root = create("Frame", {
				[rawRef as never]: "root",
				BackgroundTransparency: 1,
				Size: rootSize(fixedWidth, fixedHeight, showReadout, style),
				0: create("UIListLayout", {
					SortOrder: Enum.SortOrder.LayoutOrder,
					Padding: udim(0, style.itemSpacing.Y),
				}),
				1: create("Frame", {
					[rawRef as never]: "graph",
					Name: "CurveEditorCanvas",
					BackgroundColor3: style.frameBgColor,
					BackgroundTransparency: 0,
					BorderSizePixel: 0,
					Size: graphSize(fixedWidth, fixedHeight, showReadout, style),
					ClipsDescendants: true,
					LayoutOrder: 1,
					0: create("UICorner", { CornerRadius: udim(0, style.cornerRadius) }),
					1: create("ImageLabel", {
						[rawRef as never]: "imageLabel",
						Name: "CurveEditorImage",
						BackgroundTransparency: 1,
						BorderSizePixel: 0,
						ScaleType: Enum.ScaleType.Stretch,
						Size: udim2(1, 0, 1, 0),
					}),
					2: create("TextLabel", {
						[rawRef as never]: "errorLabel",
						Name: "CurveEditorError",
						BackgroundTransparency: 1,
						Font: Enum.Font.Code,
						Text: "",
						TextColor3: style.strongTextColor,
						TextSize: style.textSize,
						TextWrapped: true,
						Size: udim2(1, 0, 1, 0),
						Visible: false,
					}),
					3: create("TextButton", {
						[rawRef as never]: "overlay",
						Name: "CurveEditorInput",
						BackgroundTransparency: 1,
						Text: "",
						AutoButtonColor: false,
						Size: udim2(1, 0, 1, 0),
						Active: true,
						ZIndex: 5,
						InputBegan: (...args: ReadonlyArray<unknown>) => {
							const inputObject = args[0] as InputObject;
							if (handleDeleteSelectedInput(ref, inputObject, false)) return;
							if (beginContextMenuInteraction(inputObject)) return;
							beginCanvasInteraction(inputObject);
						},
						InputChanged: (...args: ReadonlyArray<unknown>) => continuePanOrScroll(args[0] as InputObject),
						InputEnded: (...args: ReadonlyArray<unknown>) => finishCanvasInteraction(ref, args[0] as InputObject),
					}),
				}),
			});

			createEditableImageForGraph(ref, imageSize);

			if (inputService !== undefined) {
				ref.inputBeganConnection = connectEvent(inputService, "InputBegan", (...args: ReadonlyArray<unknown>) => {
					const inputObject = args[0] as InputObject;
					if (handleDeleteSelectedInput(ref, inputObject, args[1] === true)) return;
					if (beginContextMenuInteraction(inputObject, true)) return;
					beginCanvasInteraction(inputObject, true);
				});
				ref.inputChangedConnection = connectEvent(inputService, "InputChanged", (...args: ReadonlyArray<unknown>) => {
					continuePanOrScroll(args[0] as InputObject);
				});
				ref.inputEndedConnection = connectEvent(inputService, "InputEnded", (...args: ReadonlyArray<unknown>) => {
					finishCanvasInteraction(ref, args[0] as InputObject);
				});
			}

			return [root, root] as [Instance, Instance];
	}) as unknown as CurveEditorRefs;

	refs.curve = curve;
	refs.pathStore = pathStore;
	refs.allowScroll = options.allowScroll ?? true;
	if (viewportOffset !== undefined) refs.viewportOffset = viewportOffset;
	refs.setChanged = setChanged;
	refs.setViewportOffset = setViewportOffset;

	__useEffect("curveEditor:cleanup", () => {
		return () => {
			refs.inputBeganConnection?.Disconnect();
			refs.inputChangedConnection?.Disconnect();
			refs.inputEndedConnection?.Disconnect();
			refs.editableImage?.Destroy();
			refs.inputBeganConnection = undefined;
			refs.inputChangedConnection = undefined;
			refs.inputEndedConnection = undefined;
			refs.editableImage = undefined;
			refs.canvasDirty = false;
			refs.imageCreateFailedSize = undefined;
			refs.panLastPosition = undefined;
			refs.activeDrag = undefined;
			endPointerDrag(refs);
		};
	});

	const registrations = new Array<CurvePathOptions>();
	const pathScope: CurveEditorPathScope = {
		register(pathOptions: CurvePathOptions): CurvePathHandle {
			registrations.push(pathOptions);
			return createCurvePathHandle(pathStore, normalizePathId(pathOptions.id), pathOptions.commands, refs);
		},
	};
	provideContext(contexts.curveEditorPathState, pathScope);
	if (children !== undefined) __scope("curveEditor:paths", children);
	if (reconcilePathStore(pathStore, registrations)) refs.canvasDirty = true;

	const style = useStyle();
	refs.root.Size = rootSize(fixedWidth, fixedHeight, showReadout, style);
	refs.graph.Size = graphSize(fixedWidth, fixedHeight, showReadout, style);
	refs.graph.BackgroundColor3 = style.frameBgColor;
	refs.errorLabel.TextColor3 = style.strongTextColor;
	refs.errorLabel.TextSize = style.textSize;
	replaceCanvasImage(refs, resolveCanvasSize(refs, fixedWidth, fixedHeight, imageSize));
	redrawIfNeeded(refs);

	__useEffect("curveEditor:returnToOrigin", () => {
		if (options.returnToOriginKey === undefined) return;
		returnViewportToOrigin(refs, imageSize);
	}, options.returnToOriginKey);

	const allPresets = mergedPresets(options.presets, userPresets);
	const resolvedViewportOffset = viewportOffset ?? defaultViewportOffset(refs.size ?? imageSize);
	if (showReadout) {
		label(
			`Origin ${math.floor(resolvedViewportOffset.X)}, ${math.floor(resolvedViewportOffset.Y)}  ${math.max(2, math.floor(sampleCount))} samples  ${pathStore.order.size()} segments`,
		);
	}
	renderCurvePointContextPanel(refs);

	return {
		curve() {
			return cloneCurve(curve);
		},
		changed() {
			if (changed) {
				setChanged(false);
				return true;
			}
			return false;
		},
		selectedAnchor() {
			return undefined;
		},
		viewportOffset() {
			return refs.viewportOffset ?? defaultViewportOffset(refs.size ?? imageSize);
		},
		returnToOrigin() {
			returnViewportToOrigin(refs, imageSize);
		},
		presets() {
			const result = new Array<CurvePreset>();
			for (const preset of allPresets) result.push({ name: preset.name, curve: cloneCurve(preset.curve) });
			return result;
		},
		selectedPreset() {
			return selectedPreset;
		},
		getSegments() {
			const result = new Array<CurvePathSnapshot>();
			for (const id of pathStore.order) {
				const path = pathStore.paths.get(id);
				if (path !== undefined) result.push(clonePathSnapshot(path));
			}
			return result;
		},
		selectedSegment() {
			return pathStore.selection?.segmentId;
		},
		selectedPoint() {
			const selection = pathStore.selection;
			if (selection === undefined) return undefined;
			return { segmentId: selection.segmentId, pointIndex: selection.pointIndex };
		},
		deleteSelectedPoint() {
			const deleted = deleteSelectedPathPoint(pathStore);
			if (deleted) markPathEdited(refs);
			return deleted;
		},
	};
}, "@rovy/ui/curveEditorWidget");

/** @widget */
export function curveEditor(options?: CurveEditorOptions): CurveEditorHandle;
export function curveEditor(options: CurveEditorOptions | undefined, children: () => void): CurveEditorHandle;
export function curveEditor(children: () => void): CurveEditorHandle;
export function curveEditor(first: CurveEditorOptions | (() => void) = {}, second?: () => void): CurveEditorHandle {
	const options: CurveEditorOptions = typeIs(first, "function") ? {} : first ?? {};
	const children = typeIs(first, "function") ? first : second;
	return __callWidget("curveEditor", curveEditorWidget as (...args: unknown[]) => CurveEditorHandle, options, children);
}

/** @widget */
export const curvePath = widget((options: CurvePathOptions): CurvePathHandle => {
	const pathScope = useContext(contexts.curveEditorPathState) as CurveEditorPathScope | undefined;
	if (pathScope === undefined) error("[rovy-ui] curvePath must be used inside curveEditor", 2);
	return pathScope.register(options);
}, "@rovy/ui/curvePath");
