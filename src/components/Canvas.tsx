import { useEffect, useRef } from 'react';
import { Canvas as FabricCanvas, Image as FabricImage, Point, Rect, Polyline } from 'fabric';
import { useCanvasStore } from '../store/canvasStore';
import { useToolStore } from '../store/toolStore';

export function Canvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<FabricCanvas | null>(null);
    const activeSelectionRef = useRef<any>(null); // Track the current selection

    const {
        baseImage,
        zoom,
        panX,
        panY,
        setCursorPosition,
        setZoom,
        setPan
    } = useCanvasStore();

    const {
        activeTool
    } = useToolStore();

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

        switch (activeTool) {
            case 'rectangle':
            case 'lasso':
                canvas.isDrawingMode = false;
                canvas.selection = false;
                break;

            case 'move':
            default:
                canvas.isDrawingMode = false;
                canvas.selection = true;
        }
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

        const handleMouseDown = (e: any) => {
            if (activeTool !== 'rectangle' && activeTool !== 'lasso') return;
            if (!e.pointer) return;

            // CRITICAL: Clear any existing selection before starting new one
            clearSelection();

            isDrawing = true;
            startX = e.pointer.x;
            startY = e.pointer.y;

            if (activeTool === 'lasso') {
                lassoPoints = [new Point(startX, startY)];
            }
        };

        const handleMouseMove = (e: any) => {
            if (!isDrawing || !e.pointer) return;

            if (activeTool === 'rectangle') {
                // Remove temporary preview
                if (activeSelectionRef.current) {
                    canvas.remove(activeSelectionRef.current);
                }

                const width = e.pointer.x - startX;
                const height = e.pointer.y - startY;

                activeSelectionRef.current = new Rect({
                    left: width >= 0 ? startX : e.pointer.x,
                    top: height >= 0 ? startY : e.pointer.y,
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
                lassoPoints.push(new Point(e.pointer.x, e.pointer.y));

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

        const mimeType = baseImage.format === 'jpg' || baseImage.format === 'jpeg'
            ? 'image/jpeg'
            : baseImage.format === 'webp'
                ? 'image/webp'
                : 'image/png';

        const dataUrl = `data:${mimeType};base64,${baseImage.data}`;

        FabricImage.fromURL(dataUrl)
            .then((img) => {
                canvas.remove(...canvas.getObjects());

                canvas.setZoom(1);

                const scaleX = (canvas.width! * 0.9) / img.width!;
                const scaleY = (canvas.height! * 0.9) / img.height!;
                const scale = Math.min(scaleX, scaleY);

                img.scale(scale);

                const scaledWidth = img.width! * scale;
                const scaledHeight = img.height! * scale;

                const centerX = (canvas.width! - scaledWidth) / 2;
                const centerY = (canvas.height! - scaledHeight) / 2;

                img.set({
                    left: centerX,
                    top: centerY,
                    selectable: false,
                    evented: false,
                });

                canvas.add(img);
                canvas.renderAll();

                setZoom(100);
            })
            .catch((err) => {
                console.error('Failed to load image:', err);
            });
    }, [baseImage, setZoom]);

    // Apply zoom changes from store
    useEffect(() => {
        if (!fabricRef.current) return;
        fabricRef.current.setZoom(zoom / 100);
        fabricRef.current.renderAll();
    }, [zoom]);

    return (
        <div className="canvas-wrapper">
            <canvas ref={canvasRef} />
        </div>
    );
}
