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
    useHistoryStore.getState().markSaved();
    return true;
};

// Save As - always shows dialog
export const saveProjectAs = async (): Promise<string | null> => {
    const projectData = buildProjectData();

    // Get default filename from original image or project path
    const canvasState = useCanvasStore.getState();
    const currentPath = canvasState.imagePath;
    let baseName = 'project';
    if (currentPath) {
        const pathParts = currentPath.replace(/\\/g, '/').split('/');
        const fileName = pathParts[pathParts.length - 1];
        const lastDot = fileName.lastIndexOf('.');
        baseName = lastDot !== -1 ? fileName.substring(0, lastDot) : fileName;
        // Strip _edit suffix if saving as a project
        baseName = baseName.replace(/_edit$/, '');
    }

    const filePath = await save({
        filters: [{
            name: 'BananaSlice Project',
            extensions: ['banslice']
        }],
        defaultPath: `${baseName}.banslice`
    });

    if (filePath) {
        await writeTextFile(filePath, JSON.stringify(projectData, null, 2));
        // Update the imagePath to track current project
        useCanvasStore.getState().setBaseImage(
            useCanvasStore.getState().baseImage!,
            filePath
        );
        useHistoryStore.getState().markSaved();
        return filePath;
    }

    return null;
};

// Legacy alias
export const saveProject = saveProjectAs;

export const loadProjectFromPath = async (filePath: string): Promise<{ success: boolean; error?: string; path?: string }> => {
    try {
        const content = await readTextFile(filePath);
        const data: ProjectFile = JSON.parse(content);

        if (data.meta?.appName !== 'BananaSlice') {
            return { success: false, error: 'Invalid project file' };
        }

        const canvasStore = useCanvasStore.getState();
        const layerStore = useLayerStore.getState();

        if (data.baseImage) {
            const imageData = {
                data: data.baseImage.data,
                width: data.baseImage.width,
                height: data.baseImage.height,
                format: data.baseImage.format
            };
            canvasStore.setBaseImage(imageData, filePath);
        }

        canvasStore.setZoom(data.canvas.zoom);
        canvasStore.setPan(data.canvas.panX, data.canvas.panY);

        if (data.layers && data.layers.length > 0) {
            layerStore.restoreLayers(data.layers, data.layers[0].id);
        }

        useHistoryStore.getState().reset();

        return { success: true, path: filePath };
    } catch (err) {
        console.error('Failed to load project:', err);
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
};

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

    return loadProjectFromPath(filePath);
};
