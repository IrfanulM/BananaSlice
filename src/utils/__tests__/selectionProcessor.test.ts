import { describe, it, expect } from 'vitest';
import { transformToImageSpace } from '../selectionProcessor';

describe('Selection Processor - Coordinate Math', () => {
    it('should correctly map canvas selection to 1:1 image pixels (1.0 scale)', () => {
        const canvasBounds = { x: 100, y: 100, width: 200, height: 200 };
        const imageTransform = { left: 50, top: 50, scaleX: 1, scaleY: 1 };
        const imageWidth = 1000;
        const imageHeight = 1000;

        const result = transformToImageSpace(canvasBounds, imageTransform, imageWidth, imageHeight);
        expect(result.x).toBe(50);
        expect(result.y).toBe(50);
        expect(result.width).toBe(200);
        expect(result.height).toBe(200);
    });

    it('should correctly handle zoomed canvas (e.g. 2.0x zoom)', () => {
        const canvasBounds = { x: 200, y: 200, width: 400, height: 400 };
        const imageTransform = { left: 0, top: 0, scaleX: 2, scaleY: 2 };
        const imageWidth = 1000;
        const imageHeight = 1000;

        const result = transformToImageSpace(canvasBounds, imageTransform, imageWidth, imageHeight);
        expect(result.x).toBe(100);
        expect(result.y).toBe(100);
        expect(result.width).toBe(200);
        expect(result.height).toBe(200);
    });

    it('should clip selection to image boundaries', () => {
        const canvasBounds = { x: -100, y: -100, width: 500, height: 500 };
        const imageTransform = { left: 0, top: 0, scaleX: 1, scaleY: 1 };
        const imageWidth = 200;
        const imageHeight = 200;

        const result = transformToImageSpace(canvasBounds, imageTransform, imageWidth, imageHeight);

        expect(result.x).toBe(0);
        expect(result.y).toBe(0);
        expect(result.width).toBe(200);
        expect(result.height).toBe(200);
    });

    it('should handle sub-pixel offsets with floor/ceil logic to avoid gaps', () => {
        const canvasBounds = { x: 10.5, y: 10.5, width: 100.2, height: 100.2 };
        const imageTransform = { left: 0, top: 0, scaleX: 1, scaleY: 1 };
        const imageWidth = 1000;
        const imageHeight = 1000;

        const result = transformToImageSpace(canvasBounds, imageTransform, imageWidth, imageHeight);

        expect(result.x).toBe(10);
        expect(result.width).toBe(101);
    });
});
