// Keyboard Shortcuts Hook
// Centralizes all keyboard shortcut handling

import { useEffect } from 'react';
import { useToolStore } from '../store/toolStore';
import { useCanvasStore } from '../store/canvasStore';
import { useSelectionStore } from '../store/selectionStore';
import { useHistoryStore } from '../store/historyStore';

interface UseKeyboardShortcutsOptions {
    isProject: boolean;
    hasImage: boolean;
    onQuickSave: () => Promise<void>;
    onSaveProject: () => Promise<void>;
}

export function useKeyboardShortcuts({
    isProject,
    hasImage,
    onQuickSave,
    onSaveProject,
}: UseKeyboardShortcutsOptions) {
    const { setActiveTool } = useToolStore();
    const { zoomIn, zoomOut } = useCanvasStore();
    const { clearSelection } = useSelectionStore();
    const { undo, redo } = useHistoryStore();

    useEffect(() => {
        const handleKeyDown = async (e: KeyboardEvent) => {
            // Don't trigger shortcuts when typing in inputs
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
                return;
            }

            // Save shortcuts: Ctrl+S
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (isProject) {
                    await onQuickSave();
                } else if (hasImage) {
                    await onSaveProject();
                }
            }

            // Undo: Ctrl+Z
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            }

            // Redo: Ctrl+Y or Ctrl+Shift+Z
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                redo();
            }

            // Tool shortcuts (only when not holding modifier keys)
            if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                switch (e.key.toLowerCase()) {
                    case 'v':
                        setActiveTool('move');
                        break;
                    case 'm':
                        setActiveTool('rectangle');
                        break;
                    case 'l':
                        setActiveTool('lasso');
                        break;
                    case 'u':
                        setActiveTool('shape-rect');
                        break;
                    case 'o':
                        setActiveTool('shape-ellipse');
                        break;
                    case 'd':
                        // Deselect - clear selection
                        clearSelection();
                        break;
                    case '=':
                    case '+':
                        // Zoom in
                        e.preventDefault();
                        zoomIn();
                        break;
                    case '-':
                    case '_':
                        // Zoom out
                        e.preventDefault();
                        zoomOut();
                        break;
                }
            }
        };
        
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isProject, hasImage, setActiveTool, clearSelection, zoomIn, zoomOut, undo, redo, onQuickSave, onSaveProject]);
}
