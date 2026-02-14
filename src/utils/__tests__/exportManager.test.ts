
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportImage } from '../exportManager';
import { useLayerStore } from '../../store/layerStore';
import { useCanvasStore } from '../../store/canvasStore';
import * as layerCompositor from '../layerCompositor';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

// Mock dependencies
vi.mock('@tauri-apps/plugin-dialog');
vi.mock('@tauri-apps/plugin-fs');
vi.mock('../../store/layerStore');
vi.mock('../../store/canvasStore');
vi.mock('../layerCompositor');

describe('exportImage - Feathering Logic', () => {
    const mockComposite = vi.spyOn(layerCompositor, 'applyLayerFeathering');
    const mockSharpMask = vi.spyOn(layerCompositor, 'applySharpPolygonMask');

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Setup default mocks
        (save as any).mockResolvedValue('test.png');
        (writeFile as any).mockResolvedValue(undefined);
        
        // Mock canvas store
        (useCanvasStore.getState as any).mockReturnValue({
            baseImage: {
                width: 100,
                height: 100,
                format: 'png',
                data: 'base_image_data'
            },
            imagePath: 'test.banslice'
        });
    });

    it('should apply feathering when featherRadius > 0', async () => {
        // Mock layer store with a feathered layer
        (useLayerStore.getState as any).mockReturnValue({
            layers: [
                { type: 'base', visible: true, id: 'base' },
                {
                    id: 'layer1',
                    type: 'layer',
                    visible: true,
                    opacity: 100,
                    imageData: 'raw_data',
                    originalImageData: 'original_data',
                    featherRadius: 10,  // TRIGGER FEATHERING
                    polygonPoints: []
                }
            ]
        });

        mockComposite.mockResolvedValue('feathered_data');

        await exportImage({ format: 'png' });

        expect(mockComposite).toHaveBeenCalledTimes(1);
        expect(mockSharpMask).not.toHaveBeenCalled();
    });

    it('should apply sharp mask when featherRadius is 0 but has polygon points', async () => {
        // Mock layer store with a lasso layer (0 feather)
        (useLayerStore.getState as any).mockReturnValue({
            layers: [
                { type: 'base', visible: true, id: 'base' },
                {
                    id: 'layer1',
                    type: 'layer',
                    visible: true,
                    opacity: 100,
                    imageData: 'raw_data',
                    originalImageData: 'original_data',
                    featherRadius: 0,
                    polygonPoints: [{x:0, y:0}, {x:10, y:0}, {x:0, y:10}] // TRIGGER SHARP MASK
                }
            ]
        });

        mockSharpMask.mockResolvedValue('masked_data');

        await exportImage({ format: 'png' });

        expect(mockSharpMask).toHaveBeenCalledTimes(1);
        expect(mockComposite).not.toHaveBeenCalled(); // Should skip feathering
    });

    it('should use originalImageData raw when no feathering and no polygon points', async () => {
        // Mock layer store with a standard rectangle layer
        (useLayerStore.getState as any).mockReturnValue({
            layers: [
                { type: 'base', visible: true, id: 'base' },
                {
                    id: 'layer1',
                    type: 'layer',
                    visible: true,
                    opacity: 100,
                    imageData: 'raw_data',
                    originalImageData: 'original_data',
                    featherRadius: 0,
                    polygonPoints: [] // NO POLYGON
                }
            ]
        });

        await exportImage({ format: 'png' });

        // Should call neither processing function
        expect(mockComposite).not.toHaveBeenCalled();
        expect(mockSharpMask).not.toHaveBeenCalled();
    });
});
