// Tool Store
// Manages active tool and tool settings

import { create } from 'zustand';
import type { Tool } from '../types';

interface ToolState {
    // Active tool
    activeTool: Tool;

    // Shape tool settings
    shapeColor: string;

    // Actions
    setTool: (tool: Tool) => void;
    setActiveTool: (tool: Tool) => void;
    setShapeColor: (color: string) => void;
}

export const useToolStore = create<ToolState>((set) => ({
    // Initial state
    activeTool: 'move',
    shapeColor: '#FFD700', // Default yellow

    // Actions
    setTool: (tool) => set({ activeTool: tool }),
    setActiveTool: (tool) => set({ activeTool: tool }),
    setShapeColor: (color) => set({ shapeColor: color }),
}));
