// BananaSlice - Type Definitions

// Tool types
export type Tool = 'move' | 'lasso' | 'rectangle';

// AI Model types
export type AIModel = 'nano-banana-pro' | 'nano-banana';

// Image data from backend
export interface ImageData {
    data: string; // Base64 encoded
    width: number;
    height: number;
    format: string;
}

// Application info from backend
export interface AppInfo {
    name: string;
    version: string;
}

// Bounding box for selections
export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

// Layer in the layer stack
export interface Layer {
    id: string;
    name: string;
    type: 'base' | 'edit';
    imageData: string; // Base64 encoded
    mask?: string; // Base64 encoded alpha mask
    visible: boolean;
    opacity: number;
    order: number;
}

// Generation settings for AI API
export interface GenerationSettings {
    model: AIModel;
    prompt: string;
    strength: number;
    guidance: number;
}

// Brush settings
export interface BrushSettings {
    size: number;
    hardness: number;
    feather: number;
}

// Canvas state
export interface CanvasState {
    zoom: number;
    panX: number;
    panY: number;
    cursorX: number;
    cursorY: number;
}

// Project file format
export interface ProjectFile {
    version: string;
    canvas: {
        width: number;
        height: number;
    };
    layers: Layer[];
    settings: {
        lastPrompt?: string;
        defaultStrength: number;
        defaultGuidance: number;
    };
}
