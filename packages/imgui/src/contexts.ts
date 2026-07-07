import { createContext } from "./runtime";

export const scrollX = createContext<boolean>("scrollX");
export const tableState = createContext<unknown>("tableState");
export const tableRowState = createContext<unknown>("tableRowState");
export const tableCellState = createContext<unknown>("tableCellState");
export const curveEditorPathState = createContext<unknown>("curveEditorPathState");
