// Layer Renderer Hook
// Handles rendering and syncing layers to Fabric.js canvas

import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { Canvas as FabricCanvas, Image as FabricImage, Polyline, Point } from 'fabric';
import { useCanvasStore } from '../../store/canvasStore';
import { useToolStore } from '../../store/toolStore';
import { useLayerStore } from '../../store/layerStore';
import { applyLayerFeathering, applySharpPolygonMask } from '../../utils/layerCompositor';

interface UseLayerRendererOptions {
    fabricRef: MutableRefObject<FabricCanvas | null>;
    baseImageObjectRef: MutableRefObject<FabricImage | null>;
    activeSelectionRef: MutableRefObject<any>;
    editLayerObjectsRef: MutableRefObject<Map<string, FabricImage>>;
    layerFeatherCacheRef: MutableRefObject<Map<string, number>>;
    polygonOutlineRef: MutableRefObject<Polyline | null>;
    processingVersionRef: MutableRefObject<number>;
    baseImageReady: boolean;
}

export function useLayerRenderer({
    fabricRef,
    baseImageObjectRef,
    activeSelectionRef,
    editLayerObjectsRef,
    layerFeatherCacheRef,
    polygonOutlineRef,
    processingVersionRef,
    baseImageReady,
}: UseLayerRendererOptions) {
    const { imageTransform } = useCanvasStore();
    const { activeTool } = useToolStore();
    const { layers, activeLayerId, setActiveLayer, updateLayerTransform } = useLayerStore();

    // Handle Edit Layers (Rendering & Interaction)
    useEffect(() => {
        const canvas = fabricRef.current;
        // Wait until base image is loaded before processing layers
        if (!canvas || !imageTransform || !layers || !baseImageReady) {
            return;
        }

        // Increment version to abort any in-progress processing
        processingVersionRef.current++;
        const currentVersion = processingVersionRef.current;

        const currentObjects = editLayerObjectsRef.current;

        // Find base layer to manage its state
        const baseLayer = layers.find(l => l.type === 'base');
        const baseLayerId = baseLayer?.id;

        // Sync base layer visibility/opacity to base image object
        if (baseLayer && baseImageObjectRef.current) {
            baseImageObjectRef.current.set('visible', baseLayer.visible);
            baseImageObjectRef.current.set('opacity', baseLayer.opacity / 100);
            baseImageObjectRef.current.set('borderColor', '#FFD700');
        }

        // Handle active selection setup for base layer
        if (activeLayerId === baseLayerId && baseImageObjectRef.current) {
            if (canvas.getActiveObject() !== baseImageObjectRef.current) {
                canvas.setActiveObject(baseImageObjectRef.current);
            }
        }

        // Process each non-base layer
        const processAllLayers = async () => {
            const isSelectionTool = activeTool === 'rectangle' || activeTool === 'lasso';
            const isShapeTool = activeTool === 'shape-rect' || activeTool === 'shape-ellipse';

            // Check if base image has actually loaded
            if (!baseImageObjectRef.current) {
                return;
            }

            // Get fresh transform from store to avoid stale closure values
            const freshTransform = useCanvasStore.getState().imageTransform;
            if (!freshTransform) {
                return;
            }
            const scale = freshTransform.scaleX;

            for (const layer of layers) {
                // Check if we should abort (version changed)
                if (processingVersionRef.current !== currentVersion) {
                    return;
                }

                // Skip base layer - visibility already handled above
                if (layer.type === 'base') continue;

                let obj = currentObjects.get(layer.id);
                const cachedFeather = layerFeatherCacheRef.current.get(layer.id);
                const currentFeather = layer.featherRadius ?? 0;
                const featherChanged = cachedFeather !== undefined && cachedFeather !== currentFeather;

                // Create new fabric object if needed or if featherRadius changed
                if (!obj || featherChanged) {
                    let imageData = layer.imageData;

                    // Apply feathering if layer has original data and needs processing
                    const needsFeatherApply = layer.originalImageData &&
                        (featherChanged || cachedFeather === undefined);

                    if (needsFeatherApply) {
                        if (currentFeather > 0) {
                            const featheredImage = await applyLayerFeathering(layer);
                            if (featheredImage) {
                                imageData = featheredImage;
                            }
                        } else {
                            if (layer.polygonPoints && layer.polygonPoints.length >= 3) {
                                const sharpImage = await applySharpPolygonMask(layer);
                                if (sharpImage) {
                                    imageData = sharpImage;
                                }
                            } else if (layer.originalImageData) {
                                imageData = layer.originalImageData;
                            }
                        }
                    }

                    const dataUrl = imageData.startsWith('data:')
                        ? imageData
                        : `data:image/png;base64,${imageData}`;

                    try {
                        const img = await FabricImage.fromURL(dataUrl);

                        if (!img.width || !img.height || img.width <= 0 || img.height <= 0) {
                            console.error('Layer image has invalid dimensions:', layer.id);
                            continue;
                        }

                        if (obj) {
                            canvas.remove(obj);
                        }

                        obj = img;
                        currentObjects.set(layer.id, obj);
                        layerFeatherCacheRef.current.set(layer.id, currentFeather);
                        canvas.add(obj);
                    } catch (err) {
                        console.error('Failed to load layer image:', layer.id, err);
                        continue;
                    }
                }

                if (!obj) continue;

                // Calculate position and scale
                const targetLeft = freshTransform.left + ((layer.x || 0) * scale);
                const targetTop = freshTransform.top + ((layer.y || 0) * scale);
                const targetCanvasWidth = (layer.width || obj.width || 100) * scale;
                const targetCanvasHeight = (layer.height || obj.height || 100) * scale;
                const imgWidth = obj.width || 1;
                const imgHeight = obj.height || 1;
                const targetScaleX = targetCanvasWidth / imgWidth;
                const targetScaleY = targetCanvasHeight / imgHeight;

                obj.set({
                    left: targetLeft,
                    top: targetTop,
                    scaleX: targetScaleX,
                    scaleY: targetScaleY,
                    visible: layer.visible,
                    opacity: layer.opacity / 100,
                    selectable: !isSelectionTool,
                    evented: !isSelectionTool,
                    hoverCursor: isSelectionTool ? 'crosshair' : (isShapeTool ? 'move' : 'default'),
                    borderColor: '#FFD700',
                    cornerColor: '#FFD700',
                    cornerStyle: 'circle',
                    transparentCorners: false,
                    borderScaleFactor: 2,
                });

                (obj as any).data = { layerId: layer.id };
                obj.setCoords();

                if (layer.id === activeLayerId && canvas.getActiveObject() !== obj) {
                    canvas.setActiveObject(obj);
                }
            }

            // Enforce Z-Index order
            layers.forEach((layer, index) => {
                const obj = layer.type === 'base'
                    ? baseImageObjectRef.current
                    : currentObjects.get(layer.id);

                if (obj) {
                    const currentIndex = canvas.getObjects().indexOf(obj);
                    if (currentIndex !== index) {
                        canvas.moveObjectTo(obj, index);
                    }
                }
            });

            // Remove objects for deleted layers
            const layerIds = new Set(layers.map(l => l.id));
            for (const [id, obj] of currentObjects.entries()) {
                if (!layerIds.has(id)) {
                    canvas.remove(obj);
                    currentObjects.delete(id);
                }
            }

            // Remove any untracked objects
            const allCanvasObjects = canvas.getObjects();
            for (const obj of allCanvasObjects) {
                const isBase = obj === baseImageObjectRef.current;
                const isSelection = obj === activeSelectionRef.current;
                const isPolygonOutline = obj === polygonOutlineRef.current;
                let isTrackedLayer = false;
                for (const layerObj of currentObjects.values()) {
                    if (layerObj === obj) {
                        isTrackedLayer = true;
                        break;
                    }
                }

                if (!isBase && !isSelection && !isPolygonOutline && !isTrackedLayer) {
                    canvas.remove(obj);
                }
            }

            // Draw polygon outline for active layer if it has polygon points
            if (polygonOutlineRef.current) {
                canvas.remove(polygonOutlineRef.current);
                polygonOutlineRef.current = null;
            }

            const activeLayer = layers.find(l => l.id === activeLayerId);
            if (activeLayer && activeLayer.polygonPoints && activeLayer.polygonPoints.length >= 3) {
                const layerObj = currentObjects.get(activeLayer.id);
                if (layerObj) {
                    const canvasPoints = activeLayer.polygonPoints.map(pt => {
                        const x = layerObj.left! + (pt.x * layerObj.scaleX!);
                        const y = layerObj.top! + (pt.y * layerObj.scaleY!);
                        return new Point(x, y);
                    });

                    polygonOutlineRef.current = new Polyline(canvasPoints, {
                        fill: '',
                        stroke: '#FFD700',
                        strokeWidth: 1,
                        strokeDashArray: [3, 3],
                        selectable: false,
                        evented: false,
                    });

                    canvas.add(polygonOutlineRef.current);
                }
            }

            canvas.requestRenderAll();
        };

        processAllLayers();

        // Setup selection handlers
        const handleSelection = (e: any) => {
            const selected = e.selected?.[0];
            if (!selected) return;

            if (selected === baseImageObjectRef.current && baseLayerId) {
                setActiveLayer(baseLayerId);
                return;
            }

            for (const [id, obj] of currentObjects.entries()) {
                if (obj === selected) {
                    setActiveLayer(id);
                    break;
                }
            }
        };

        const handleSelectionCleared = () => {
            setActiveLayer(null);
        };

        canvas.off('selection:created');
        canvas.off('selection:updated');
        canvas.off('selection:cleared');

        canvas.on('selection:created', handleSelection);
        canvas.on('selection:updated', handleSelection);
        canvas.on('selection:cleared', handleSelectionCleared);

        // Sync events for layers
        for (const [layerId, obj] of currentObjects.entries()) {
            const updatePolygonOutline = () => {
                if (!polygonOutlineRef.current) return;

                const layer = layers.find(l => l.id === layerId);
                if (!layer || !layer.polygonPoints || layer.polygonPoints.length < 3) return;

                const points = layer.polygonPoints.map(pt => {
                    const x = obj.left! + (pt.x * obj.scaleX!);
                    const y = obj.top! + (pt.y * obj.scaleY!);
                    return new Point(x, y);
                });

                polygonOutlineRef.current.set({ points });
                polygonOutlineRef.current.setCoords();
            };

            obj.off('moving');
            obj.off('scaling');
            obj.on('moving', updatePolygonOutline);
            obj.on('scaling', updatePolygonOutline);
        }

    }, [layers, imageTransform, activeLayerId, baseImageReady, activeTool, setActiveLayer, updateLayerTransform, fabricRef, baseImageObjectRef, activeSelectionRef, editLayerObjectsRef, layerFeatherCacheRef, polygonOutlineRef, processingVersionRef]);
}
