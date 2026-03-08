// Selection style constants
// Single source of truth for how all selections (Rectangle, Lasso, Smart Select) look.

import { Image as FabricImage } from 'fabric';

/** Base selection properties shared across all selection types */
const SELECTION_BASE = {
    selectable: false,
    evented: false,
    objectCaching: false,
    strokeUniform: true,
};

/** Style applied while actively drawing a selection (no fill yet) */
export const SELECTION_STYLE_DRAWING = {
    fill: '',
    stroke: '#000',
    strokeWidth: 1,
    strokeDashArray: [5, 5],
    strokeLineJoin: 'round' as CanvasLineJoin,
    ...SELECTION_BASE,
};

/** Style applied to a completed selection (with highlight fill) */
export const SELECTION_STYLE_COMPLETE = {
    fill: 'rgba(255, 215, 0, 0.1)',
    stroke: '#000',
    strokeWidth: 1,
    strokeDashArray: [5, 5],
    strokeLineJoin: 'round' as CanvasLineJoin,
    ...SELECTION_BASE,
};

export interface SelectionPoint {
    x: number;
    y: number;
}

/**
 * Create a selection overlay as a rendered Fabric.js Image.
 * Completely bypasses Fabric.js's Polyline stroke rendering by drawing
 * the filled polygon + dashed outline directly using the Canvas 2D API,
 * then wrapping the result as a Fabric Image.
 *
 * The polygon points are stored on the Image as `data.polygonPoints`
 * so the selection processor pipeline can extract them.
 */
export function createRenderedSelection(
    points: SelectionPoint[],
    complete: boolean = true
): FabricImage {
    if (points.length < 3) {
        throw new Error('Need at least 3 points for a selection');
    }

    // Calculate bounding box with padding for stroke
    const pad = 4;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of points) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
    }

    const canvasWidth = Math.ceil(maxX - minX) + pad * 2;
    const canvasHeight = Math.ceil(maxY - minY) + pad * 2;

    // Draw on offscreen canvas
    const offscreen = document.createElement('canvas');
    offscreen.width = canvasWidth;
    offscreen.height = canvasHeight;
    const ctx = offscreen.getContext('2d')!;

    // Translate so points are relative to bounding box origin + padding
    const offsetX = minX - pad;
    const offsetY = minY - pad;

    // Draw fill
    if (complete) {
        ctx.fillStyle = 'rgba(255, 215, 0, 0.1)';
        ctx.beginPath();
        ctx.moveTo(points[0].x - offsetX, points[0].y - offsetY);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x - offsetX, points[i].y - offsetY);
        }
        ctx.closePath();
        ctx.fill();
    }

    // Draw dashed stroke using pure Canvas 2D
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(points[0].x - offsetX, points[0].y - offsetY);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x - offsetX, points[i].y - offsetY);
    }
    ctx.closePath();
    ctx.stroke();

    // Create Fabric Image directly from canvas element — SYNCHRONOUS, no race conditions
    const img = new FabricImage(offscreen);

    img.set({
        left: offsetX,
        top: offsetY,
        selectable: false,
        evented: false,
        objectCaching: false,
    });

    // Store polygon points as custom data for the selection processor
    (img as any).data = { polygonPoints: points };
    // Mark as selection image so extractPolygonPoints can find it
    (img as any)._isSelectionImage = true;

    return img;
}
