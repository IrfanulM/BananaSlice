// Selection processing utilities for API preparation

export interface SelectionBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ImageTransform {
    left: number;
    top: number;
    scaleX: number;
    scaleY: number;
}

export interface ProcessedSelection {
    bounds: SelectionBounds;
    croppedImageBase64: string;
    maskBase64: string;
    polygonMaskBase64?: string; // For masking the returned result
    relativePolygonPoints?: PolygonPoint[]; // Polygon points relative to bounds origin
}

export interface PolygonPoint {
    x: number;
    y: number;
}

export function getSelectionBoundsCanvas(selectionObject: any): SelectionBounds | null {
    if (!selectionObject) return null;

    const boundingRect = selectionObject.getBoundingRect();

    return {
        x: Math.floor(boundingRect.left),
        y: Math.floor(boundingRect.top),
        width: Math.ceil(boundingRect.width),
        height: Math.ceil(boundingRect.height),
    };
}

export function transformToImageSpace(
    canvasBounds: SelectionBounds,
    imageTransform: ImageTransform,
    imageWidth: number,
    imageHeight: number
): SelectionBounds {
    const imageX1 = Math.floor((canvasBounds.x - imageTransform.left) / imageTransform.scaleX);
    const imageY1 = Math.floor((canvasBounds.y - imageTransform.top) / imageTransform.scaleY);
    const imageX2 = Math.ceil((canvasBounds.x + canvasBounds.width - imageTransform.left) / imageTransform.scaleX);
    const imageY2 = Math.ceil((canvasBounds.y + canvasBounds.height - imageTransform.top) / imageTransform.scaleY);

    const clampedX1 = Math.max(0, Math.min(imageX1, imageWidth - 1));
    const clampedY1 = Math.max(0, Math.min(imageY1, imageHeight - 1));
    const clampedX2 = Math.max(0, Math.min(imageX2, imageWidth));
    const clampedY2 = Math.max(0, Math.min(imageY2, imageHeight));

    return {
        x: clampedX1,
        y: clampedY1,
        width: Math.max(0, clampedX2 - clampedX1),
        height: Math.max(0, clampedY2 - clampedY1),
    };
}

export function extractPolygonPoints(selectionObject: any): PolygonPoint[] | null {
    if (!selectionObject) return null;

    if (selectionObject.type === 'polyline' && selectionObject.points && selectionObject.points.length >= 3) {
        // Fabric.js Polyline stores points relative to pathOffset
        // The object's bounding rect gives us the correct canvas position
        const boundingRect = selectionObject.getBoundingRect();
        const points = selectionObject.points;

        // Find the min of raw points to understand the offset
        let minX = Infinity, minY = Infinity;
        for (const pt of points) {
            if (pt.x < minX) minX = pt.x;
            if (pt.y < minY) minY = pt.y;
        }

        // Calculate offset: where raw points start vs where bounding rect starts
        const offsetX = boundingRect.left - minX;
        const offsetY = boundingRect.top - minY;

        // Transform raw points to canvas coordinates
        return points.map((pt: any) => ({
            x: pt.x + offsetX,
            y: pt.y + offsetY,
        }));
    }

    return null;
}

export function transformPolygonToImageSpace(
    canvasPoints: PolygonPoint[],
    imageTransform: ImageTransform
): PolygonPoint[] {
    return canvasPoints.map(point => ({
        x: (point.x - imageTransform.left) / imageTransform.scaleX,
        y: (point.y - imageTransform.top) / imageTransform.scaleY,
    }));
}

// Draw polygon path on a canvas context (relative to bounds origin)
function drawPolygonPath(
    ctx: CanvasRenderingContext2D,
    polygonPoints: PolygonPoint[],
    bounds: SelectionBounds
) {
    ctx.beginPath();
    const firstPoint = polygonPoints[0];
    ctx.moveTo(firstPoint.x - bounds.x, firstPoint.y - bounds.y);

    for (let i = 1; i < polygonPoints.length; i++) {
        const pt = polygonPoints[i];
        ctx.lineTo(pt.x - bounds.x, pt.y - bounds.y);
    }

    ctx.closePath();
}

// Helper to convert format string to proper MIME type
function formatToMimeType(format: string): string {
    switch (format.toLowerCase()) {
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'webp':
            return 'image/webp';
        case 'png':
        default:
            return 'image/png';
    }
}

// Simple crop - keep all content for context (proper inpainting)
export async function cropImageToBounds(
    imageBase64: string,
    bounds: SelectionBounds,
    format: string
): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = bounds.width;
            canvas.height = bounds.height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Could not get canvas context'));
                return;
            }

            // Draw the cropped region - keep all content for context
            ctx.drawImage(
                img,
                bounds.x, bounds.y, bounds.width, bounds.height,
                0, 0, bounds.width, bounds.height
            );

            const mimeType = formatToMimeType(format);
            const dataUrl = canvas.toDataURL(mimeType);
            const base64 = dataUrl.split(',')[1];
            resolve(base64);
        };

        img.onerror = () => reject(new Error('Failed to load image'));

        if (imageBase64.startsWith('data:')) {
            img.src = imageBase64;
        } else {
            const mimeType = formatToMimeType(format);
            img.src = `data:${mimeType};base64,${imageBase64}`;
        }
    });
}

