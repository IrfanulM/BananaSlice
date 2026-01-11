// Drag and Drop Hook
// Handles file drag and drop from the system

import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCanvasStore } from '../store/canvasStore';
import { useProjectsStore } from '../store/projectsStore';
import { useRecentFilesStore } from '../store/recentFilesStore';
import { toast } from '../store/toastStore';
import { loadProjectFromPath } from '../utils/projectManager';

interface UseDragDropOptions {
    isGenerating: boolean;
    referenceImages: string[];
    setReferenceImages: (images: string[]) => void;
}

const supportedImageExtensions = ['png', 'jpg', 'jpeg', 'webp'];

export function useDragDrop({ isGenerating, referenceImages, setReferenceImages }: UseDragDropOptions) {
    const [dragHoverSlot, setDragHoverSlot] = useState<number | null>(null);
    
    const { baseImage, loadImage } = useCanvasStore();
    const { addRecentFile } = useRecentFilesStore();

    useEffect(() => {
        const appWindow = getCurrentWindow();

        const findReferenceSlot = (x: number, y: number): number | null => {
            const element = document.elementFromPoint(x, y);
            if (!element) return null;

            const slot = element.closest('[data-reference-slot]');
            if (slot) {
                const index = slot.getAttribute('data-reference-slot');
                return index !== null ? parseInt(index, 10) : null;
            }
            return null;
        };

        const loadImageAsBase64 = async (filePath: string): Promise<string | null> => {
            try {
                const { readFile } = await import('@tauri-apps/plugin-fs');
                const bytes = await readFile(filePath);
                const base64 = btoa(
                    Array.from(bytes)
                        .map(byte => String.fromCharCode(byte))
                        .join('')
                );
                return base64;
            } catch (err) {
                console.error('Failed to read image file:', err);
                return null;
            }
        };

        const unlisten = appWindow.onDragDropEvent(async (event) => {
            const eventType = event.payload.type;

            // Handle hover events to show visual feedback
            if (eventType === 'over') {
                const pos = event.payload.position;
                const slotIndex = findReferenceSlot(pos.x, pos.y);
                setDragHoverSlot(slotIndex);
                return;
            }

            // Clear hover state on leave
            if (eventType === 'leave') {
                setDragHoverSlot(null);
                return;
            }

            if (eventType !== 'drop') return;

            // Clear hover state on drop
            setDragHoverSlot(null);

            const paths = event.payload.paths;
            if (!paths || paths.length === 0) return;

            const filePath = paths[0];
            const extension = filePath.split('.').pop()?.toLowerCase() || '';
            const dropPosition = event.payload.position;

            // Check if dropping on a reference image slot
            if (supportedImageExtensions.includes(extension) && dropPosition) {
                const slotIndex = findReferenceSlot(dropPosition.x, dropPosition.y);
                if (slotIndex !== null) {
                    const base64 = await loadImageAsBase64(filePath);
                    if (base64) {
                        const newImages = [...referenceImages];
                        while (newImages.length < 3) {
                            newImages.push('');
                        }
                        newImages[slotIndex] = base64;
                        setReferenceImages(newImages);
                        toast.success('Reference image added');
                    }
                    return;
                }
            }

            if (isGenerating) {
                toast.warning('Cannot open files while generating');
                return;
            }

            if (extension === 'banslice') {
                const projectsState = useProjectsStore.getState();
                const existingId = projectsState.findProjectByPath(filePath);
                if (existingId) {
                    projectsState.switchProject(existingId);
                    toast.info('Project is already open');
                    return;
                }

                const needsNewTab = projectsState.tabOrder.length === 0 || baseImage;
                const previousActiveId = projectsState.activeProjectId;

                if (needsNewTab) {
                    projectsState.createProject();
                }

                loadProjectFromPath(filePath).then(result => {
                    if (result.success) {
                        toast.success('Project loaded');
                        if (result.path) {
                            addRecentFile(result.path, 'project');
                            const fileName = result.path.split(/[/\\]/).pop()?.replace('.banslice', '') || 'Untitled';
                            const currentId = useProjectsStore.getState().activeProjectId;
                            if (currentId) {
                                useProjectsStore.getState().updateProjectName(currentId, fileName);
                            }
                        }
                    } else {
                        if (needsNewTab && previousActiveId) {
                            useProjectsStore.getState().forceCloseProject(useProjectsStore.getState().activeProjectId!);
                        }
                        if (result.error) {
                            toast.error(`Failed to load project: ${result.error}`);
                        }
                    }
                });
            } else if (supportedImageExtensions.includes(extension)) {
                const projectsState = useProjectsStore.getState();
                const existingId = projectsState.findProjectByPath(filePath);
                if (existingId) {
                    projectsState.switchProject(existingId);
                    toast.info('Image is already open');
                    return;
                }

                const needsNewTab = projectsState.tabOrder.length === 0 || baseImage;
                const previousActiveId = projectsState.activeProjectId;

                if (needsNewTab) {
                    projectsState.createProject();
                }

                loadImage(filePath).then(() => {
                    addRecentFile(filePath, 'image');
                    toast.success('Image loaded');
                    const fileName = filePath.split(/[/\\]/).pop() || 'Untitled';
                    const currentId = useProjectsStore.getState().activeProjectId;
                    if (currentId) {
                        useProjectsStore.getState().updateProjectName(currentId, fileName);
                    }
                }).catch(err => {
                    if (needsNewTab && previousActiveId) {
                        useProjectsStore.getState().forceCloseProject(useProjectsStore.getState().activeProjectId!);
                    }
                    toast.error(`Failed to load image: ${err.message || 'Unknown error'}`);
                });
            } else {
                toast.error('Unsupported file type. Drop an image (PNG, JPG, WebP) or project (.banslice)');
            }
        });

        return () => {
            unlisten.then(fn => fn());
        };
    }, [loadImage, addRecentFile, referenceImages, setReferenceImages, baseImage, isGenerating]);

    return {
        dragHoverSlot,
    };
}
