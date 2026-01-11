// Window Management Hook
// Handles window title updates and close confirmation

import { useEffect, useState } from 'react';
import { getCurrentWindow, type CloseRequestedEvent } from '@tauri-apps/api/window';
import { useCanvasStore } from '../store/canvasStore';
import { useHistoryStore } from '../store/historyStore';
import { useProjectsStore } from '../store/projectsStore';

export function useWindowManagement() {
    const [closeConfirmDialog, setCloseConfirmDialog] = useState(false);

    const { baseImage, imagePath } = useCanvasStore();
    const isDirty = useHistoryStore(state => state.isDirty);
    const { saveCurrentProjectState } = useProjectsStore();

    // Update window title dynamically (with asterisk for unsaved changes)
    useEffect(() => {
        const setWindowTitle = async () => {
            const window = getCurrentWindow();
            const unsavedMarker = isDirty ? '*' : '';

            if (!baseImage) {
                // Nothing open
                await window.setTitle('BananaSlice');
            } else if (imagePath?.endsWith('.banslice')) {
                // Project file is open - extract project name from path
                const fileName = imagePath.split(/[\\\\/]/).pop() || 'Untitled Project';
                const projectName = fileName.replace('.banslice', '');
                await window.setTitle(`${unsavedMarker}${projectName} | BananaSlice`);
            } else {
                // Raw image is open
                await window.setTitle(`${unsavedMarker}Untitled Project | BananaSlice`);
            }
        };

        setWindowTitle().catch(console.error);
    }, [baseImage, imagePath, isDirty]);

    // Handle close request with unsaved changes check
    useEffect(() => {
        const appWindow = getCurrentWindow();

        const unlisten = appWindow.onCloseRequested((event: CloseRequestedEvent) => {
            // Save current project state first
            saveCurrentProjectState();

            // Check if any project has unsaved changes
            const projectsState = useProjectsStore.getState();
            let anyUnsaved = false;

            for (const [id] of projectsState.projects) {
                if (projectsState.hasUnsavedChanges(id)) {
                    anyUnsaved = true;
                    break;
                }
            }

            if (anyUnsaved) {
                event.preventDefault();
                setCloseConfirmDialog(true);
            }
        });

        return () => {
            unlisten.then(fn => fn());
        };
    }, [saveCurrentProjectState]);

    const handleConfirmClose = async () => {
        setCloseConfirmDialog(false);
        const appWindow = getCurrentWindow();
        await appWindow.destroy();
    };

    const handleCancelClose = () => {
        setCloseConfirmDialog(false);
    };

    return {
        closeConfirmDialog,
        handleConfirmClose,
        handleCancelClose,
    };
}
