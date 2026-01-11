// Canvas Component
// Refactored to use custom hooks for better separation of concerns

import { useEffect, useRef, useState } from 'react';
import { Image as FabricImage, Polyline } from 'fabric';
import { useCanvasStore } from '../store/canvasStore';
import { useToolStore } from '../store/toolStore';
import { useSelectionStore } from '../store/selectionStore';
import { useLayerStore } from '../store/layerStore';
import { ContextToolbar } from './ContextToolbar';

// Canvas-specific hooks
import {
    useFabricCanvas,
    useSelectionTools,
    useShapeTools,
    useLayerRenderer,
} from '../hooks/canvas';

export function Canvas() {
    // Get refs from the fabric canvas hook
    const { fabricRef, canvasRef, baseImageObjectRef } = useFabricCanvas();
    
    // Additional refs for canvas state
    const activeSelectionRef = useRef<any>(null);
    const editLayerObjectsRef = useRef<Map<string, FabricImage>>(new Map());
    const layerFeatherCacheRef = useRef<Map<string, number>>(new Map());
    const polygonOutlineRef = useRef<Polyline | null>(null);
    const processingVersionRef = useRef(0);
    
    // Local state
    const [baseImageReady, setBaseImageReady] = useState(false);
    const [selectedLayerBounds, setSelectedLayerBounds] = useState<{
        left: number;
        top: number;
        width: number;
        height: number;
    } | null>(null);

    // Store hooks
    const { baseImage, zoom, setZoom, setImageTransform } = useCanvasStore();
    const { activeTool } = useToolStore();
    const { setActiveSelection } = useSelectionStore();
    const { layers, activeLayerId, setActiveLayer } = useLayerStore();

    // Use the custom hooks for different functionality
    useSelectionTools({
        fabricRef,
        activeSelectionRef,
    });

    useShapeTools({
        fabricRef,
        baseImageObjectRef,
    });

    useLayerRenderer({
        fabricRef,
        baseImageObjectRef,
        activeSelectionRef,
        editLayerObjectsRef,
        layerFeatherCacheRef,
        polygonOutlineRef,
        processingVersionRef,
        baseImageReady,
    });

    // Update tool mode when activeTool changes
    useEffect(() => {
        if (!fabricRef.current) return;
        const canvas = fabricRef.current;

        const isSelectionTool = activeTool === 'rectangle' || activeTool === 'lasso';
        const isShapeTool = activeTool === 'shape-rect' || activeTool === 'shape-ellipse';
        const isDrawingTool = isSelectionTool || isShapeTool;

        // Clear active selection when switching tools
        canvas.discardActiveObject();

        // Clear any rectangle/lasso selection overlays
        if (activeSelectionRef.current) {
            canvas.remove(activeSelectionRef.current);
            activeSelectionRef.current = null;
            setActiveSelection(null);
        }

        // Base image: only selectable in move tool
        if (baseImageObjectRef.current) {
            const isBaseSelectable = activeTool === 'move';
            baseImageObjectRef.current.set({
                selectable: isBaseSelectable,
                evented: true,
                hoverCursor: isDrawingTool ? 'crosshair' : 'default',
            });
        }

        // Toggle interactivity for all objects based on tool
        const isLayerSelectable = !isSelectionTool;
        canvas.getObjects().forEach((obj) => {
            if (obj === baseImageObjectRef.current || obj === activeSelectionRef.current) return;

            obj.set({
                selectable: isLayerSelectable,
                evented: !isSelectionTool,
                hoverCursor: isSelectionTool ? 'crosshair' : (isShapeTool ? 'move' : 'default'),
            });
        });

        canvas.defaultCursor = isDrawingTool ? 'crosshair' : 'default';
        canvas.selection = !isDrawingTool;

        canvas.renderAll();
    }, [activeTool, setActiveSelection]);

    // Centralized object:modified handler for transform sync
    useEffect(() => {
        if (!fabricRef.current) return;
        const canvas = fabricRef.current;

        const handleObjectModified = (e: any) => {
            const obj = e.target as any;
            if (!obj || !obj.data || !obj.data.layerId) return;

            const layerId = obj.data.layerId;
            const freshTransform = useCanvasStore.getState().imageTransform;
            if (!freshTransform) return;

            const relativeLeft = (obj.left - freshTransform.left) / freshTransform.scaleX;
            const relativeTop = (obj.top - freshTransform.top) / freshTransform.scaleY;
            const scaledWidth = obj.getScaledWidth();
            const scaledHeight = obj.getScaledHeight();
            const relativeWidth = scaledWidth / freshTransform.scaleX;
            const relativeHeight = scaledHeight / freshTransform.scaleY;

            useLayerStore.getState().updateLayerTransform(
                layerId,
                Math.round(relativeLeft),
                Math.round(relativeTop),
                Math.round(relativeWidth),
                Math.round(relativeHeight)
            );
        };

        canvas.on('object:modified', handleObjectModified);

        return () => {
            canvas.off('object:modified', handleObjectModified);
        };
    }, []);

    // Load image when baseImage changes
    useEffect(() => {
        if (!fabricRef.current || !baseImage) return;

        const canvas = fabricRef.current;

        // Clear canvas and cached objects synchronously
        canvas.remove(...canvas.getObjects());
        editLayerObjectsRef.current.clear();
        layerFeatherCacheRef.current.clear();
        baseImageObjectRef.current = null;
        processingVersionRef.current++;
        setBaseImageReady(false);

        const mimeType = baseImage.format === 'jpg' || baseImage.format === 'jpeg'
            ? 'image/jpeg'
            : baseImage.format === 'webp'
                ? 'image/webp'
                : 'image/png';

        const dataUrl = `data:${mimeType};base64,${baseImage.data}`;

        FabricImage.fromURL(dataUrl)
            .then((img) => {
                canvas.setZoom(1);

                const scaleX = (canvas.width! * 0.9) / img.width!;
                const scaleY = (canvas.height! * 0.9) / img.height!;
                const scale = Math.min(scaleX, scaleY);

                img.scale(scale);

                const scaledWidth = img.width! * scale;
                const scaledHeight = img.height! * scale;

                const centerX = (canvas.width! - scaledWidth) / 2;
                const centerY = (canvas.height! - scaledHeight) / 2;

                const isSelectionTool = activeTool === 'rectangle' || activeTool === 'lasso';
                const isShapeTool = activeTool === 'shape-rect' || activeTool === 'shape-ellipse';
                const isDrawingTool = isSelectionTool || isShapeTool;

                img.set({
                    left: centerX,
                    top: centerY,
                    selectable: activeTool === 'move',
                    evented: true,
                    lockMovementX: true,
                    lockMovementY: true,
                    lockRotation: true,
                    lockScalingX: true,
                    lockScalingY: true,
                    hasControls: false,
                    hasBorders: true,
                    borderColor: '#FFD700',
                    borderScaleFactor: 2,
                    hoverCursor: isDrawingTool ? 'crosshair' : 'default',
                    moveCursor: 'default',
                });

                baseImageObjectRef.current = img;

                canvas.add(img);

                const newTransform = {
                    left: centerX,
                    top: centerY,
                    scaleX: scale,
                    scaleY: scale,
                };

                setImageTransform(newTransform);
                setZoom(100);
                canvas.renderAll();
                setBaseImageReady(true);
            })
            .catch((err) => {
                console.error('Failed to load image:', err);
            });
    }, [baseImage, setZoom, setImageTransform, activeTool]);

    // Apply zoom changes from store
    useEffect(() => {
        if (!fabricRef.current) return;
        fabricRef.current.setZoom(zoom / 100);
        fabricRef.current.requestRenderAll();
    }, [zoom]);

    // Update selected layer bounds for context toolbar positioning
    useEffect(() => {
        const canvas = fabricRef.current;
        if (!canvas || !activeLayerId) {
            setSelectedLayerBounds(null);
            return;
        }

        const updateBounds = () => {
            const layerObj = editLayerObjectsRef.current.get(activeLayerId);
            if (!layerObj) {
                setSelectedLayerBounds(null);
                return;
            }

            const boundingRect = layerObj.getBoundingRect();
            const canvasEl = canvas.getElement();
            const canvasRect = canvasEl.getBoundingClientRect();

            setSelectedLayerBounds({
                left: canvasRect.left + boundingRect.left,
                top: canvasRect.top + boundingRect.top,
                width: boundingRect.width,
                height: boundingRect.height,
            });
        };

        updateBounds();

        canvas.on('object:moving', updateBounds);
        canvas.on('object:scaling', updateBounds);
        canvas.on('after:render', updateBounds);

        return () => {
            canvas.off('object:moving', updateBounds);
            canvas.off('object:scaling', updateBounds);
            canvas.off('after:render', updateBounds);
        };
    }, [activeLayerId, layers, zoom]);

    return (
        <div
            className="canvas-wrapper"
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    setActiveLayer(null);
                }
            }}
        >
            <canvas ref={canvasRef} />
            <ContextToolbar
                layerBounds={selectedLayerBounds}
                layerId={activeLayerId}
            />
        </div>
    );
}
