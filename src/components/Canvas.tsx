import { useEffect, useRef, useState } from 'react';
import { Canvas as FabricCanvas, Image as FabricImage, Point, Rect, Polyline } from 'fabric';
import { useCanvasStore } from '../store/canvasStore';
import { useToolStore } from '../store/toolStore';
import { useSelectionStore } from '../store/selectionStore';
import { useLayerStore } from '../store/layerStore';

export function Canvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<FabricCanvas | null>(null);
    const activeSelectionRef = useRef<any>(null); // Track the current selection
    const editLayerObjectsRef = useRef<Map<string, FabricImage>>(new Map()); // Track edit layer objects
    const baseImageObjectRef = useRef<FabricImage | null>(null);
    const isProcessingLayersRef = useRef(false); // Prevent concurrent processing
    const processingVersionRef = useRef(0); // Version counter for aborting stale processing
    const [baseImageReady, setBaseImageReady] = useState(false);

    const {
        baseImage,
        zoom,
        panX,
        panY,
        setCursorPosition,
        setZoom,
        setPan,
        setImageTransform,
        imageTransform
    } = useCanvasStore();

    const { activeTool } = useToolStore();

    const { setActiveSelection } = useSelectionStore();

    const {
        layers,
        activeLayerId,
        setActiveLayer,
        updateLayerTransform
    } = useLayerStore();

    // Initialize Fabric.js canvas
    useEffect(() => {
        if (!canvasRef.current || fabricRef.current) return;

        const canvasElement = canvasRef.current;
        const container = canvasElement.parentElement;

        if (!container) return;

        const width = container.clientWidth;
        const height = container.clientHeight;

        const canvas = new FabricCanvas(canvasElement, {
            width,
            height,
            backgroundColor: 'transparent',
            selection: false,
            renderOnAddRemove: true,
            preserveObjectStacking: true,
        });

        fabricRef.current = canvas;

        // Mouse move tracking
        canvas.on('mouse:move', (e) => {
            if (e.pointer) {
                setCursorPosition(Math.round(e.pointer.x), Math.round(e.pointer.y));
            }
        });

        // Panning with middle mouse or shift+drag
        let isPanning = false;
        let lastPosX = 0;
        let lastPosY = 0;

        canvas.on('mouse:down', (e) => {
            const evt = e.e as MouseEvent;
            if (evt.button === 1 || (evt.button === 0 && evt.shiftKey)) {
                isPanning = true;
                canvas.isDrawingMode = false;
                canvas.selection = false;
                lastPosX = evt.clientX;
                lastPosY = evt.clientY;
            }
        });

        canvas.on('mouse:move', (e) => {
            if (isPanning && e.e) {
                const evt = e.e as MouseEvent;
                const deltaX = evt.clientX - lastPosX;
                const deltaY = evt.clientY - lastPosY;

                setPan(panX + deltaX, panY + deltaY);

                lastPosX = evt.clientX;
                lastPosY = evt.clientY;

                canvas.relativePan(new Point(deltaX, deltaY));
            }
        });

        canvas.on('mouse:up', () => {
            isPanning = false;
        });

        // Zoom with mouse wheel
        canvas.on('mouse:wheel', (opt) => {
            const evt = opt.e as WheelEvent;
            const delta = evt.deltaY;
            let newZoom = canvas.getZoom();
            newZoom *= 0.999 ** delta;

            if (newZoom > 20) newZoom = 20;
            if (newZoom < 0.01) newZoom = 0.01;

            canvas.zoomToPoint(
                new Point(evt.offsetX, evt.offsetY),
                newZoom
            );

            setZoom(newZoom * 100);
            evt.preventDefault();
            evt.stopPropagation();
        });

        // Handle window resize
        const handleResize = () => {
            if (!container) return;
            const newWidth = container.clientWidth;
            const newHeight = container.clientHeight;

            canvas.setDimensions({
                width: newWidth,
                height: newHeight,
            });

            // Reposition and rescale existing image if present
            const objects = canvas.getObjects();
            if (objects.length > 0) {
                const img = objects[0] as FabricImage;

                // Recalculate scale
                const scaleX = (newWidth * 0.9) / img.width!;
                const scaleY = (newHeight * 0.9) / img.height!;
                const scale = Math.min(scaleX, scaleY);

                img.scale(scale);

                // Recalculate position
                const scaledWidth = img.width! * scale;
                const scaledHeight = img.height! * scale;
                const centerX = (newWidth - scaledWidth) / 2;
                const centerY = (newHeight - scaledHeight) / 2;

                img.set({
                    left: centerX,
                    top: centerY,
                });
            }

            canvas.renderAll();
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            canvas.dispose();
            fabricRef.current = null;
        };
    }, []);

    // Update tool mode when activeTool changes
    useEffect(() => {
        if (!fabricRef.current) return;
        const canvas = fabricRef.current;

        const isSelectionTool = activeTool === 'rectangle' || activeTool === 'lasso';

        // Toggle interactivity for all objects based on tool
        canvas.getObjects().forEach((obj) => {
            // Skip the temporary selection styling objects if any
            if (obj === activeSelectionRef.current) return;

            obj.set({
                selectable: !isSelectionTool,
                evented: !isSelectionTool,
                hoverCursor: isSelectionTool ? 'crosshair' : 'default',
            });
        });

        canvas.defaultCursor = isSelectionTool ? 'crosshair' : 'default';
        canvas.selection = !isSelectionTool; // Toggle group selection box

        canvas.requestRenderAll();
    }, [activeTool]);

    // Handle rectangle and lasso selection tools
    useEffect(() => {
        if (!fabricRef.current) return;
        const canvas = fabricRef.current;

        let isDrawing = false;
        let startX = 0;
        let startY = 0;
        let lassoPoints: Point[] = [];

        // Helper to clear ANY existing selection
        const clearSelection = () => {
            if (activeSelectionRef.current) {
                canvas.remove(activeSelectionRef.current);
                activeSelectionRef.current = null;
            }
        };

        // Helper to get pointer coordinates in canvas object space (accounting for zoom/pan)
        const getCanvasPointer = (e: any): { x: number; y: number } | null => {
            if (!e.e) return null;
            // Use getScenePoint to get coordinates in the canvas object coordinate system
            const pointer = canvas.getScenePoint(e.e);
            return { x: pointer.x, y: pointer.y };
        };

        const handleMouseDown = (e: any) => {
            if (activeTool !== 'rectangle' && activeTool !== 'lasso') return;

            const pointer = getCanvasPointer(e);
            if (!pointer) return;

            // CRITICAL: Clear any existing selection before starting new one
            clearSelection();

            isDrawing = true;
            startX = pointer.x;
            startY = pointer.y;

            if (activeTool === 'lasso') {
                lassoPoints = [new Point(startX, startY)];
            }
        };

        const handleMouseMove = (e: any) => {
            if (!isDrawing) return;

            const pointer = getCanvasPointer(e);
            if (!pointer) return;

            if (activeTool === 'rectangle') {
                // Remove temporary preview
                if (activeSelectionRef.current) {
                    canvas.remove(activeSelectionRef.current);
                }

                const width = pointer.x - startX;
                const height = pointer.y - startY;

                activeSelectionRef.current = new Rect({
                    left: width >= 0 ? startX : pointer.x,
                    top: height >= 0 ? startY : pointer.y,
                    width: Math.abs(width),
                    height: Math.abs(height),
                    fill: '',
                    stroke: '#000',
                    strokeWidth: 1,
                    strokeDashArray: [5, 5],
                    selectable: false,
                    evented: false,
                });

                canvas.add(activeSelectionRef.current);
                canvas.renderAll();
            } else if (activeTool === 'lasso') {
                lassoPoints.push(new Point(pointer.x, pointer.y));

                // Remove temporary preview
                if (activeSelectionRef.current) {
                    canvas.remove(activeSelectionRef.current);
                }

                activeSelectionRef.current = new Polyline(lassoPoints, {
                    fill: '',
                    stroke: '#000',
                    strokeWidth: 1,
                    strokeDashArray: [5, 5],
                    selectable: false,
                    evented: false,
                });

                canvas.add(activeSelectionRef.current);
                canvas.renderAll();
            }
        };

        const handleMouseUp = () => {
            // Add blue fill to the completed selection
            if (activeSelectionRef.current) {
                activeSelectionRef.current.set({
                    fill: 'rgba(0, 120, 255, 0.1)',
                });
                canvas.renderAll();

                // Sync selection to store for API processing
                setActiveSelection(activeSelectionRef.current);
            }

            isDrawing = false;
            lassoPoints = [];
        };

        if (activeTool === 'rectangle' || activeTool === 'lasso') {
            canvas.on('mouse:down', handleMouseDown);
            canvas.on('mouse:move', handleMouseMove);
            canvas.on('mouse:up', handleMouseUp);
        }

        return () => {
            canvas.off('mouse:down', handleMouseDown);
            canvas.off('mouse:move', handleMouseMove);
            canvas.off('mouse:up', handleMouseUp);
        };
    }, [activeTool]);

    // Load image when baseImage changes
    useEffect(() => {
        if (!fabricRef.current || !baseImage) return;

        const canvas = fabricRef.current;

        // Clear canvas and cached objects synchronously BEFORE loading new image
        canvas.remove(...canvas.getObjects());
        editLayerObjectsRef.current.clear();
        baseImageObjectRef.current = null;
        isProcessingLayersRef.current = false; // Reset processing flag
        processingVersionRef.current++; // Increment version to abort any stale processing
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

                img.set({
                    left: centerX,
                    top: centerY,
                    selectable: !isSelectionTool,
                    evented: !isSelectionTool,
                    lockMovementX: true,
                    lockMovementY: true,
                    lockRotation: true,
                    lockScalingX: true,
                    lockScalingY: true,
                    hasControls: false,
                    hasBorders: true,
                    borderColor: '#3b82f6',
                    borderScaleFactor: 2,
                    hoverCursor: isSelectionTool ? 'crosshair' : 'default',
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

    // Handle Edit Layers (Rendering & Interaction)
    useEffect(() => {
        const canvas = fabricRef.current;
        // Wait until base image is loaded before processing layers
        if (!canvas || !imageTransform || !layers || !baseImageReady) {
            return;
        }

        // Prevent concurrent processing
        if (isProcessingLayersRef.current) {
            return;
        }
        isProcessingLayersRef.current = true;

        // Capture current version to detect if we should abort
        const currentVersion = processingVersionRef.current;

        const currentObjects = editLayerObjectsRef.current;

        // Find base layer to manage its state
        const baseLayer = layers.find(l => l.type === 'base');
        const baseLayerId = baseLayer?.id;

        // Sync base layer visibility/opacity to base image object
        if (baseLayer && baseImageObjectRef.current) {
            baseImageObjectRef.current.set('visible', baseLayer.visible);
            baseImageObjectRef.current.set('opacity', baseLayer.opacity / 100);
        }

        // Handle active selection setup for base layer
        if (activeLayerId === baseLayerId && baseImageObjectRef.current) {
            if (canvas.getActiveObject() !== baseImageObjectRef.current) {
                canvas.setActiveObject(baseImageObjectRef.current);
            }
        }

        // Process each non-base layer
        const processAllLayers = async () => {
            try {
                const isSelectionTool = activeTool === 'rectangle' || activeTool === 'lasso';

                // Check if base image has actually loaded (ref-based check is synchronous)
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
                        return; // Abort this processing run
                    }

                    // Skip base layer - visibility already handled above
                    if (layer.type === 'base') continue;

                    let obj = currentObjects.get(layer.id);

                    // Create new fabric object if needed
                    if (!obj) {
                        const mimeType = 'image/png';
                        const dataUrl = `data:${mimeType};base64,${layer.imageData}`;

                        try {
                            const img = await FabricImage.fromURL(dataUrl);
                            obj = img;
                            currentObjects.set(layer.id, obj);
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
                    let targetScaleX = scale;
                    let targetScaleY = scale;
                    if (layer.width && layer.height && obj.width && obj.height) {
                        targetScaleX = (layer.width * scale) / obj.width;
                        targetScaleY = (layer.height * scale) / obj.height;
                    }

                    // Apply ALL properties
                    obj.set({
                        left: targetLeft,
                        top: targetTop,
                        scaleX: targetScaleX,
                        scaleY: targetScaleY,
                        visible: layer.visible,
                        opacity: layer.opacity / 100,
                        selectable: !isSelectionTool,
                        evented: !isSelectionTool,
                        hoverCursor: isSelectionTool ? 'crosshair' : 'default',
                        borderColor: '#3b82f6',
                        cornerColor: '#3b82f6',
                        cornerStyle: 'circle',
                        transparentCorners: false,
                        borderScaleFactor: 2,
                    });

                    obj.setCoords();

                    // Update active state
                    if (layer.id === activeLayerId && canvas.getActiveObject() !== obj) {
                        canvas.setActiveObject(obj);
                    }
                }

                // Enforce Z-Index order to match store (Bottom -> Top)
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

                canvas.requestRenderAll();
            } finally {
                isProcessingLayersRef.current = false;
            }
        };

        processAllLayers();

        // Setup selection handlers (only once per effect run)
        const handleSelection = (e: any) => {
            const selected = e.selected?.[0];
            if (!selected) return;

            // Check if base layer selected
            if (selected === baseImageObjectRef.current && baseLayerId) {
                setActiveLayer(baseLayerId);
                return;
            }

            // Check edit layers
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

        // Attach modified event listeners for layers
        for (const [layerId, obj] of currentObjects.entries()) {
            obj.off('modified');
            obj.on('modified', () => {
                const relativeLeft = (obj.left! - imageTransform.left) / imageTransform.scaleX;
                const relativeTop = (obj.top! - imageTransform.top) / imageTransform.scaleY;
                const scaledWidth = obj.width! * obj.scaleX!;
                const scaledHeight = obj.height! * obj.scaleY!;
                const relativeWidth = scaledWidth / imageTransform.scaleX;
                const relativeHeight = scaledHeight / imageTransform.scaleY;

                updateLayerTransform(
                    layerId,
                    Math.round(relativeLeft),
                    Math.round(relativeTop),
                    Math.round(relativeWidth),
                    Math.round(relativeHeight)
                );
            });
        }

    }, [layers, imageTransform, updateLayerTransform, activeLayerId, baseImageReady, activeTool, setActiveLayer]);

    // Apply zoom changes from store
    useEffect(() => {
        if (!fabricRef.current) return;
        fabricRef.current.setZoom(zoom / 100);
        fabricRef.current.requestRenderAll();
    }, [zoom]);

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
        </div>
    );
}
