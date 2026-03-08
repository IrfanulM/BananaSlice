// Smart Selection Hook
// Handles the click-to-select object selection tool using MediaPipe segmentation.

import { useEffect, useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { Canvas as FabricCanvas, Polyline, Point } from 'fabric';
import { SELECTION_STYLE_COMPLETE } from '../../utils/selectionStyle';
import { useToolStore } from '../../store/toolStore';
import { useSelectionStore } from '../../store/selectionStore';
import { useCanvasStore } from '../../store/canvasStore';
import { useLayerStore } from '../../store/layerStore';
import { toast } from '../../store/toastStore';
import { segmentAtPoint, initSegmenter, isSegmenterReady } from '../../utils/smartSegmenter';
import { compositeLayersInBrowser } from '../../utils/layerCompositor';

interface UseSmartSelectionOptions {
    fabricRef: MutableRefObject<FabricCanvas | null>;
    activeSelectionRef: MutableRefObject<any>;
}

export function useSmartSelection({
    fabricRef,
    activeSelectionRef,
}: UseSmartSelectionOptions) {
    const { activeTool } = useToolStore();
    const { setActiveSelection } = useSelectionStore();
    const { baseImage, imageTransform } = useCanvasStore();
    const { getVisibleLayers } = useLayerStore();

    // Pre-initialize the segmenter when the tool is first selected
    useEffect(() => {
        if (activeTool === 'smart-select' && !isSegmenterReady()) {
            toast.info('Loading Smart Selection model...');
            initSegmenter()
                .then(() => {
                    toast.success('Smart Selection ready!');
                })
                .catch((err) => {
                    console.error('[SmartSelection] Failed to initialize:', err);
                    toast.error('Failed to load Smart Selection model');
                });
        }
    }, [activeTool]);

    // Handle click-to-segment
    const handleSmartSelect = useCallback(
        async (canvasX: number, canvasY: number) => {
            if (!baseImage || !imageTransform) return;

            // Convert canvas coordinates to image-space coordinates
            const imageX = (canvasX - imageTransform.left) / imageTransform.scaleX;
            const imageY = (canvasY - imageTransform.top) / imageTransform.scaleY;

            // Bounds check
            if (imageX < 0 || imageX >= baseImage.width || imageY < 0 || imageY >= baseImage.height) {
                toast.error('Click inside the image to select an object');
                return;
            }

            try {
                // Get composited image for segmentation (includes all visible layers)
                const visibleLayers = getVisibleLayers();
                let imageDataForSegment = baseImage.data;

                if (visibleLayers.length > 1) {
                    imageDataForSegment = await compositeLayersInBrowser(
                        visibleLayers,
                        baseImage.width,
                        baseImage.height
                    );
                }

                // Run segmentation
                const result = await segmentAtPoint(
                    imageDataForSegment,
                    baseImage.width,
                    baseImage.height,
                    imageX,
                    imageY,
                    2.0
                );

                if (result.polygon.length < 3) {
                    toast.error('No object detected at that point');
                    return;
                }

                const canvas = fabricRef.current;
                if (!canvas) return;

                // Clear existing selection
                if (activeSelectionRef.current) {
                    canvas.remove(activeSelectionRef.current);
                    activeSelectionRef.current = null;
                }

                // Convert image-space polygon points to canvas-space
                const canvasPoints = result.polygon.map(
                    (pt) =>
                        new Point(
                            pt.x * imageTransform.scaleX + imageTransform.left,
                            pt.y * imageTransform.scaleY + imageTransform.top
                        )
                );

                // Create a Fabric.js Polyline — same style as all other selections
                const polyline = new Polyline(canvasPoints, {
                    ...SELECTION_STYLE_COMPLETE,
                });

                activeSelectionRef.current = polyline;
                canvas.add(polyline);
                canvas.renderAll();

                // Store in selection store so the Generate Fill pipeline can use it
                setActiveSelection(polyline);

            } catch (err) {
                console.error('[SmartSelection] Segmentation failed:', err);
                toast.error('Smart selection failed. Try again.');
            }
        },
        [baseImage, imageTransform, fabricRef, activeSelectionRef, setActiveSelection, getVisibleLayers]
    );

    // Attach/detach the click handler based on tool state
    useEffect(() => {
        if (!fabricRef.current) return;
        if (activeTool !== 'smart-select') return;

        const canvas = fabricRef.current;
        let isProcessing = false;

        const handleMouseDown = async (e: any) => {
            if (isProcessing) return;

            const pointer = e.e ? canvas.getScenePoint(e.e) : null;
            if (!pointer) return;

            isProcessing = true;

            // Show a brief loading cursor
            canvas.defaultCursor = 'wait';
            canvas.renderAll();

            try {
                await handleSmartSelect(pointer.x, pointer.y);
            } finally {
                canvas.defaultCursor = 'crosshair';
                canvas.renderAll();
                isProcessing = false;
            }
        };

        canvas.on('mouse:down', handleMouseDown);

        return () => {
            canvas.off('mouse:down', handleMouseDown);
        };
    }, [activeTool, fabricRef, handleSmartSelect]);
}
