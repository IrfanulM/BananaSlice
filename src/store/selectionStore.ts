// Selection state management
import { create } from 'zustand';
import type { ProcessedSelection, ImageTransform } from '../utils/selectionProcessor';
import { processSelectionForAPI } from '../utils/selectionProcessor';
import type { SelectionData } from '../types';

interface SelectionState {
    // The active selection object reference (from Fabric.js)
    activeSelection: any | null;

    // Processed selection data ready for API
    processedSelection: ProcessedSelection | null;

    // Processing state
    isProcessing: boolean;

    // Pending restore data from undo/redo (Canvas will pick this up and re-create the visual)
    pendingRestore: SelectionData | null;

    // Actions
    setActiveSelection: (selection: any | null) => void;
    clearSelection: () => void;
    restoreSelectionData: (data: SelectionData | null) => void;
    clearPendingRestore: () => void;

    // Process the current selection for API submission
    processForAPI: (
        imageBase64: string,
        imageFormat: string,
        imageTransform: ImageTransform,
        imageWidth: number,
        imageHeight: number
    ) => Promise<ProcessedSelection | null>;
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
    activeSelection: null,
    processedSelection: null,
    isProcessing: false,
    pendingRestore: null,

    setActiveSelection: (selection) => set({
        activeSelection: selection,
        processedSelection: null, // Clear processed data when selection changes
    }),

    clearSelection: () => set({
        activeSelection: null,
        processedSelection: null
    }),

    restoreSelectionData: (data) => {
        // Clear the active selection and set the pending restore data
        // The Canvas component will handle re-creating the Fabric.js object
        set({
            activeSelection: null,
            processedSelection: null,
            pendingRestore: data,
        });
    },

    clearPendingRestore: () => set({ pendingRestore: null }),

    processForAPI: async (imageBase64, imageFormat, imageTransform, imageWidth, imageHeight) => {
        const { activeSelection } = get();

        if (!activeSelection) {
            console.warn('No active selection to process');
            return null;
        }

        set({ isProcessing: true });

        try {
            const processed = await processSelectionForAPI(
                activeSelection,
                imageBase64,
                imageFormat,
                imageTransform,
                imageWidth,
                imageHeight
            );

            set({
                processedSelection: processed,
                isProcessing: false
            });

            return processed;
        } catch (error) {
            console.error('Failed to process selection:', error);
            set({ isProcessing: false });
            return null;
        }
    },
}));

