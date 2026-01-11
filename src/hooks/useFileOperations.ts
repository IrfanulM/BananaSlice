// File Operations Hook
// Handles open, save, export operations for images and projects

import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useCanvasStore } from '../store/canvasStore';
import { useProjectsStore } from '../store/projectsStore';
import { useRecentFilesStore } from '../store/recentFilesStore';
import { toast } from '../store/toastStore';
import { saveProject, loadProjectFromPath, quickSave } from '../utils/projectManager';
import { exportImage, type ExportFormat } from '../utils/exportManager';

interface UseFileOperationsOptions {
    isGenerating: boolean;
}

export function useFileOperations({ isGenerating }: UseFileOperationsOptions) {
    const [isSaving, setIsSaving] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const { baseImage, imagePath, loadImage } = useCanvasStore();
    const { addRecentFile } = useRecentFilesStore();
    const {
        createProject,
        updateProjectName,
        activeProjectId,
        tabOrder,
        switchProject,
    } = useProjectsStore();

    // Check if we're working on a saved project
    const isProject = imagePath?.endsWith('.banslice') ?? false;

    const findOpenProject = (filePath: string): string | null => {
        return useProjectsStore.getState().findProjectByPath(filePath);
    };

    const handleQuickSave = async () => {
        if (!isProject) return;
        setIsSaving(true);
        try {
            await quickSave();
            toast.success('Project saved successfully');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            toast.error(`Failed to save project: ${message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveProject = async () => {
        setIsSaving(true);
        try {
            const path = await saveProject();
            if (path) {
                const fileName = path.split(/[\\/]/).pop() || 'project';
                toast.success(`Saved as ${fileName}`);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            toast.error(`Failed to save project: ${message}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleLoadProject = async () => {
        if (isGenerating) {
            toast.warning('Cannot open files while generating');
            return;
        }

        try {
            const filePath = await open({
                filters: [{
                    name: 'BananaSlice Project',
                    extensions: ['banslice']
                }],
                multiple: false,
            });

            if (!filePath || typeof filePath !== 'string') {
                return;
            }

            const existingProjectId = findOpenProject(filePath);
            if (existingProjectId) {
                switchProject(existingProjectId);
                toast.info('Project is already open');
                return;
            }

            const needsNewTab = tabOrder.length === 0 || baseImage;
            const previousActiveId = activeProjectId;

            if (needsNewTab) {
                createProject();
            }

            const result = await loadProjectFromPath(filePath);
            if (result.success) {
                toast.success('Project loaded successfully');
                addRecentFile(filePath, 'project');
                const fileName = filePath.split(/[/\\]/).pop()?.replace('.banslice', '') || 'Untitled';
                const currentProjectId = useProjectsStore.getState().activeProjectId;
                if (currentProjectId) {
                    updateProjectName(currentProjectId, fileName);
                }
            } else {
                if (needsNewTab && previousActiveId) {
                    useProjectsStore.getState().forceCloseProject(useProjectsStore.getState().activeProjectId!);
                }
                if (result.error) {
                    toast.error(`Failed to load project: ${result.error}`);
                }
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            toast.error(`Failed to load project: ${message}`);
        }
    };

    const handleOpenImage = async () => {
        if (isGenerating) {
            toast.warning('Cannot open files while generating');
            return;
        }

        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Image',
                    extensions: ['png', 'jpg', 'jpeg', 'webp']
                }]
            });

            if (selected && typeof selected === 'string') {
                const existingProjectId = findOpenProject(selected);
                if (existingProjectId) {
                    switchProject(existingProjectId);
                    toast.info('Image is already open');
                    return;
                }

                const needsNewTab = tabOrder.length === 0 || baseImage;
                const previousActiveId = activeProjectId;

                if (needsNewTab) {
                    createProject();
                }

                try {
                    await loadImage(selected);
                    addRecentFile(selected, 'image');

                    const fileName = selected.split(/[/\\]/).pop() || 'Untitled';
                    const currentProjectId = useProjectsStore.getState().activeProjectId;
                    if (currentProjectId) {
                        updateProjectName(currentProjectId, fileName);
                    }
                } catch (loadError) {
                    if (needsNewTab && previousActiveId) {
                        useProjectsStore.getState().forceCloseProject(useProjectsStore.getState().activeProjectId!);
                    }
                    throw loadError;
                }
            }
        } catch (error) {
            console.error('Failed to open image:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            toast.error(`Failed to load image: ${message}`);
        }
    };

    const handleExport = async (format: ExportFormat) => {
        setIsExporting(true);
        try {
            const path = await exportImage({ format, quality: 92 });
            if (path) {
                const fileName = path.split(/[\\/]/).pop() || 'image';
                toast.success(`Exported as ${fileName}`);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            toast.error(`Export failed: ${message}`);
        } finally {
            setIsExporting(false);
        }
    };

    const handleOpenRecentFile = async (filePath: string, fileType: 'image' | 'project') => {
        if (isGenerating) {
            toast.warning('Cannot open files while generating');
            return;
        }

        const existingId = findOpenProject(filePath);
        if (existingId) {
            switchProject(existingId);
            toast.info('File is already open');
            return;
        }

        const needsNewTab = tabOrder.length === 0 || baseImage;
        const previousActiveId = activeProjectId;

        if (needsNewTab) {
            createProject();
        }

        try {
            if (fileType === 'project') {
                const result = await loadProjectFromPath(filePath);
                if (result.success) {
                    const fileName = filePath.split(/[/\\]/).pop()?.replace('.banslice', '') || 'Untitled';
                    updateProjectName(useProjectsStore.getState().activeProjectId!, fileName);
                } else {
                    if (needsNewTab && previousActiveId) {
                        useProjectsStore.getState().forceCloseProject(useProjectsStore.getState().activeProjectId!);
                    }
                    if (result.error) {
                        toast.error(`Failed to load project: ${result.error}`);
                    }
                }
            } else {
                await loadImage(filePath);
                const fileName = filePath.split(/[/\\]/).pop() || 'Untitled';
                updateProjectName(useProjectsStore.getState().activeProjectId!, fileName);
            }
        } catch (err) {
            if (needsNewTab && previousActiveId) {
                useProjectsStore.getState().forceCloseProject(useProjectsStore.getState().activeProjectId!);
            }
            const message = err instanceof Error ? err.message : 'Unknown error';
            toast.error(`Failed to load file: ${message}`);
        }
    };

    return {
        // State
        isSaving,
        isExporting,
        isProject,
        
        // Actions
        handleQuickSave,
        handleSaveProject,
        handleLoadProject,
        handleOpenImage,
        handleExport,
        handleOpenRecentFile,
        findOpenProject,
    };
}
