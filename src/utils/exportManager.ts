// BananaSlice - Export utilities
// Handles exporting the composited image to various formats

import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { useCanvasStore } from '../store/canvasStore';
import { useLayerStore } from '../store/layerStore';
import { applyLayerFeathering, applySharpPolygonMask } from './layerCompositor';

export type ExportFormat = 'png' | 'jpeg' | 'webp';

interface ExportOptions {
    format: ExportFormat;
    quality?: number; // 0-100 for jpeg/webp
}

/**
 * Composites all visible layers onto the base image and exports to a file
 */
export const exportImage = async (options: ExportOptions): Promise<string | null> => {
    const canvasState = useCanvasStore.getState();
    const layerState = useLayerStore.getState();

    if (!canvasState.baseImage) {
        throw new Error('No image loaded to export');
    }

    const { baseImage } = canvasState;
    const { layers } = layerState;

    // Create an offscreen canvas at the original image dimensions
    const canvas = document.createElement('canvas');
    canvas.width = baseImage.width;
    canvas.height = baseImage.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('Failed to create canvas context');
    }

    // Helper to convert format string to proper MIME type
    const formatToMimeType = (format: string): string => {
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
    };

    // Load and draw base image
    const baseMimeType = formatToMimeType(baseImage.format);
    const baseImg = await loadImage(`data:${baseMimeType};base64,${baseImage.data}`);
    ctx.drawImage(baseImg, 0, 0);

    // Draw each visible layer in order (bottom to top)
    for (const layer of layers) {
        if (layer.type === 'base') continue;
        if (!layer.visible) continue;

        try {
            let finalImageData = layer.imageData;

            // Use original data as the source if available for better quality/re-masking
            if (layer.originalImageData) {
                const featherRadius = layer.featherRadius ?? 0;
                
                if (featherRadius > 0) {
                    const feathered = await applyLayerFeathering(layer);
                    if (feathered) finalImageData = feathered;
                } else if (layer.polygonPoints && layer.polygonPoints.length >= 3) {
                    const masked = await applySharpPolygonMask(layer);
                    if (masked) finalImageData = masked;
                } else {
                    finalImageData = layer.originalImageData;
                }
            }

            // Robust Data URL construction
            const dataUrl = finalImageData.startsWith('data:')
                ? finalImageData
                : `data:image/png;base64,${finalImageData}`;
                
            const layerImg = await loadImage(dataUrl);

            ctx.globalAlpha = layer.opacity / 100;
            ctx.drawImage(
                layerImg,
                layer.x || 0,
                layer.y || 0,
                layer.width || layerImg.width,
                layer.height || layerImg.height
            );
            ctx.globalAlpha = 1;
        } catch (err) {
            console.error('Failed to draw layer:', layer.id, err);
        }
    }

    // Get file extension filter based on format
    const filters = [{
        name: options.format.toUpperCase(),
        extensions: [options.format]
    }];

    // Get default filename from project name or 'untitled'
    let baseName = 'untitled';
    const { imagePath } = canvasState;
    if (imagePath && imagePath.endsWith('.banslice')) {
        // Extract filename without path and extension
        const pathParts = imagePath.replace(/\\/g, '/').split('/');
        const fileName = pathParts[pathParts.length - 1];
        baseName = fileName.replace('.banslice', '');
    }
    const defaultPath = `${baseName}.${options.format}`;

    // Show save dialog
    const filePath = await save({
        filters,
        defaultPath
    });

    if (!filePath) {
        return null; // User cancelled
    }

    // Convert canvas to the desired format
    const mimeType = formatToMimeType(options.format);
    const quality = options.quality !== undefined ? options.quality / 100 : 0.92;

    const dataUrl = canvas.toDataURL(mimeType, quality);
    const base64Data = dataUrl.split(',')[1];
    const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    // Write to file
    await writeFile(filePath, binaryData);

    return filePath;
};

/**
 * Helper to load an image from a data URL
 */
function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

/**
 * Export a single layer's original image (without feathering/masking)
 * For generated layers, this exports the raw AI output in full resolution.
 */
export const exportLayerImage = async (layerId: string): Promise<string | null> => {
    const canvasState = useCanvasStore.getState();
    const layerState = useLayerStore.getState();
    
    const layer = layerState.layers.find(l => l.id === layerId);
    if (!layer) {
        throw new Error('Layer not found');
    }

    // Determine the image data to export
    let imageData: string;
    let defaultName: string;

    if (layer.type === 'base') {
        // For base layer, use the original base image
        if (!canvasState.baseImage) {
            throw new Error('Base image not available');
        }
        imageData = canvasState.baseImage.data;
        defaultName = 'background';
    } else {
        // For other layers, prefer originalImageData (unprocessed AI output)
        // Fall back to imageData if originalImageData doesn't exist
        imageData = layer.originalImageData ?? layer.imageData;
        // Clean up layer name for filename
        defaultName = layer.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    }

    if (!imageData) {
        throw new Error('No image data available for this layer');
    }

    // Show save dialog
    const filePath = await save({
        filters: [{
            name: 'PNG Image',
            extensions: ['png']
        }],
        defaultPath: `${defaultName}.png`
    });

    if (!filePath) {
        return null; // User cancelled
    }

    // Convert base64 to binary and write
    const binaryData = Uint8Array.from(atob(imageData), c => c.charCodeAt(0));
    await writeFile(filePath, binaryData);

    return filePath;
};

