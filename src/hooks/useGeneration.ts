// Generation Hook
// Handles AI generation flow including aspect ratio adjustment

import { useState } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { useSelectionStore } from '../store/selectionStore';
import { useLayerStore } from '../store/layerStore';
import { useToolStore } from '../store/toolStore';
import { useSettingsStore } from '../store/settingsStore';
import { toast } from '../store/toastStore';
import { generateFill, hasApiKey } from '../api';
import { compositeLayersInBrowser } from '../utils/layerCompositor';
import { calculateAspectRatioAdjustment } from '../utils/aspectRatio';
import { getSelectionBoundsCanvas } from '../utils/selectionProcessor';
import type { ProgressStage } from '../components/ProgressIndicator';

interface AspectRatioDialogState {
    open: boolean;
    originalRatio: string;
    adjustedRatio: string;
    widthDiff: number;
    heightDiff: number;
    onConfirm: () => void;
}

interface UseGenerationOptions {
    prompt: string;
    referenceImages: string[];
    onOpenSettings: () => void;
}

// Generation stage labels
const generationStages = [
    'Processing selection',
    'Generating with AI',
    'Applying result',
];

export function useGeneration({ prompt, referenceImages, onOpenSettings }: UseGenerationOptions) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationStage, setGenerationStage] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [aspectRatioDialog, setAspectRatioDialog] = useState<AspectRatioDialogState | null>(null);

    const { baseImage, imageTransform } = useCanvasStore();
    const { activeSelection, processForAPI, clearSelection, setActiveSelection } = useSelectionStore();
    const { addLayer, getVisibleLayers } = useLayerStore();
    const { setActiveTool } = useToolStore();
    const { defaultModel: model } = useSettingsStore();

    // Create progress stages based on current stage
    const getProgressStages = (): ProgressStage[] => {
        return generationStages.map((label, index) => ({
            id: `stage-${index}`,
            label,
            status: index < generationStage ? 'complete' : index === generationStage ? 'active' : 'pending',
        }));
    };

    const doGenerate = async () => {
        setIsGenerating(true);
        setGenerationStage(0);
        setError(null);

        try {
            // Validate baseImage is available
            if (!baseImage) {
                throw new Error('No image loaded.');
            }

            // Validate image transform is available
            if (!imageTransform) {
                throw new Error('Image transform not available. Please reload the image.');
            }

            // Stage 1: Composite visible layers and process selection
            setGenerationStage(0);

            // Get all visible layers and composite them
            const visibleLayers = getVisibleLayers();
            let imageDataForAPI = baseImage.data;

            // If there are multiple visible layers, composite them first
            if (visibleLayers.length > 1) {
                imageDataForAPI = await compositeLayersInBrowser(
                    visibleLayers,
                    baseImage.width,
                    baseImage.height
                );
            }

            const processed = await processForAPI(
                imageDataForAPI,
                'png', // Composite is always PNG
                imageTransform,
                baseImage.width,
                baseImage.height
            );

            if (!processed) {
                throw new Error('Failed to process selection');
            }

            // Stage 2: Call generate API with optional reference images
            setGenerationStage(1);
            const genResult = await generateFill(
                model,
                prompt,
                processed.croppedImageBase64,
                processed.maskBase64,
                referenceImages.filter(img => img !== '')
            );

            if (!genResult.success || !genResult.image_base64) {
                throw new Error(genResult.error || 'Generation failed');
            }

            // Stage 3: Apply polygon mask to result if this was a lasso selection
            setGenerationStage(2);
            let finalImageBase64 = genResult.image_base64;
            if (processed.polygonMaskBase64) {
                const { applyPolygonMaskToResult } = await import('../utils/selectionProcessor');
                finalImageBase64 = await applyPolygonMaskToResult(
                    genResult.image_base64,
                    processed.polygonMaskBase64,
                    processed.bounds.width,
                    processed.bounds.height
                );
            }

            // Add generated patch as a new layer
            addLayer({
                name: `Edit: ${prompt.substring(0, 20)}${prompt.length > 20 ? '...' : ''}`,
                type: 'edit',
                imageData: finalImageBase64,
                originalImageData: genResult.image_base64,
                visible: true,
                opacity: 100,
                x: processed.bounds.x,
                y: processed.bounds.y,
                width: processed.bounds.width,
                height: processed.bounds.height,
                polygonPoints: processed.relativePolygonPoints,
            });

            // Clear selection and switch to move tool
            clearSelection();
            setActiveTool('move');

            toast.success('Generation complete! New layer added.');

        } catch (err) {
            const message = err instanceof Error ? err.message : 'An unexpected error occurred';
            setError(message);
            toast.error(`Generation failed: ${message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerate = async () => {
        if (!baseImage || !activeSelection) {
            setError('Please make a selection first');
            return;
        }

        if (!prompt.trim()) {
            setError('Please enter a prompt');
            return;
        }

        // Check API key
        const keyConfigured = await hasApiKey();
        if (!keyConfigured) {
            setError('Please configure your API key in Settings');
            onOpenSettings();
            return;
        }

        // Check if aspect ratio adjustment is needed when reference images are used
        const activeReferenceImages = referenceImages.filter(img => img !== '');
        if (activeReferenceImages.length > 0) {
            const selectionBounds = getSelectionBoundsCanvas(activeSelection);
            if (selectionBounds) {
                const adjustment = calculateAspectRatioAdjustment(
                    selectionBounds.width,
                    selectionBounds.height
                );

                if (adjustment.needsAdjustment) {
                    // Show confirmation dialog
                    setAspectRatioDialog({
                        open: true,
                        originalRatio: adjustment.originalRatio,
                        adjustedRatio: adjustment.closestRatio,
                        widthDiff: adjustment.adjustedWidth - adjustment.originalWidth,
                        heightDiff: adjustment.adjustedHeight - adjustment.originalHeight,
                        onConfirm: () => {
                            setAspectRatioDialog(null);

                            // Get current selection properties
                            const currentWidth = activeSelection.width * (activeSelection.scaleX || 1);
                            const currentHeight = activeSelection.height * (activeSelection.scaleY || 1);

                            // Calculate scale factors to achieve new dimensions
                            const newScaleX = adjustment.adjustedWidth / activeSelection.width;
                            const newScaleY = adjustment.adjustedHeight / activeSelection.height;

                            // Center the expansion - adjust position
                            const widthChange = adjustment.adjustedWidth - currentWidth;
                            const heightChange = adjustment.adjustedHeight - currentHeight;

                            // Apply the new size to the selection
                            activeSelection.set({
                                scaleX: newScaleX,
                                scaleY: newScaleY,
                                left: activeSelection.left - widthChange / 2,
                                top: activeSelection.top - heightChange / 2,
                            });
                            activeSelection.setCoords();

                            // Re-render the canvas to show the adjusted selection
                            if (activeSelection.canvas) {
                                activeSelection.canvas.renderAll();
                            }

                            // Update the selection store with the modified selection
                            setActiveSelection(activeSelection);

                            toast.info(`Selection adjusted to ${adjustment.closestRatio} ratio`);

                            // Now proceed with generation using the resized selection
                            doGenerate();
                        }
                    });
                    return;
                }
            }
        }

        // Proceed directly if no adjustment needed
        doGenerate();
    };

    return {
        // State
        isGenerating,
        generationStage,
        generationStages,
        error,
        aspectRatioDialog,
        model,
        
        // Actions
        handleGenerate,
        setError,
        setAspectRatioDialog,
        getProgressStages,
    };
}
