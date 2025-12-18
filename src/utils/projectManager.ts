import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { useCanvasStore } from '../store/canvasStore';
import { useLayerStore } from '../store/layerStore';
import { useHistoryStore } from '../store/historyStore';
import type { Layer } from '../types';

interface ProjectFile {
    version: string;
    meta: {
        appName: string;
        createdAt: number;
    };
    canvas: {
        zoom: number;
        panX: number;
        panY: number;
    };
    baseImage?: {
        width: number;
        height: number;
        format: string;
        data: string;
    };
    layers: Layer[];
}

const buildProjectData = (): ProjectFile => {
    const canvasState = useCanvasStore.getState();
    const layerState = useLayerStore.getState();

    if (!canvasState.baseImage) {
        throw new Error('No image loaded to save');
    }

    return {
        version: '1.0',
        meta: {
            appName: 'BananaSlice',
            createdAt: Date.now(),
        },
        canvas: {
            zoom: canvasState.zoom,
            panX: canvasState.panX,
            panY: canvasState.panY,
        },
        baseImage: {
            width: canvasState.baseImage.width,
            height: canvasState.baseImage.height,
            format: canvasState.baseImage.format,
            data: canvasState.baseImage.data,
        },
        layers: layerState.layers,
    };
};

// Quick save to existing project path (Ctrl+S)
export const quickSave = async (): Promise<boolean> => {
    const canvasState = useCanvasStore.getState();
    const currentPath = canvasState.imagePath;

    if (!currentPath?.endsWith('.banslice')) {
        return false;
    }

    const projectData = buildProjectData();
    await writeTextFile(currentPath, JSON.stringify(projectData, null, 2));
    return true;
};

// Save As - always shows dialog
export const saveProjectAs = async (): Promise<string | null> => {
    const projectData = buildProjectData();

    const filePath = await save({
        filters: [{
            name: 'BananaSlice Project',
            extensions: ['banslice']
        }],
        defaultPath: 'project.banslice'
    });

    if (filePath) {
        await writeTextFile(filePath, JSON.stringify(projectData, null, 2));
        // Update the imagePath to track current project
        useCanvasStore.getState().setBaseImage(
            useCanvasStore.getState().baseImage!,
            filePath
        );
        return filePath;
    }

    return null;
};

// Legacy alias
export const saveProject = saveProjectAs;

export const loadProject = async (): Promise<{ success: boolean; error?: string; path?: string }> => {
    const filePath = await open({
        filters: [{
            name: 'BananaSlice Project',
            extensions: ['banslice']
        }],
        multiple: false,
    });

    if (!filePath || typeof filePath !== 'string') {
        return { success: false };
    }

    try {
        const content = await readTextFile(filePath);
        const data: ProjectFile = JSON.parse(content);

        if (data.meta?.appName !== 'BananaSlice') {
            return { success: false, error: 'Invalid project file' };
        }

        const canvasStore = useCanvasStore.getState();
        const layerStore = useLayerStore.getState();

        // Restore base image
        if (data.baseImage) {
            const imageData = {
                data: data.baseImage.data,
                width: data.baseImage.width,
                height: data.baseImage.height,
                format: data.baseImage.format
            };
            // Use special project path to prevent App.tsx from resetting layers
            canvasStore.setBaseImage(imageData, filePath);
        }

        // Restore canvas state
        canvasStore.setZoom(data.canvas.zoom);
        canvasStore.setPan(data.canvas.panX, data.canvas.panY);

        // Restore layers immediately
        // The Canvas component will recreate fabric objects when it processes the layers
        if (data.layers && data.layers.length > 0) {
            layerStore.restoreLayers(data.layers, data.layers[0].id);
        }

        // Reset history for the new project
        useHistoryStore.getState().reset();

        return { success: true, path: filePath };
    } catch (err) {
        console.error('Failed to load project:', err);
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
};
