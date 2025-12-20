// Layer compositing utilities - runs entirely in browser
// No backend calls needed!

import type { Layer } from '../types';

/**
 * Create a feathered polygon mask using inset polygon and blur
 */
async function createFeatheredMask(
    layer: Layer,
    width: number,
    height: number
): Promise<HTMLCanvasElement | null> {
    if (!layer.polygonPoints || layer.polygonPoints.length < 3) {
        return null;
    }

    const featherRadius = layer.featherRadius ?? 0;
    if (featherRadius <= 0) {
        return null;
    }

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const ctx = maskCanvas.getContext('2d')!;

    const scaleX = width / (layer.width || width);
    const scaleY = height / (layer.height || height);

    // Calculate polygon centroid
    let centerX = 0, centerY = 0;
    for (const pt of layer.polygonPoints) {
        centerX += pt.x * scaleX;
        centerY += pt.y * scaleY;
    }
    centerX /= layer.polygonPoints.length;
    centerY /= layer.polygonPoints.length;

    // Calculate inset ratio based on featherRadius relative to layer size
    const avgDimension = (width + height) / 2;
    const insetRatio = Math.max(0.1, 1 - (featherRadius * 2 / avgDimension));

    // Draw inset polygon
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();

    const firstPoint = layer.polygonPoints[0];
    const firstX = centerX + (firstPoint.x * scaleX - centerX) * insetRatio;
    const firstY = centerY + (firstPoint.y * scaleY - centerY) * insetRatio;
    ctx.moveTo(firstX, firstY);

    for (let i = 1; i < layer.polygonPoints.length; i++) {
        const pt = layer.polygonPoints[i];
        const x = centerX + (pt.x * scaleX - centerX) * insetRatio;
        const y = centerY + (pt.y * scaleY - centerY) * insetRatio;
        ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.fill();

    // Apply blur for soft edge fade
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d')!;

    tempCtx.filter = `blur(${featherRadius}px)`;
    tempCtx.drawImage(maskCanvas, 0, 0);

    // Copy blurred result back
    ctx.clearRect(0, 0, width, height);
    ctx.filter = 'none';
    ctx.drawImage(tempCanvas, 0, 0);

    return maskCanvas;
}

/**
 * Create a sharp polygon mask (no feathering) for a layer
 */
function createSharpMask(
    layer: Layer,
    width: number,
    height: number
): HTMLCanvasElement | null {
    if (!layer.polygonPoints || layer.polygonPoints.length < 3) {
        return null;
    }

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d')!;

    // Draw the polygon filled with white (no blur = sharp edges)
    maskCtx.fillStyle = '#FFFFFF';
    maskCtx.beginPath();

    const scaleX = width / (layer.width || width);
    const scaleY = height / (layer.height || height);

    const firstPoint = layer.polygonPoints[0];
    maskCtx.moveTo(firstPoint.x * scaleX, firstPoint.y * scaleY);

    for (let i = 1; i < layer.polygonPoints.length; i++) {
        const pt = layer.polygonPoints[i];
        maskCtx.lineTo(pt.x * scaleX, pt.y * scaleY);
    }

    maskCtx.closePath();
    maskCtx.fill();

    return maskCanvas;
}

/**
 * Apply sharp polygon mask (no feathering) to a layer's original image
 * Used when featherRadius is 0
 */
export async function applySharpPolygonMask(
    layer: Layer
): Promise<string | null> {
    if (!layer.polygonPoints || layer.polygonPoints.length < 3) {
        return null;
    }

    if (!layer.originalImageData) {
        return null;
    }

    // Load the original unmasked image
    const img = await loadImage(layer.originalImageData);
    const width = layer.width ?? img.width;
    const height = layer.height ?? img.height;

    // Create the sharp mask
    const sharpMask = createSharpMask(layer, width, height);
    if (!sharpMask) {
        return null;
    }

    // Apply mask to image
    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = width;
    resultCanvas.height = height;
    const resultCtx = resultCanvas.getContext('2d')!;

    // Draw the image
    resultCtx.drawImage(img, 0, 0, width, height);

    // Apply the sharp mask
    resultCtx.globalCompositeOperation = 'destination-in';
    resultCtx.drawImage(sharpMask, 0, 0);

    // Return as base64
    const dataUrl = resultCanvas.toDataURL('image/png');
    return dataUrl.split(',')[1];
}

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

        // Get position and size
        const x = layer.x ?? 0;
        const y = layer.y ?? 0;
        const width = layer.width ?? img.width;
        const height = layer.height ?? img.height;

        // Check if this layer needs feathering
        const featheredMask = await createFeatheredMask(layer, width, height);

        if (featheredMask) {
            // Create a temp canvas to apply mask to image
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d')!;

            // Draw the image
            tempCtx.drawImage(img, 0, 0, width, height);

            // Apply the feathered mask using destination-in
            tempCtx.globalCompositeOperation = 'destination-in';
            tempCtx.drawImage(featheredMask, 0, 0);

            // Draw the masked image to main canvas
            ctx.globalAlpha = layer.opacity / 100;
            ctx.drawImage(tempCanvas, x, y);
        } else {
            // Set opacity
            ctx.globalAlpha = layer.opacity / 100;

            // Draw with position and size (handles resizing automatically)
            ctx.drawImage(img, x, y, width, height);
        }
    }

    // Reset alpha
    ctx.globalAlpha = 1;

    // Return as base64 (without the data:image/png;base64, prefix)
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl.split(',')[1];
}

