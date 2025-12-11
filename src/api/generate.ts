// API bindings for Tauri commands
import { invoke } from '@tauri-apps/api/core';
import type { AIModel } from '../types';

export interface GenerateRequest {
    model: string;
    prompt: string;
    image_base64: string;
    mask_base64: string;
}

export interface GenerateResponse {
    success: boolean;
    image_base64: string | null;
    error: string | null;
}

export interface CompositeRequest {
    base_image_base64: string;
    patch_image_base64: string;
    x: number;
    y: number;
    target_width: number;
    target_height: number;
    format: string;
}

export interface CompositeResponse {
    success: boolean;
    image_base64: string | null;
    error: string | null;
}

/**
 * Generate fill for a selected region using Nano Banana API
 */
export async function generateFill(
    model: AIModel,
    prompt: string,
    imageBase64: string,
    maskBase64: string
): Promise<GenerateResponse> {
    const request: GenerateRequest = {
        model,
        prompt,
        image_base64: imageBase64,
        mask_base64: maskBase64,
    };

    return invoke<GenerateResponse>('generate_fill', { request });
}

/**
 * Composite a generated patch back onto the base image
 */
export async function compositePatch(
    baseImageBase64: string,
    patchImageBase64: string,
    x: number,
    y: number,
    targetWidth: number,
    targetHeight: number,
    format: string = 'png'
): Promise<CompositeResponse> {
    const request: CompositeRequest = {
        base_image_base64: baseImageBase64,
        patch_image_base64: patchImageBase64,
        x,
        y,
        target_width: targetWidth,
        target_height: targetHeight,
        format,
    };

    return invoke<CompositeResponse>('composite_patch', { request });
}

// === Layer Compositing ===

export interface LayerData {
    id: string;
    image_data: string;
    visible: boolean;
    opacity: number; // 0-100
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    blend_mode?: string;
}

export interface CompositeLayersRequest {
    layers: LayerData[];
    canvas_width: number;
    canvas_height: number;
    format: string;
}

export interface CompositeLayersResponse {
    success: boolean;
    image_base64: string | null;
    error: string | null;
}

/**
 * Composite all visible layers into a single image
 */
export async function compositeLayers(
    layers: LayerData[],
    canvasWidth: number,
    canvasHeight: number,
    format: string = 'png'
): Promise<CompositeLayersResponse> {
    const request: CompositeLayersRequest = {
        layers,
        canvas_width: canvasWidth,
        canvas_height: canvasHeight,
        format,
    };

    return invoke<CompositeLayersResponse>('composite_layers', { request });
}

/**
 * Store the API key securely
 */
export async function setApiKey(apiKey: string): Promise<void> {
    return invoke('set_api_key', { apiKey });
}

/**
 * Check if API key is configured
 */
export async function hasApiKey(): Promise<boolean> {
    return invoke<boolean>('has_api_key');
}

/**
 * Delete the stored API key
 */
export async function deleteApiKey(): Promise<void> {
    return invoke('delete_api_key');
}

