import { describe, it, expect, beforeEach } from 'vitest';
import { useLayerStore } from '../layerStore';

describe('Layer Store - State Integrity', () => {
    beforeEach(() => {
        useLayerStore.getState().clearLayers();
    });

    it('should correctly reorder layers and maintain "order" property parity', () => {
        const store = useLayerStore.getState();

        // Add three layers
        store.addLayer({ name: 'Layer 1', type: 'shape', imageData: '', visible: true, opacity: 100 });
        store.addLayer({ name: 'Layer 2', type: 'shape', imageData: '', visible: true, opacity: 100 });
        store.addLayer({ name: 'Layer 3', type: 'shape', imageData: '', visible: true, opacity: 100 });

        const layersBefore = useLayerStore.getState().layers;
        expect(layersBefore[0].name).toBe('Layer 1');
        expect(layersBefore[0].order).toBe(0);
        expect(layersBefore[2].name).toBe('Layer 3');
        expect(layersBefore[2].order).toBe(2);

        // Swap Layer 1 and Layer 3 (move index 0 to index 2)
        store.reorderLayers(0, 2);

        const layersAfter = useLayerStore.getState().layers;
        expect(layersAfter[0].name).toBe('Layer 2');
        expect(layersAfter[2].name).toBe('Layer 1');

        expect(layersAfter[0].order).toBe(0);
        expect(layersAfter[1].order).toBe(1);
        expect(layersAfter[2].order).toBe(2);
    });

    it('should update active selection when removing the active layer', () => {
        const store = useLayerStore.getState();
        const id1 = store.addLayer({ name: 'L1', type: 'shape', imageData: '', visible: true, opacity: 100 });
        const id2 = store.addLayer({ name: 'L2', type: 'shape', imageData: '', visible: true, opacity: 100 });

        expect(useLayerStore.getState().activeLayerId).toBe(id2);

        store.removeLayer(id2);

        // Should fallback to id1
        expect(useLayerStore.getState().activeLayerId).toBe(id1);
    });

    it('should calculate visible layers correctly for composting', () => {
        const store = useLayerStore.getState();
        store.addLayer({ name: 'L1', type: 'shape', imageData: '', visible: true, opacity: 100 });
        store.addLayer({ name: 'L2', type: 'shape', imageData: '', visible: false, opacity: 100 });
        store.addLayer({ name: 'L3', type: 'shape', imageData: '', visible: true, opacity: 100 });

        const visible = store.getVisibleLayers();
        expect(visible.length).toBe(2);
        expect(visible[0].name).toBe('L1');
        expect(visible[1].name).toBe('L3');
    });
});
