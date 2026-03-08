// Selection style constants
// Single source of truth for how all selections (Rectangle, Lasso, Smart Select) look.

/** Style applied while actively drawing a selection (no fill yet) */
export const SELECTION_STYLE_DRAWING = {
    fill: '',
    stroke: '#000',
    strokeWidth: 1,
    strokeDashArray: [5, 5],
    selectable: false,
    evented: false,
};

/** Style applied to a completed selection (with highlight fill) */
export const SELECTION_STYLE_COMPLETE = {
    fill: 'rgba(255, 215, 0, 0.1)',
    stroke: '#000',
    strokeWidth: 1,
    strokeDashArray: [5, 5],
    selectable: false,
    evented: false,
};
