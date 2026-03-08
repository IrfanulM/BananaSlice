// Smart Segmenter
// Wraps the MediaPipe Interactive Image Segmenter for click-to-select functionality.

import { InteractiveSegmenter, FilesetResolver } from '@mediapipe/tasks-vision';
import { maskToPolygon, type Point2D } from './contourTracer';

let segmenterInstance: InteractiveSegmenter | null = null;
let initPromise: Promise<InteractiveSegmenter> | null = null;

/**
 * Initialize the MediaPipe Interactive Image Segmenter.
 * Uses a singleton pattern — only initializes once, subsequent calls return the same instance.
 */
export async function initSegmenter(): Promise<InteractiveSegmenter> {
    // If already initialized, return the instance
    if (segmenterInstance) return segmenterInstance;

    // If currently initializing, wait for it
    if (initPromise) return initPromise;

    initPromise = (async () => {
        console.log('[SmartSegmenter] Initializing MediaPipe Interactive Segmenter...');

        const vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        const segmenter = await InteractiveSegmenter.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath:
                    'https://storage.googleapis.com/mediapipe-tasks/interactive_segmenter/ptm_512_hdt_ptm_woid.tflite',
            },
            outputCategoryMask: true,
            outputConfidenceMasks: false,
        });

        segmenterInstance = segmenter;
        console.log('[SmartSegmenter] Initialization complete.');
        return segmenter;
    })();

    try {
        return await initPromise;
    } catch (err) {
        // Reset so a retry is possible
        initPromise = null;
        throw err;
    }
}

/**
 * Check if the segmenter has been initialized.
 */
export function isSegmenterReady(): boolean {
    return segmenterInstance !== null;
}

export interface SegmentResult {
    /** Simplified polygon points in image-space coordinates */
    polygon: Point2D[];
    /** Raw category mask as Uint8Array (for debugging / alternative use) */
    rawMask: Uint8Array;
    /** Width of the mask */
    maskWidth: number;
    /** Height of the mask */
    maskHeight: number;
}

/**
 * Perform interactive segmentation at a given point.
 *
 * @param imageBase64 - Base64-encoded image data (the full composited image)
 * @param imageWidth - Width of the image in pixels
 * @param imageHeight - Height of the image in pixels
 * @param clickX - X coordinate of the click in image space (pixels, not normalized)
 * @param clickY - Y coordinate of the click in image space (pixels, not normalized)
 * @param simplifyTolerance - Douglas-Peucker tolerance for polygon simplification
 * @returns Promise resolving to the segmentation result with polygon points
 */
export async function segmentAtPoint(
    imageBase64: string,
    imageWidth: number,
    imageHeight: number,
    clickX: number,
    clickY: number,
    simplifyTolerance: number = 2.0
): Promise<SegmentResult> {
    const segmenter = await initSegmenter();

    // Create an HTMLImageElement from the base64 data
    const img = new Image();

    await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load image for segmentation'));

        if (imageBase64.startsWith('data:')) {
            img.src = imageBase64;
        } else {
            img.src = `data:image/png;base64,${imageBase64}`;
        }
    });

    // Normalize click coordinates to 0-1 range
    const normalizedX = clickX / imageWidth;
    const normalizedY = clickY / imageHeight;

    // Run segmentation
    return new Promise<SegmentResult>((resolve, reject) => {
        try {
            segmenter.segment(
                img,
                {
                    keypoint: {
                        x: normalizedX,
                        y: normalizedY,
                    },
                },
                (result) => {
                    try {
                        if (!result.categoryMask) {
                            reject(new Error('No category mask in segmentation result'));
                            return;
                        }

                        const maskData = result.categoryMask.getAsUint8Array();
                        const maskWidth = result.categoryMask.width;
                        const maskHeight = result.categoryMask.height;

                        // Copy the mask data since MediaPipe reuses the buffer
                        const maskCopy = new Uint8Array(maskData.length);
                        maskCopy.set(maskData);

                        // Convert mask to polygon
                        const polygon = maskToPolygon(maskCopy, maskWidth, maskHeight, simplifyTolerance);

                        // Scale polygon points if mask dimensions differ from image dimensions
                        const scaleX = imageWidth / maskWidth;
                        const scaleY = imageHeight / maskHeight;

                        const scaledPolygon = polygon.map((pt) => ({
                            x: pt.x * scaleX,
                            y: pt.y * scaleY,
                        }));

                        // Close the result 
                        result.categoryMask.close();
                        
                        resolve({
                            polygon: scaledPolygon,
                            rawMask: maskCopy,
                            maskWidth,
                            maskHeight,
                        });
                    } catch (err) {
                        reject(err);
                    }
                }
            );
        } catch (err) {
            reject(err);
        }
    });
}