// Create inpainting mask: white = edit area, black = keep for context
export async function createInpaintingMask(
    bounds: SelectionBounds,
    polygonPoints?: PolygonPoint[]
): Promise<string> {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = bounds.width;
        canvas.height = bounds.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            resolve('');
            return;
        }

        if (polygonPoints && polygonPoints.length >= 3) {
            // Lasso: black background (context), white polygon (edit area)
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, bounds.width, bounds.height);

            ctx.fillStyle = '#FFFFFF';
            drawPolygonPath(ctx, polygonPoints, bounds);
            ctx.fill();
        } else {
            // Rectangle: full white (edit everything)
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, bounds.width, bounds.height);
        }

        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
    });
}

// Create full white mask for Gemini (edit everything)
export async function createFullMask(bounds: SelectionBounds): Promise<string> {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = bounds.width;
        canvas.height = bounds.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            resolve('');
            return;
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, bounds.width, bounds.height);

        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
    });
}

// Create polygon mask for masking the returned result (white = keep, transparent = discard)
// Feathers the edges for smooth blending
export async function createPolygonMask(
    bounds: SelectionBounds,
    polygonPoints: PolygonPoint[],
    featherRadius: number = 8 // pixels of edge softness
): Promise<string> {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = bounds.width;
        canvas.height = bounds.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            resolve('');
            return;
        }

        // Draw the polygon with opaque white
        ctx.fillStyle = '#FFFFFF';
        drawPolygonPath(ctx, polygonPoints, bounds);
        ctx.fill();

        // Apply blur for feathered edges
        if (featherRadius > 0) {
            ctx.filter = `blur(${featherRadius}px)`;

            // Create temp canvas to apply blur
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = bounds.width;
            tempCanvas.height = bounds.height;
            const tempCtx = tempCanvas.getContext('2d');

            if (tempCtx) {
                tempCtx.filter = `blur(${featherRadius}px)`;
                tempCtx.drawImage(canvas, 0, 0);

                // Copy back
                ctx.clearRect(0, 0, bounds.width, bounds.height);
                ctx.filter = 'none';
                ctx.drawImage(tempCanvas, 0, 0);
            }
        }

        const dataUrl = canvas.toDataURL('image/png');
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
    });
}

export async function processSelectionForAPI(
    selectionObject: any,
    imageBase64: string,
    imageFormat: string,
    imageTransform: ImageTransform,
    imageWidth: number,
    imageHeight: number
): Promise<ProcessedSelection | null> {
    const canvasBounds = getSelectionBoundsCanvas(selectionObject);
    if (!canvasBounds || canvasBounds.width <= 0 || canvasBounds.height <= 0) {
        return null;
    }

    const imageBounds = transformToImageSpace(
        canvasBounds,
        imageTransform,
        imageWidth,
        imageHeight
    );

    if (imageBounds.width <= 0 || imageBounds.height <= 0) {
        console.error('Selection is outside image bounds');
        return null;
    }

    // Extract polygon points for lasso selections
    const canvasPolygonPoints = extractPolygonPoints(selectionObject);
    let imagePolygonPoints: PolygonPoint[] | undefined;

    if (canvasPolygonPoints) {
        imagePolygonPoints = transformPolygonToImageSpace(canvasPolygonPoints, imageTransform);
    }

    // Crop the full region - keep all content for context
    const croppedImageBase64 = await cropImageToBounds(
        imageBase64,
        imageBounds,
        imageFormat
    );

    // Create inpainting mask: white = edit area, black = context for blending
    const maskBase64 = await createInpaintingMask(imageBounds, imagePolygonPoints);

    // For lasso, also create an alpha mask to apply to the returned result
    let polygonMaskBase64: string | undefined;
    let relativePolygonPoints: PolygonPoint[] | undefined;

    if (imagePolygonPoints && imagePolygonPoints.length >= 3) {
        polygonMaskBase64 = await createPolygonMask(imageBounds, imagePolygonPoints);

        // Store points relative to bounds origin (for layer display)
        relativePolygonPoints = imagePolygonPoints.map(pt => ({
            x: pt.x - imageBounds.x,
            y: pt.y - imageBounds.y,
        }));
    }

    return {
        bounds: imageBounds,
        croppedImageBase64,
        maskBase64,
        polygonMaskBase64,
        relativePolygonPoints,
    };
}

// Apply polygon mask to the returned image (make outside transparent)
export async function applyPolygonMaskToResult(
    resultImageBase64: string,
    polygonMaskBase64: string,
    targetWidth: number,
    targetHeight: number
): Promise<string> {
    return new Promise((resolve, reject) => {
        const resultImg = new Image();
        const maskImg = new Image();

        let loadedCount = 0;
        const onBothLoaded = () => {
            loadedCount++;
            if (loadedCount < 2) return;

            const canvas = document.createElement('canvas');
            canvas.width = targetWidth;
            canvas.height = targetHeight;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Could not get canvas context'));
                return;
            }

            // Draw result image scaled to target size
            ctx.drawImage(resultImg, 0, 0, targetWidth, targetHeight);

            // Apply mask using destination-in composite
            ctx.globalCompositeOperation = 'destination-in';
            ctx.drawImage(maskImg, 0, 0, targetWidth, targetHeight);

            const dataUrl = canvas.toDataURL('image/png');
            const base64 = dataUrl.split(',')[1];
            resolve(base64);
        };

        resultImg.onload = onBothLoaded;
        maskImg.onload = onBothLoaded;
        resultImg.onerror = () => reject(new Error('Failed to load result image'));
        maskImg.onerror = () => reject(new Error('Failed to load mask image'));

        resultImg.src = resultImageBase64.startsWith('data:')
            ? resultImageBase64
            : `data:image/png;base64,${resultImageBase64}`;
        maskImg.src = `data:image/png;base64,${polygonMaskBase64}`;
    });
}
