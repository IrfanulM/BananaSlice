import { useEffect, useRef, useState } from 'react';
import { Canvas as FabricCanvas, Image as FabricImage, Point, Rect, Polyline, Ellipse } from 'fabric';
import { useCanvasStore } from '../store/canvasStore';
import { useToolStore } from '../store/toolStore';
import { useSelectionStore } from '../store/selectionStore';
import { useLayerStore } from '../store/layerStore';

export function Canvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<FabricCanvas | null>(null);
    const activeSelectionRef = useRef<any>(null); // Track the current selection
    const editLayerObjectsRef = useRef<Map<string, FabricImage>>(new Map()); // Track edit layer objects
    const polygonOutlineRef = useRef<Polyline | null>(null); // Track polygon outline for active layer
    const baseImageObjectRef = useRef<FabricImage | null>(null);
    const isProcessingLayersRef = useRef(false); // Prevent concurrent processing
    const processingVersionRef = useRef(0); // Version counter for aborting stale processing
    const [baseImageReady, setBaseImageReady] = useState(false);

    const {
        baseImage,
        zoom,
        setCursorPosition,
        setZoom,
        setPan,
        setImageTransform,
        imageTransform
    } = useCanvasStore();

    const { activeTool, shapeColor } = useToolStore();

    const { setActiveSelection } = useSelectionStore();

    const {
        layers,
        activeLayerId,
        setActiveLayer,
        updateLayerTransform,
        addLayer
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

        // Native mousedown handler for middle-click (Fabric.js doesn't capture button 1)
        const handleNativeMouseDown = (e: MouseEvent) => {
            if (e.button === 1) {
                e.preventDefault();
                e.stopPropagation();
                isPanning = true;
                canvas.selection = false;
                lastPosX = e.clientX;
                lastPosY = e.clientY;
            }
        };

        // Also handle shift+drag via Fabric.js
        canvas.on('mouse:down', (e) => {
            const evt = e.e as MouseEvent;
            if (evt.button === 0 && evt.shiftKey) {
                isPanning = true;
                canvas.selection = false;
                lastPosX = evt.clientX;
                lastPosY = evt.clientY;
            }
        });

        // Native mousemove for panning
        const handleNativeMouseMove = (e: MouseEvent) => {
            if (isPanning) {
                const deltaX = e.clientX - lastPosX;
                const deltaY = e.clientY - lastPosY;

                // Get fresh pan values from store
                const { panX: currentPanX, panY: currentPanY } = useCanvasStore.getState();
                setPan(currentPanX + deltaX, currentPanY + deltaY);

                lastPosX = e.clientX;
                lastPosY = e.clientY;

                canvas.relativePan(new Point(deltaX, deltaY));

                // Update object coords after pan to fix selection borders
                canvas.getObjects().forEach(obj => obj.setCoords());
            }
        };

        // Native mouseup to stop panning
        const handleNativeMouseUp = () => {
            isPanning = false;
        };

        const wrapperEl = canvas.wrapperEl;
        wrapperEl.addEventListener('mousedown', handleNativeMouseDown);
        window.addEventListener('mousemove', handleNativeMouseMove);
        window.addEventListener('mouseup', handleNativeMouseUp);

        canvas.on('mouse:up', () => {
            isPanning = false;
        });

        // Centralized modification handler (Move/Scale/etc)
        canvas.on('object:modified', (e) => {
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

            // Update object coords after zoom to fix selection borders
            canvas.getObjects().forEach(obj => obj.setCoords());

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
        const isShapeTool = activeTool === 'shape-rect' || activeTool === 'shape-ellipse';
        const isDrawingTool = isSelectionTool || isShapeTool;

        // Clear active selection when switching tools
        canvas.discardActiveObject();

        // Clear any rectangle/lasso selection overlays
        if (activeSelectionRef.current) {

            canvas.remove(activeSelectionRef.current);
            activeSelectionRef.current = null;
            setActiveSelection(null); // Clear from store too
        }

        // Base image: only selectable in move tool
        if (baseImageObjectRef.current) {
            const isBaseSelectable = activeTool === 'move';
            baseImageObjectRef.current.set({
                selectable: isBaseSelectable,
                evented: true, // Always evented so we can catch clicks for drawing
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
        canvas.selection = !isDrawingTool; // Toggle group selection box

        canvas.renderAll();
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

            // Clear any existing selection before starting new one
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
            // Add yellow fill to the completed selection
            if (activeSelectionRef.current) {
                activeSelectionRef.current.set({
                    fill: 'rgba(255, 215, 0, 0.1)',
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

    // Handle shape drawing tools (rectangle and ellipse)
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
            // We allow drawing if the target is the background image though
            if (e.target && e.target !== baseImageObjectRef.current) {
                // If the target is a layer object, make sure it's the active one for moving
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
    }, [activeTool, shapeColor, imageTransform, addLayer]);

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
    }, [baseImage, setZoom, setImageTransform]);

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
            try {
                const isSelectionTool = activeTool === 'rectangle' || activeTool === 'lasso';
                const isShapeTool = activeTool === 'shape-rect' || activeTool === 'shape-ellipse';

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
                        // Gemini returns base64 encoded images (might be PNG or JPEG)
                        const dataUrl = layer.imageData.startsWith('data:')
                            ? layer.imageData
                            : `data:image/png;base64,${layer.imageData}`;

                        try {
                            const img = await FabricImage.fromURL(dataUrl);

                            if (!img.width || !img.height || img.width <= 0 || img.height <= 0) {
                                console.error('Layer image has invalid dimensions:', layer.id, img.width, img.height);
                                continue;
                            }

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

                    // Calculate target dimensions on canvas
                    const targetCanvasWidth = (layer.width || obj.width || 100) * scale;
                    const targetCanvasHeight = (layer.height || obj.height || 100) * scale;

                    // Calculate scale factor to fit the image to target dimensions
                    const imgWidth = obj.width || 1;
                    const imgHeight = obj.height || 1;
                    const targetScaleX = targetCanvasWidth / imgWidth;
                    const targetScaleY = targetCanvasHeight / imgHeight;

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
                        hoverCursor: isSelectionTool ? 'crosshair' : (isShapeTool ? 'move' : 'default'),
                        borderColor: '#FFD700',
                        cornerColor: '#FFD700',
                        cornerStyle: 'circle',
                        transparentCorners: false,
                        borderScaleFactor: 2,
                    });

                    // Attach layer ID for sync
                    (obj as any).data = { layerId: layer.id };

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

                // Remove any untracked objects (duplicates, orphans)
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

                    // Remove if not base, not selection, not polygon outline, and not a tracked layer
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
                        // Transform polygon points to canvas coordinates
                        const canvasPoints = activeLayer.polygonPoints.map(pt => {
                            // Points are relative to layer bounds, so add layer position and apply scale
                            const x = layerObj.left! + (pt.x * layerObj.scaleX!);
                            const y = layerObj.top! + (pt.y * layerObj.scaleY!);
                            return new Point(x, y);
                        });

                        // Create polygon outline
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

        // Sync events for layers
        for (const [layerId, obj] of currentObjects.entries()) {
            // Update polygon outline during move/scale (real-time)
            const updatePolygonOutline = () => {
                if (!polygonOutlineRef.current) return;

                // Find the layer for this object
                const layer = layers.find(l => l.id === layerId);
                if (!layer || !layer.polygonPoints || layer.polygonPoints.length < 3) return;

                // Recalculate polygon points based on current object position
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
