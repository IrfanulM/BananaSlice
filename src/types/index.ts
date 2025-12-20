// BananaSlice - Type Definitions

// Tool types
export type Tool = 'move' | 'lasso' | 'rectangle' | 'shape-rect' | 'shape-ellipse';

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
    type: 'base' | 'edit' | 'shape';
    imageData: string; // Base64 encoded
    mask?: string; // Base64 encoded alpha mask
    visible: boolean;
    opacity: number; // 0-100
    order: number;
    // Position for patch layers (edit layers are positioned patches)
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    // Polygon points for lasso selections (relative to layer x,y)
    polygonPoints?: { x: number; y: number }[];
    // Edge feathering radius in pixels
    featherRadius?: number;
    // Original unmasked image for dynamic feathering
    originalImageData?: string;
    // Blend mode
    blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay';
    // Shape properties
    shapeType?: 'rect' | 'ellipse';
    fillColor?: string;
}

// Generation request for Nano Banana API
export interface GenerationRequest {
    model: AIModel;
    prompt: string;
    imageBase64: string;
    maskBase64: string;
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
    };
}
