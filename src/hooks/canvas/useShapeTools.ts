// Shape Tools Hook
// Handles shape drawing (rectangle and ellipse)

import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { Canvas as FabricCanvas, Image as FabricImage, Rect, Ellipse } from 'fabric';
import { useCanvasStore } from '../../store/canvasStore';
import { useToolStore } from '../../store/toolStore';
import { useLayerStore } from '../../store/layerStore';

interface UseShapeToolsOptions {
    fabricRef: MutableRefObject<FabricCanvas | null>;
    baseImageObjectRef: MutableRefObject<FabricImage | null>;
}

export function useShapeTools({
    fabricRef,
    baseImageObjectRef,
}: UseShapeToolsOptions) {
    const { imageTransform } = useCanvasStore();
    const { activeTool, shapeColor } = useToolStore();
    const { addLayer, setActiveLayer } = useLayerStore();

    useEffect(() => {
        if (!fabricRef.current || !imageTransform) return;
        const canvas = fabricRef.current;

        const isShapeTool = activeTool === 'shape-rect' || activeTool === 'shape-ellipse';
        if (!isShapeTool) return;

        let isDrawing = false;
        let startX = 0;
        let startY = 0;
        let tempShape: Rect | Ellipse | null = null;

        // Helper to get pointer coordinates in canvas object space
        const getCanvasPointer = (e: any): { x: number; y: number } | null => {
            if (!e.e) return null;
            const pointer = canvas.getScenePoint(e.e);
            return { x: pointer.x, y: pointer.y };
        };

        // Convert a shape to a layer image
        const shapeToLayerImage = async (shape: Rect | Ellipse): Promise<string> => {
            const width = Math.ceil(shape.width! * (shape.scaleX || 1));
            const height = Math.ceil(shape.height! * (shape.scaleY || 1));

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const ctx = tempCanvas.getContext('2d')!;

            ctx.fillStyle = shapeColor;

            if (shape instanceof Ellipse) {
                ctx.beginPath();
                ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillRect(0, 0, width, height);
            }

            const dataUrl = tempCanvas.toDataURL('image/png');
            return dataUrl.split(',')[1]; // Return base64 without prefix
        };

        const handleMouseDown = (e: any) => {
            const pointer = getCanvasPointer(e);
            if (!pointer) return;

            // If we clicked on an existing object (like another shape), don't start drawing a new one
            if (e.target && e.target !== baseImageObjectRef.current) {
                if (e.target.data?.layerId) {
                    setActiveLayer(e.target.data.layerId);
                }
                return;
            }

            isDrawing = true;
            startX = pointer.x;
            startY = pointer.y;
        };

        const handleMouseMove = (e: any) => {
            if (!isDrawing) return;

            const pointer = getCanvasPointer(e);
            if (!pointer) return;

            // Remove temporary preview
            if (tempShape) {
                canvas.remove(tempShape);
            }

            const width = Math.abs(pointer.x - startX);
            const height = Math.abs(pointer.y - startY);
            const left = Math.min(startX, pointer.x);
            const top = Math.min(startY, pointer.y);

            if (activeTool === 'shape-ellipse') {
                tempShape = new Ellipse({
                    left: left + width / 2,
                    top: top + height / 2,
                    rx: width / 2,
                    ry: height / 2,
                    fill: shapeColor,
                    stroke: '#000',
                    strokeWidth: 1,
                    originX: 'center',
                    originY: 'center',
                    selectable: false,
                    evented: false,
                });
            } else {
                tempShape = new Rect({
                    left,
                    top,
                    width,
                    height,
                    fill: shapeColor,
                    stroke: '#000',
                    strokeWidth: 1,
                    selectable: false,
                    evented: false,
                });
            }

            canvas.add(tempShape);
            canvas.renderAll();
        };

        const handleMouseUp = async () => {
            if (!isDrawing || !tempShape) {
                isDrawing = false;
                return;
            }

            isDrawing = false;

            // Get shape bounds before removing
            const shapeWidth = tempShape.width! * (tempShape.scaleX || 1);
            const shapeHeight = tempShape.height! * (tempShape.scaleY || 1);

            // Skip tiny shapes (accidental clicks)
            if (shapeWidth < 5 || shapeHeight < 5) {
                canvas.remove(tempShape);
                tempShape = null;
                return;
            }

            let shapeLeft: number;
            let shapeTop: number;

            if (tempShape instanceof Ellipse) {
                // Ellipse uses center origin
                shapeLeft = tempShape.left! - shapeWidth / 2;
                shapeTop = tempShape.top! - shapeHeight / 2;
            } else {
                shapeLeft = tempShape.left!;
                shapeTop = tempShape.top!;
            }

            // Convert shape to layer image
            const imageData = await shapeToLayerImage(tempShape);

            // Calculate position relative to base image
            const relativeX = (shapeLeft - imageTransform.left) / imageTransform.scaleX;
            const relativeY = (shapeTop - imageTransform.top) / imageTransform.scaleY;
            const relativeWidth = shapeWidth / imageTransform.scaleX;
            const relativeHeight = shapeHeight / imageTransform.scaleY;

            // Remove temporary shape from canvas
            canvas.remove(tempShape);
            tempShape = null;

            // Add as a new layer
            const shapeType = activeTool === 'shape-ellipse' ? 'Ellipse' : 'Rectangle';
            addLayer({
                name: shapeType,
                type: 'shape',
                imageData,
                originalImageData: imageData,
                visible: true,
                opacity: 100,
                x: Math.round(relativeX),
                y: Math.round(relativeY),
                width: Math.round(relativeWidth),
                height: Math.round(relativeHeight),
                shapeType: activeTool === 'shape-ellipse' ? 'ellipse' : 'rect',
                fillColor: shapeColor,
            });

            canvas.renderAll();
        };

        canvas.on('mouse:down', handleMouseDown);
        canvas.on('mouse:move', handleMouseMove);
        canvas.on('mouse:up', handleMouseUp);

        return () => {
            canvas.off('mouse:down', handleMouseDown);
            canvas.off('mouse:move', handleMouseMove);
            canvas.off('mouse:up', handleMouseUp);

            // Clean up any temporary shape
            if (tempShape) {
                canvas.remove(tempShape);
            }
        };
    }, [activeTool, shapeColor, imageTransform, addLayer, setActiveLayer, fabricRef, baseImageObjectRef]);
}
