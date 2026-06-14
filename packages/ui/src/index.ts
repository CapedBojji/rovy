// @rovy/ui — public surface.

import {
	newRoot,
	start,
	beginFrame,
	continueFrame,
	finishFrame,
	scope,
	__scope,
	widget,
	__widget,
	__callWidget,
	useState,
	__useState,
	useInstance,
	__useInstance,
	useEffect,
	__useEffect,
	useKey,
	useRootInstance,
	useInputService,
	setEventCallback,
	createContext,
	useContext,
	provideContext,
	registry,
	__reset,
} from "./runtime";
import { useStyle, getActiveStyle, setStyle, StyleScope, withStyleScope, __withStyleScope } from "./style";
import { create } from "./create";
import { createConnect } from "./createConnect";
import { createRovyInputServiceFromSignals } from "./input";
import { createRovyUiStory } from "./ui-labs";
import { WINDOW_ATTRIBUTE } from "./windowConstants";
import * as contexts from "./contexts";

import { button } from "./widgets/button";
import { checkbox } from "./widgets/checkbox";
import { radioButton } from "./widgets/radio-button";
import { selectableLabel } from "./widgets/selectable-label";
import { toggle } from "./widgets/toggle";
import { clickableLabel } from "./widgets/clickable-label";
import { label } from "./widgets/label";
import { heading } from "./widgets/heading";
import { separator } from "./widgets/separator";
import { space } from "./widgets/space";
import { row } from "./widgets/row";
import { window } from "./widgets/window";
import { childWindow } from "./widgets/child-window";
import { modal } from "./widgets/modal";
import { popup } from "./widgets/popup";
import { portal } from "./widgets/portal";
import { slider } from "./widgets/slider";
import { dragValue } from "./widgets/drag-value";
import { input } from "./widgets/input";
import { comboBox } from "./widgets/combo-box";
import { progressBar } from "./widgets/progress-bar";
import { collapsingHeader } from "./widgets/collapsing-header";
import { editableImage } from "./widgets/editable-image";
import { EditableImageBuffer } from "./editable-image-buffer";
import { curveEditor, curveEditorBuiltInPresets, curvePath, sampleBezierCurve } from "./widgets/curve-editor";
import { uiTable as _table } from "./widgets/table";
import { tableRow } from "./widgets/table-row";
import { tableCell } from "./widgets/table-cell";
import { tableExplorer } from "./widgets/table-explorer";
import { demoWindow } from "./widgets/demo-window";
import { errorWidget } from "./widgets/error";

export * from "./runtime";
export * from "./input";
export * from "./ui-labs";
export * from "./style";
export * from "./create";
export * from "./createConnect";
export * from "./windowConstants";
export * as contexts from "./contexts";
export { newRoot as new } from "./runtime";

export * from "./widgets/button";
export * from "./widgets/checkbox";
export * from "./widgets/radio-button";
export * from "./widgets/selectable-label";
export * from "./widgets/toggle";
export * from "./widgets/clickable-label";
export * from "./widgets/label";
export * from "./widgets/heading";
export * from "./widgets/separator";
export * from "./widgets/space";
export * from "./widgets/row";
export * from "./widgets/window";
export * from "./widgets/child-window";
export * from "./widgets/modal";
export * from "./widgets/popup";
export * from "./widgets/portal";
export * from "./widgets/slider";
export * from "./widgets/drag-value";
export * from "./widgets/input";
export * from "./widgets/combo-box";
export * from "./widgets/progress-bar";
export * from "./widgets/collapsing-header";
export * from "./widgets/editable-image";
export * from "./editable-image-buffer";
export * from "./widgets/curve-editor";
export * from "./widgets/table";
export * from "./widgets/table-row";
export * from "./widgets/table-cell";
export * from "./widgets/table-explorer";
export * from "./widgets/demo-window";
export * from "./widgets/error";

export const rovyUi = {
	new: newRoot,
	start,
	beginFrame,
	continueFrame,
	finishFrame,
	scope,
	__scope,
	widget,
	__widget,
	__callWidget,
	useState,
	__useState,
	useInstance,
	__useInstance,
	useEffect,
	__useEffect,
	useKey,
	useRootInstance,
	useInputService,
	setEventCallback,
	createContext,
	useContext,
	provideContext,
	useStyle,
	getActiveStyle,
	setStyle,
	StyleScope,
	withStyleScope,
	__withStyleScope,
	create,
	createConnect,
	createRovyInputServiceFromSignals,
	createRovyUiStory,
	contexts,
	WINDOW_ATTRIBUTE,
	registry,
	__reset,
	window,
	button,
	checkbox,
	slider,
	label,
	heading,
	separator,
	input,
	row,
	space,
	portal,
	radioButton,
	selectableLabel,
	comboBox,
	dragValue,
	progressBar,
	collapsingHeader,
	editableImage,
	EditableImageBuffer,
	curveEditor,
	curvePath,
	curveEditorBuiltInPresets,
	sampleBezierCurve,
	toggle,
	clickableLabel,
	modal,
	popup,
	childWindow,
	table: _table,
	tableRow,
	tableCell,
	tableExplorer,
	demoWindow,
	error: errorWidget,
};

export default rovyUi;
