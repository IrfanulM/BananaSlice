// Tool classification helpers
// Single source of truth for which tools are selection tools, shape tools, etc.

import type { Tool } from '../types';

/** Tools that create selections (rectangle, lasso, smart-select) */
export function isSelectionTool(tool: Tool): boolean {
    return tool === 'rectangle' || tool === 'lasso' || tool === 'smart-select';
}

/** Tools that draw shapes (rect, ellipse) */
export function isShapeTool(tool: Tool): boolean {
    return tool === 'shape-rect' || tool === 'shape-ellipse';
}

/** Any tool that uses a crosshair cursor and disables object selection */
export function isDrawingTool(tool: Tool): boolean {
    return isSelectionTool(tool) || isShapeTool(tool);
}
