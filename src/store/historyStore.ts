// History Store
// Manages undo/redo state via automatic layer store subscription

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Layer, SelectionData } from '../types';
import { useLayerStore } from './layerStore';
import { useSelectionStore } from './selectionStore';

export interface HistorySnapshot {
    layers: Layer[];
    activeLayerId: string | null;
    selectionData: SelectionData | null;
    timestamp: number;
}

interface HistoryState {
    past: HistorySnapshot[];
    future: HistorySnapshot[];
    maxHistorySize: number;
    isTimeTraveling: boolean;

    undo: () => void;
    redo: () => void;
    canUndo: () => boolean;
    canRedo: () => boolean;
    isDirty: boolean;
    markSaved: () => void;
    reset: () => void;
    restoreState: (past: HistorySnapshot[], future: HistorySnapshot[], isDirty: boolean) => void;

    _recordState: (layers: Layer[], activeLayerId: string | null, selectionData: SelectionData | null) => void;
    _setTimeTraveling: (value: boolean) => void;
}

const cloneLayers = (layers: Layer[]): Layer[] => {
    return JSON.parse(JSON.stringify(layers));
};

const statesAreDifferent = (a: Layer[], b: Layer[]): boolean => {
    if (a.length !== b.length) return true;

    for (let i = 0; i < a.length; i++) {
        const layerA = a[i];
        const layerB = b[i];

        if (
            layerA.id !== layerB.id ||
            layerA.visible !== layerB.visible ||
            layerA.opacity !== layerB.opacity ||
            layerA.order !== layerB.order ||
            layerA.name !== layerB.name ||
            layerA.x !== layerB.x ||
            layerA.y !== layerB.y ||
            layerA.width !== layerB.width ||
            layerA.height !== layerB.height ||
            layerA.imageData !== layerB.imageData
        ) {
            return true;
        }
    }

    return false;
};

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 100;

export const useHistoryStore = create<HistoryState>()(
    subscribeWithSelector((set, get) => ({
        past: [],
        future: [],
        maxHistorySize: 50,
        isTimeTraveling: false,
        isDirty: false,

        _recordState: (layers, activeLayerId, selectionData) => {
            const { past, maxHistorySize, isTimeTraveling } = get();

            if (isTimeTraveling) return;
            if (layers.length === 0) return;

            const lastState = past[past.length - 1];
            // Check if both layers AND selection are the same
            const layersSame = lastState && !statesAreDifferent(lastState.layers, layers);
            const selSame = JSON.stringify(lastState?.selectionData ?? null) === JSON.stringify(selectionData);
            if (layersSame && selSame) {
                return;
            }

            const snapshot: HistorySnapshot = {
                layers: cloneLayers(layers),
                activeLayerId,
                selectionData: selectionData ? JSON.parse(JSON.stringify(selectionData)) : null,
                timestamp: Date.now(),
            };

            let newPast = [...past, snapshot];

            if (newPast.length > maxHistorySize) {
                newPast = newPast.slice(newPast.length - maxHistorySize);
            }

            set({
                past: newPast,
                future: [],
                isDirty: past.length > 0,
            });
        },

        markSaved: () => {
            set({ isDirty: false });
        },

        _setTimeTraveling: (value) => {
            set({ isTimeTraveling: value });
        },

        undo: () => {
            const { past, future } = get();

            if (past.length < 2) return;

            get()._setTimeTraveling(true);

            const newPast = [...past];
            const currentState = newPast.pop()!;
            const previousState = newPast[newPast.length - 1];

            // Preserve current layer panel selection
            const currentActiveLayer = useLayerStore.getState().activeLayerId;
            useLayerStore.getState().restoreLayers(
                cloneLayers(previousState.layers),
                currentActiveLayer
            );

            // Restore selection state
            useSelectionStore.getState().restoreSelectionData(
                previousState.selectionData ?? null
            );

            set({
                past: newPast,
                future: [currentState, ...future],
            });

            setTimeout(() => get()._setTimeTraveling(false), 50);
        },

        redo: () => {
            const { past, future } = get();

            if (future.length === 0) return;

            get()._setTimeTraveling(true);

            const [nextState, ...newFuture] = future;

            // Preserve current layer panel selection
            const currentActiveLayer = useLayerStore.getState().activeLayerId;
            useLayerStore.getState().restoreLayers(
                cloneLayers(nextState.layers),
                currentActiveLayer
            );

            // Restore selection state
            useSelectionStore.getState().restoreSelectionData(
                nextState.selectionData ?? null
            );

            set({
                past: [...past, nextState],
                future: newFuture,
            });

            setTimeout(() => get()._setTimeTraveling(false), 50);
        },

        canUndo: () => get().past.length >= 2,

        canRedo: () => get().future.length > 0,

        reset: () => {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }
            set({ past: [], future: [], isTimeTraveling: false, isDirty: false });
        },

        restoreState: (past, future, isDirty) => {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }
            set({ past, future, isDirty, isTimeTraveling: false });
        },
    }))
);


let prevLayers: Layer[] = [];
let prevActiveLayerId: string | null = null;
let prevSelectionData: SelectionData | null = null;

/** Extract serializable selection data from the active selection Fabric object */
function captureSelectionData(): SelectionData | null {
    const sel = useSelectionStore.getState().activeSelection;
    if (!sel) return null;

    // Polygon-based selection (lasso / smart-select)
    if (sel._isSelectionImage && sel.data?.polygonPoints) {
        return {
            type: 'polygon',
            points: sel.data.polygonPoints.map((pt: any) => ({ x: pt.x, y: pt.y })),
        };
    }

    // Rectangle selection
    if (sel.type === 'rect') {
        return {
            type: 'rect',
            left: sel.left,
            top: sel.top,
            width: sel.width * (sel.scaleX || 1),
            height: sel.height * (sel.scaleY || 1),
        };
    }

    return null;
}

const triggerRecord = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        const layerState = useLayerStore.getState();
        const selData = captureSelectionData();
        useHistoryStore.getState()._recordState(
            layerState.layers,
            layerState.activeLayerId,
            selData
        );
    }, DEBOUNCE_MS);
};

useLayerStore.subscribe((state) => {
    if (state.layers === prevLayers && state.activeLayerId === prevActiveLayerId) {
        return;
    }
    prevLayers = state.layers;
    prevActiveLayerId = state.activeLayerId;
    triggerRecord();
});

useSelectionStore.subscribe((_state) => {
    const selData = captureSelectionData();
    const selStr = JSON.stringify(selData);
    const prevStr = JSON.stringify(prevSelectionData);
    if (selStr === prevStr) return;
    prevSelectionData = selData;
    triggerRecord();
});
