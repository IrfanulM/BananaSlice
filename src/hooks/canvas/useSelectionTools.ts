// Selection Tools Hook
// Handles rectangle and lasso selection drawing

import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import { Canvas as FabricCanvas, Rect, Polyline, Point } from 'fabric';
import { SELECTION_STYLE_DRAWING, SELECTION_STYLE_COMPLETE, createRenderedSelection } from '../../utils/selectionStyle';
import { douglasPeucker } from '../../utils/contourTracer';
import { useToolStore } from '../../store/toolStore';
import { useSelectionStore } from '../../store/selectionStore';

interface UseSelectionToolsOptions {
    fabricRef: MutableRefObject<FabricCanvas | null>;
    activeSelectionRef: MutableRefObject<any>;
}

export function useSelectionTools({
    fabricRef,
    activeSelectionRef,
}: UseSelectionToolsOptions) {
    const { activeTool } = useToolStore();
    const { setActiveSelection } = useSelectionStore();

    useEffect(() => {
        if (!fabricRef.current) return;
        const canvas = fabricRef.current;

        // Only activate for selection tools
        if (activeTool !== 'rectangle' && activeTool !== 'lasso') return;

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

        // Helper to get pointer coordinates in canvas object space
        const getCanvasPointer = (e: any): { x: number; y: number } | null => {
            if (!e.e) return null;
            const pointer = canvas.getScenePoint(e.e);
            return { x: pointer.x, y: pointer.y };
        };

        const handleMouseDown = (e: any) => {
            if (activeTool !== 'rectangle' && activeTool !== 'lasso') return;

            const pointer = getCanvasPointer(e);
            if (!pointer) return;

            // Clear any existing selection before starting new one
            clearSelection();
            setActiveSelection(null);

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
                    ...SELECTION_STYLE_DRAWING,
                });

                canvas.add(activeSelectionRef.current);
                canvas.renderAll();
            } else if (activeTool === 'lasso') {
                lassoPoints.push(new Point(pointer.x, pointer.y));

                // Remove temporary preview
                if (activeSelectionRef.current) {
                    canvas.remove(activeSelectionRef.current);
                }

                // Use basic Polyline for drawing preview (recreated every frame)
                activeSelectionRef.current = new Polyline(lassoPoints, {
                    ...SELECTION_STYLE_DRAWING,
                });

                canvas.add(activeSelectionRef.current);
                canvas.renderAll();
            }
        };

        const handleMouseUp = () => {
            if (!isDrawing) return;

            // For lasso: simplify and render as bitmap (same as smart selection)
            if (activeTool === 'lasso' && lassoPoints.length >= 3) {
                // Remove the drawing preview
                if (activeSelectionRef.current) {
                    canvas.remove(activeSelectionRef.current);
                    activeSelectionRef.current = null;
                }

                const rawPoints = lassoPoints.map(p => ({ x: p.x, y: p.y }));
                const simplified = douglasPeucker(rawPoints, 3.0);

                activeSelectionRef.current = createRenderedSelection(simplified, true);
                canvas.add(activeSelectionRef.current);
            } else if (activeSelectionRef.current) {
                // Rectangle: just add the fill
                activeSelectionRef.current.set({
                    fill: SELECTION_STYLE_COMPLETE.fill,
                });
            }

            if (activeSelectionRef.current) {
                canvas.renderAll();
                setActiveSelection(activeSelectionRef.current);
            }

            isDrawing = false;
            lassoPoints = [];
        };

        canvas.on('mouse:down', handleMouseDown);
        canvas.on('mouse:move', handleMouseMove);
        canvas.on('mouse:up', handleMouseUp);

        return () => {
            canvas.off('mouse:down', handleMouseDown);
            canvas.off('mouse:move', handleMouseMove);
            canvas.off('mouse:up', handleMouseUp);
        };
    }, [activeTool, fabricRef, activeSelectionRef, setActiveSelection]);
}
