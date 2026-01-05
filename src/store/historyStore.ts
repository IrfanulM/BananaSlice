// History Store
// Manages undo/redo state via automatic layer store subscription

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Layer } from '../types';
import { useLayerStore } from './layerStore';

export interface HistorySnapshot {
    layers: Layer[];
    activeLayerId: string | null;
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

    _recordState: (layers: Layer[], activeLayerId: string | null) => void;
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

        _recordState: (layers, activeLayerId) => {
            const { past, maxHistorySize, isTimeTraveling } = get();

            if (isTimeTraveling) return;
            if (layers.length === 0) return;

            const lastState = past[past.length - 1];
            if (lastState && !statesAreDifferent(lastState.layers, layers)) {
                return;
            }

            const snapshot: HistorySnapshot = {
                layers: cloneLayers(layers),
                activeLayerId,
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

            useLayerStore.getState().restoreLayers(
                cloneLayers(previousState.layers),
                previousState.activeLayerId
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

            useLayerStore.getState().restoreLayers(
                cloneLayers(nextState.layers),
                nextState.activeLayerId
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

useLayerStore.subscribe((state) => {
    if (state.layers === prevLayers && state.activeLayerId === prevActiveLayerId) {
        return;
    }

    prevLayers = state.layers;
    prevActiveLayerId = state.activeLayerId;

    if (debounceTimer) clearTimeout(debounceTimer);

    debounceTimer = setTimeout(() => {
        useHistoryStore.getState()._recordState(
            state.layers,
            state.activeLayerId
        );
    }, DEBOUNCE_MS);
});
