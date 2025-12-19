import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compositeLayersInBrowser } from '../layerCompositor';
import type { Layer } from '../../types';

describe('Layer Compositor - Integrity', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should respect layer visibility and order', async () => {
        const layers: Layer[] = [
            {
                id: '1',
                name: 'Bottom',
                type: 'base',
                imageData: 'iVBOR...',
                visible: true,
                opacity: 100,
                order: 0,
                x: 0, y: 0, width: 100, height: 100
            },
            {
                id: '2',
                name: 'Middle (Hidden)',
                type: 'shape',
                imageData: 'iVBOR...',
                visible: false,
                opacity: 100,
                order: 1,
                x: 0, y: 0, width: 100, height: 100
            },
            {
                id: '3',
                name: 'Top',
                type: 'shape',
                imageData: 'iVBOR...',
                visible: true,
                opacity: 50,
                order: 2,
                x: 10, y: 10, width: 50, height: 50
            }
        ];

        const ctx = document.createElement('canvas').getContext('2d')!;

        await compositeLayersInBrowser(layers, 100, 100);

        // Filtered layers should be [1, 3]
        // drawImage should be called exactly twice
        expect(ctx.drawImage).toHaveBeenCalledTimes(2);

        // First call should be bottom layer (order 0)
        // index 0 of calls
        const call0 = (ctx.drawImage as any).mock.calls[0];
        expect(call0[1]).toBe(0); // x
        expect(call0[2]).toBe(0); // y

        // Second call should be top layer (order 2)
        const call1 = (ctx.drawImage as any).mock.calls[1];
        expect(call1[1]).toBe(10); // x
        expect(call1[2]).toBe(10); // y
    });
});