/**
 * Apply feathering to a single layer image and return the result
 * Used for live preview in the canvas
 * Works for both polygon (lasso) and rectangular layers
 */
export async function applyLayerFeathering(
    layer: Layer
): Promise<string | null> {
    const featherRadius = layer.featherRadius ?? 0;
    if (featherRadius <= 0) {
        return null;
    }

    // Use originalImageData if available (unmasked source for clean re-feathering)
    // Otherwise fall back to imageData (may already have feathering baked in)
    const sourceData = layer.originalImageData ?? layer.imageData;

    // Load the source image
    const img = await loadImage(sourceData);
    const width = layer.width ?? img.width;
    const height = layer.height ?? img.height;

    // Create the feathered mask - either polygon or rectangle
    let featheredMask: HTMLCanvasElement;

    if (layer.polygonPoints && layer.polygonPoints.length >= 3) {
        // Use polygon mask for lasso selections
        const polyMask = await createFeatheredMask(layer, width, height);
        if (!polyMask) {
            return null;
        }
        featheredMask = polyMask;
    } else {
        // Use rectangular mask for rectangle selections
        featheredMask = createRectangularFeatheredMask(width, height, featherRadius);
    }

    // Apply mask to image
    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = width;
    resultCanvas.height = height;
    const resultCtx = resultCanvas.getContext('2d')!;

    // Draw the image
    resultCtx.drawImage(img, 0, 0, width, height);

    // Apply the feathered mask
    resultCtx.globalCompositeOperation = 'destination-in';
    resultCtx.drawImage(featheredMask, 0, 0);

    // Return as base64
    const dataUrl = resultCanvas.toDataURL('image/png');
    return dataUrl.split(',')[1];
}

/**
 * Create a rectangular feathered mask using edge gradients
 */
function createRectangularFeatheredMask(
    width: number,
    height: number,
    featherRadius: number
): HTMLCanvasElement {
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const ctx = maskCanvas.getContext('2d')!;

    // Start with fully opaque white
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // Erase edges with gradient fade using destination-out
    ctx.globalCompositeOperation = 'destination-out';

    // Left edge gradient
    const leftGrad = ctx.createLinearGradient(0, 0, featherRadius, 0);
    leftGrad.addColorStop(0, 'rgba(255,255,255,1)');
    leftGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = leftGrad;
    ctx.fillRect(0, 0, featherRadius, height);

    // Right edge
    const rightGrad = ctx.createLinearGradient(width, 0, width - featherRadius, 0);
    rightGrad.addColorStop(0, 'rgba(255,255,255,1)');
    rightGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rightGrad;
    ctx.fillRect(width - featherRadius, 0, featherRadius, height);

    // Top edge
    const topGrad = ctx.createLinearGradient(0, 0, 0, featherRadius);
    topGrad.addColorStop(0, 'rgba(255,255,255,1)');
    topGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, width, featherRadius);

    // Bottom edge
    const bottomGrad = ctx.createLinearGradient(0, height, 0, height - featherRadius);
    bottomGrad.addColorStop(0, 'rgba(255,255,255,1)');
    bottomGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, height - featherRadius, width, featherRadius);

    return maskCanvas;
}

/**
 * Load a base64 image into an HTMLImageElement
 */
function loadImage(base64Data: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        // Handle both data URLs and raw base64
        img.src = base64Data.startsWith('data:')
            ? base64Data
            : `data:image/png;base64,${base64Data}`;
    });
}

