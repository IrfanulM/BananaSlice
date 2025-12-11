// BananaSlice - Layer Store
// Manages the layer stack for compositing edits

import { create } from 'zustand';
import type { Layer } from '../types';

interface LayerState {
    // Layer stack (bottom to top order)
    layers: Layer[];

    // Currently selected layer ID
    activeLayerId: string | null;

    // Actions
    addLayer: (layer: Omit<Layer, 'id' | 'order'>) => string;
    removeLayer: (id: string) => void;
    updateLayer: (id: string, updates: Partial<Layer>) => void;
    setActiveLayer: (id: string | null) => void;

    // Visibility & opacity
    toggleVisibility: (id: string) => void;
    setOpacity: (id: string, opacity: number) => void;

    // Reordering
    moveLayerUp: (id: string) => void;
    moveLayerDown: (id: string) => void;
    reorderLayers: (fromIndex: number, toIndex: number) => void;

    // Layer editing
    renameLayer: (id: string, name: string) => void;
    duplicateLayer: (id: string) => string | null;
    updateLayerTransform: (id: string, x: number, y: number, width: number, height: number) => void;

    // Utility
    getLayer: (id: string) => Layer | undefined;
    getVisibleLayers: () => Layer[];
    clearLayers: () => void;
    getLayersForComposite: () => Layer[];

    // Initialize with base image
    setBaseLayer: (imageData: string, width: number, height: number) => void;
}

// Generate unique layer ID
const generateId = () => `layer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const useLayerStore = create<LayerState>((set, get) => ({
    layers: [],
    activeLayerId: null,

    addLayer: (layerData) => {
        const id = generateId();
        const { layers } = get();
        const order = layers.length;

        const newLayer: Layer = {
            ...layerData,
            id,
            order,
        };

        set((state) => ({
            layers: [...state.layers, newLayer],
            activeLayerId: id,
        }));

        return id;
    },

    removeLayer: (id) => {
        set((state) => {
            const newLayers = state.layers.filter((l) => l.id !== id);
            // Recompute order
            newLayers.forEach((l, i) => (l.order = i));

            return {
                layers: newLayers,
                activeLayerId: state.activeLayerId === id
                    ? (newLayers.length > 0 ? newLayers[newLayers.length - 1].id : null)
                    : state.activeLayerId,
            };
        });
    },

    updateLayer: (id, updates) => {
        set((state) => ({
            layers: state.layers.map((l) =>
                l.id === id ? { ...l, ...updates } : l
            ),
        }));
    },

    setActiveLayer: (id) => set({ activeLayerId: id }),

    toggleVisibility: (id) => {
        set((state) => ({
            layers: state.layers.map((l) =>
                l.id === id ? { ...l, visible: !l.visible } : l
            ),
        }));
    },

    setOpacity: (id, opacity) => {
        set((state) => ({
            layers: state.layers.map((l) =>
                l.id === id ? { ...l, opacity: Math.max(0, Math.min(100, opacity)) } : l
            ),
        }));
    },

    moveLayerUp: (id) => {
        const { layers } = get();
        const index = layers.findIndex((l) => l.id === id);
        if (index < layers.length - 1) {
            get().reorderLayers(index, index + 1);
        }
    },

    moveLayerDown: (id) => {
        const { layers } = get();
        const index = layers.findIndex((l) => l.id === id);
        if (index > 0) {
            get().reorderLayers(index, index - 1);
        }
    },

    reorderLayers: (fromIndex, toIndex) => {
        set((state) => {
            const newLayers = [...state.layers];
            const [moved] = newLayers.splice(fromIndex, 1);
            newLayers.splice(toIndex, 0, moved);

            // Update order property
            newLayers.forEach((l, i) => (l.order = i));

            return { layers: newLayers };
        });
    },

    getLayer: (id) => {
        return get().layers.find((l) => l.id === id);
    },

    getVisibleLayers: () => {
        return get().layers.filter((l) => l.visible).sort((a, b) => a.order - b.order);
    },

    getLayersForComposite: () => {
        // Return all layers sorted by order (for composite_layers API)
        return [...get().layers].sort((a, b) => a.order - b.order);
    },

    renameLayer: (id, name) => {
        set((state) => ({
            layers: state.layers.map((l) =>
                l.id === id ? { ...l, name } : l
            ),
        }));
    },

    duplicateLayer: (id) => {
        const { layers } = get();
        const source = layers.find((l) => l.id === id);
        if (!source) return null;

        const newId = generateId();
        const newLayer: Layer = {
            ...source,
            id: newId,
            name: `${source.name} (copy)`,
            order: layers.length,
        };

        set((state) => ({
            layers: [...state.layers, newLayer],
            activeLayerId: newId,
        }));

        return newId;
    },

    updateLayerTransform: (id, x, y, width, height) => {
        set((state) => ({
            layers: state.layers.map((l) =>
                l.id === id ? { ...l, x, y, width, height } : l
            ),
        }));
    },

    clearLayers: () => set({ layers: [], activeLayerId: null }),

    setBaseLayer: (imageData, width, height) => {
        const id = generateId();
        const baseLayer: Layer = {
            id,
            name: 'Background',
            type: 'base',
            imageData,
            visible: true,
            opacity: 100,
            order: 0,
            x: 0,
            y: 0,
            width,
            height,
        };

        set({
            layers: [baseLayer],
            activeLayerId: id,
        });
    },
}));

