import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadProject } from '../projectManager';
import { useCanvasStore } from '../../store/canvasStore';
import { useLayerStore } from '../../store/layerStore';

// Mock Tauri plugins
vi.mock('@tauri-apps/plugin-dialog', () => ({
    open: vi.fn(),
    save: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
    readTextFile: vi.fn(),
    writeTextFile: vi.fn(),
}));

describe('Project Manager - Persistence Integrity', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useCanvasStore.getState().clearImage();
        useLayerStore.getState().clearLayers();
    });

    it('should correctly restore state from a project file', async () => {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const { readTextFile } = await import('@tauri-apps/plugin-fs');

        const mockProjectData = {
            version: '1.0',
            meta: { appName: 'BananaSlice', createdAt: 123456789 },
            canvas: { zoom: 150, panX: 10, panY: 20 },
            baseImage: { width: 500, height: 500, format: 'png', data: 'BASE64_DATA' },
            layers: [
                { id: 'l1', name: 'Background', type: 'base', visible: true, opacity: 100, order: 0, x: 0, y: 0, width: 500, height: 500, imageData: '...' }
            ]
        };

        (open as any).mockResolvedValue('/path/to/project.banslice');
        (readTextFile as any).mockResolvedValue(JSON.stringify(mockProjectData));

        const result = await loadProject();

        expect(result.success).toBe(true);

        // Verify store states were updated
        const canvasState = useCanvasStore.getState();
        expect(canvasState.zoom).toBe(150);
        expect(canvasState.panX).toBe(10);
        expect(canvasState.baseImage?.data).toBe('BASE64_DATA');

        const layerState = useLayerStore.getState();
        expect(layerState.layers.length).toBe(1);
        expect(layerState.layers[0].id).toBe('l1');
    });

    it('should fail gracefully for invalid project files', async () => {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const { readTextFile } = await import('@tauri-apps/plugin-fs');

        (open as any).mockResolvedValue('/path/to/invalid.json');
        (readTextFile as any).mockResolvedValue(JSON.stringify({ meta: { appName: 'WrongApp' } }));

        const result = await loadProject();

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid project file');
    });
});
