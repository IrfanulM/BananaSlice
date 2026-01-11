// Canvas Initialization and Panning Hook
// Handles Fabric.js canvas setup, zoom, pan, and resize

import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { Canvas as FabricCanvas, Image as FabricImage, Point } from 'fabric';
import { useCanvasStore } from '../../store/canvasStore';

interface UseFabricCanvasResult {
    fabricRef: MutableRefObject<FabricCanvas | null>;
    canvasRef: MutableRefObject<HTMLCanvasElement | null>;
    baseImageObjectRef: MutableRefObject<FabricImage | null>;
}

export function useFabricCanvas(): UseFabricCanvasResult {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const fabricRef = useRef<FabricCanvas | null>(null);
    const baseImageObjectRef = useRef<FabricImage | null>(null);

    const { setCursorPosition, setZoom, setPan } = useCanvasStore();

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
            wrapperEl.removeEventListener('mousedown', handleNativeMouseDown);
            window.removeEventListener('mousemove', handleNativeMouseMove);
            window.removeEventListener('mouseup', handleNativeMouseUp);
            canvas.dispose();
            fabricRef.current = null;
        };
    }, [setCursorPosition, setZoom, setPan]);

    return {
        fabricRef,
        canvasRef,
        baseImageObjectRef,
    };
}
