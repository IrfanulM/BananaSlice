import { useEffect, useRef } from 'react';
import { Canvas as FabricCanvas, Image as FabricImage, Point } from 'fabric';
import { useCanvasStore } from '../store/canvasStore';

export function Canvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<FabricCanvas | null>(null);

    const {
        baseImage,
        zoom,
        panX,
        panY,
        setCursorPosition,
        setZoom,
        setPan
    } = useCanvasStore();

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
            canvas.selection = true;
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

    // Load image when baseImage changes
    useEffect(() => {
        if (!fabricRef.current || !baseImage) return;

        const canvas = fabricRef.current;

        // Determine MIME type from format
        const mimeType = baseImage.format === 'jpg' || baseImage.format === 'jpeg'
            ? 'image/jpeg'
            : baseImage.format === 'webp'
                ? 'image/webp'
                : 'image/png';

        const dataUrl = `data:${mimeType};base64,${baseImage.data}`;

        // Load image using Promise-based API (Fabric.js v6)
        FabricImage.fromURL(dataUrl)
            .then((img) => {
                // Remove all existing objects
                canvas.remove(...canvas.getObjects());

                // Reset canvas zoom to 1
                canvas.setZoom(1);

                // Calculate scale to fit image in 90% of canvas
                const scaleX = (canvas.width! * 0.9) / img.width!;
                const scaleY = (canvas.height! * 0.9) / img.height!;
                const scale = Math.min(scaleX, scaleY);

                // Apply scale to the image itself
                img.scale(scale);

                // Calculate scaled dimensions
                const scaledWidth = img.width! * scale;
                const scaledHeight = img.height! * scale;

                // Center the scaled image
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

                // Update zoom display (but canvas zoom stays at 100%)
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
