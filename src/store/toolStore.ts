// BananaSlice - Tool Store
// Manages active tool and tool settings

import { create } from 'zustand';
import type { Tool, BrushSettings } from '../types';

interface ToolState {
    // Active tool
    activeTool: Tool;

    // Brush settings
    brushSettings: BrushSettings;
    brushSize: number;
    brushHardness: number;
    brushFeather: number;

    // Actions
    setTool: (tool: Tool) => void;
    setActiveTool: (tool: Tool) => void;
    setBrushSize: (size: number) => void;
    setBrushHardness: (hardness: number) => void;
    setBrushFeather: (feather: number) => void;
}

export const useToolStore = create<ToolState>((set, get) => ({
    // Initial state
    activeTool: 'move',

    brushSettings: {
        size: 50,
        hardness: 100,
        feather: 10,
    },

    brushSize: 50,
    brushHardness: 100,
    brushFeather: 10,

    // Actions
    setTool: (tool) => set({ activeTool: tool }),

    setActiveTool: (tool) => set({ activeTool: tool }),

    setBrushSize: (size) =>
        set((state) => ({
            brushSettings: { ...state.brushSettings, size },
            brushSize: size,
        })),

    setBrushHardness: (hardness) =>
        set((state) => ({
            brushSettings: { ...state.brushSettings, hardness },
            brushHardness: hardness,
        })),

    setBrushFeather: (feather) =>
        set((state) => ({
            brushSettings: { ...state.brushSettings, feather },
            brushFeather: feather,
        })),
}));
