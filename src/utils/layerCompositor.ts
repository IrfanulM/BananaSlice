// Layer compositing utilities - runs entirely in browser
// No backend calls needed!

import type { Layer } from '../types';

/**
 * Composite all layers into a single image using HTML Canvas
 * This is instant - no IPC to Rust needed
 */
export async function compositeLayersInBrowser(
    layers: Layer[],
    canvasWidth: number,
    canvasHeight: number
): Promise<string> {
    // Create an offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d')!;

    // Clear to transparent
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Sort layers by order (bottom to top)
    const sortedLayers = [...layers].sort((a, b) => a.order - b.order);

    // Draw each layer
    for (const layer of sortedLayers) {
        // Skip invisible layers
        if (!layer.visible) continue;

        // Load the layer image
        const img = await loadImage(layer.imageData);

        // Set opacity
        ctx.globalAlpha = layer.opacity / 100;

        // Get position and size
        const x = layer.x ?? 0;
        const y = layer.y ?? 0;
        const width = layer.width ?? img.width;
        const height = layer.height ?? img.height;

        // Draw with position and size (handles resizing automatically)
        ctx.drawImage(img, x, y, width, height);
    }

    // Reset alpha
    ctx.globalAlpha = 1;

    // Return as base64 (without the data:image/png;base64, prefix)
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl.split(',')[1];
}

/**
 * Load a base64 image into an HTMLImageElement
 */
function loadImage(base64Data: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = `data:image/png;base64,${base64Data}`;
    });
}
