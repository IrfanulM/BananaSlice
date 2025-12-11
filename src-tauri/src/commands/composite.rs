// BananaSlice - Compositing Commands
// Handles compositing generated patches back onto the original image

use base64::{engine::general_purpose::STANDARD, Engine};
use image::{DynamicImage, ImageFormat};
use image::imageops::FilterType;
use serde::{Deserialize, Serialize};
use std::io::Cursor;

#[derive(Debug, Serialize, Deserialize)]
pub struct CompositeRequest {
    /// The original full image as base64
    pub base_image_base64: String,
    /// The generated patch as base64
    pub patch_image_base64: String,
    /// X position to place the patch
    pub x: u32,
    /// Y position to place the patch
    pub y: u32,
    /// Target width to resize the patch to (selection width)
    pub target_width: u32,
    /// Target height to resize the patch to (selection height)
    pub target_height: u32,
    /// Output format (png, jpg, webp)
    pub format: String,
}

#[derive(Debug, Serialize)]
pub struct CompositeResponse {
    pub success: bool,
    pub image_base64: Option<String>,
    pub error: Option<String>,
}

/// Decode base64 image to DynamicImage
fn decode_image(base64_data: &str) -> Result<DynamicImage, String> {
    let bytes = STANDARD
        .decode(base64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;
    
    image::load_from_memory(&bytes)
        .map_err(|e| format!("Failed to load image: {}", e))
}

/// Encode DynamicImage to base64
fn encode_image(img: &DynamicImage, format: &str) -> Result<String, String> {
    let mut buffer = Cursor::new(Vec::new());
    
    let image_format = match format.to_lowercase().as_str() {
        "jpg" | "jpeg" => ImageFormat::Jpeg,
        "webp" => ImageFormat::WebP,
        _ => ImageFormat::Png,
    };
    
    img.write_to(&mut buffer, image_format)
        .map_err(|e| format!("Failed to encode image: {}", e))?;
    
    Ok(STANDARD.encode(buffer.into_inner()))
}

/// Composite a patch onto the base image at the specified position
#[tauri::command]
pub fn composite_patch(request: CompositeRequest) -> CompositeResponse {
    // Decode base image
    let base_image = match decode_image(&request.base_image_base64) {
        Ok(img) => img,
        Err(e) => {
            return CompositeResponse {
                success: false,
                image_base64: None,
                error: Some(e),
            };
        }
    };
    
    // Decode patch image
    let patch_image = match decode_image(&request.patch_image_base64) {
        Ok(img) => img,
        Err(e) => {
            return CompositeResponse {
                success: false,
                image_base64: None,
                error: Some(e),
            };
        }
    };
    
    // Resize patch to match selection bounds
    let resized_patch = if request.target_width > 0 && request.target_height > 0 {
        log::info!(
            "Resizing patch from {}x{} to {}x{}",
            patch_image.width(), patch_image.height(),
            request.target_width, request.target_height
        );
        patch_image.resize_exact(
            request.target_width,
            request.target_height,
            FilterType::Lanczos3
        )
    } else {
        patch_image
    };
    
    // Convert to RGBA for compositing
    let mut result = base_image.to_rgba8();
    let patch_rgba = resized_patch.to_rgba8();
    
    // Composite the patch onto the base at (x, y)
    for (px, py, pixel) in patch_rgba.enumerate_pixels() {
        let target_x = request.x + px;
        let target_y = request.y + py;
        
        // Check bounds
        if target_x < result.width() && target_y < result.height() {
            // Alpha blending
            let base_pixel = result.get_pixel(target_x, target_y);
            let blended = alpha_blend(base_pixel, pixel);
            result.put_pixel(target_x, target_y, blended);
        }
    }
    
    // Encode result
    let result_image = DynamicImage::ImageRgba8(result);
    match encode_image(&result_image, &request.format) {
        Ok(base64) => CompositeResponse {
            success: true,
            image_base64: Some(base64),
            error: None,
        },
        Err(e) => CompositeResponse {
            success: false,
            image_base64: None,
            error: Some(e),
        },
    }
}

/// Alpha blend two RGBA pixels
fn alpha_blend(base: &image::Rgba<u8>, overlay: &image::Rgba<u8>) -> image::Rgba<u8> {
    let alpha = overlay[3] as f32 / 255.0;
    let inv_alpha = 1.0 - alpha;
    
    image::Rgba([
        ((overlay[0] as f32 * alpha) + (base[0] as f32 * inv_alpha)) as u8,
        ((overlay[1] as f32 * alpha) + (base[1] as f32 * inv_alpha)) as u8,
        ((overlay[2] as f32 * alpha) + (base[2] as f32 * inv_alpha)) as u8,
        255, // Fully opaque result
    ])
}

/// Alpha blend with layer opacity
fn alpha_blend_with_opacity(base: &image::Rgba<u8>, overlay: &image::Rgba<u8>, layer_opacity: f32) -> image::Rgba<u8> {
    let alpha = (overlay[3] as f32 / 255.0) * layer_opacity;
    let inv_alpha = 1.0 - alpha;
    
    image::Rgba([
        ((overlay[0] as f32 * alpha) + (base[0] as f32 * inv_alpha)) as u8,
        ((overlay[1] as f32 * alpha) + (base[1] as f32 * inv_alpha)) as u8,
        ((overlay[2] as f32 * alpha) + (base[2] as f32 * inv_alpha)) as u8,
        255, // Fully opaque result
    ])
}

// === Layer Compositing ===

#[derive(Debug, Serialize, Deserialize)]
pub struct LayerData {
    pub id: String,
    pub image_data: String, // base64
    pub visible: bool,
    pub opacity: u8, // 0-100
    pub x: Option<u32>,
    pub y: Option<u32>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub blend_mode: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompositeLayersRequest {
    /// All layers in order (bottom to top)
    pub layers: Vec<LayerData>,
    /// Canvas width
    pub canvas_width: u32,
    /// Canvas height  
    pub canvas_height: u32,
    /// Output format
    pub format: String,
}

#[derive(Debug, Serialize)]
pub struct CompositeLayersResponse {
    pub success: bool,
    pub image_base64: Option<String>,
    pub error: Option<String>,
}

/// Composite all visible layers into a single image
#[tauri::command]
pub fn composite_layers(request: CompositeLayersRequest) -> CompositeLayersResponse {
    // Create a transparent canvas
    let mut result = image::RgbaImage::new(request.canvas_width, request.canvas_height);
    
    // Fill with transparent black
    for pixel in result.pixels_mut() {
        *pixel = image::Rgba([0, 0, 0, 0]);
    }
    
    // Process each layer in order (bottom to top)
    for layer in request.layers.iter() {
        // Skip invisible layers
        if !layer.visible {
            continue;
        }
        
        // Decode layer image
        let layer_img = match decode_image(&layer.image_data) {
            Ok(img) => img,
            Err(e) => {
                log::warn!("Failed to decode layer {}: {}", layer.id, e);
                continue;
            }
        };
        
        let layer_rgba = layer_img.to_rgba8();
        let opacity = layer.opacity as f32 / 100.0;
        
        // Get position (default to 0,0 for base layers)
        let pos_x = layer.x.unwrap_or(0);
        let pos_y = layer.y.unwrap_or(0);
        
        // Resize if target dimensions are specified (for edit layers)
        let final_rgba = if let (Some(target_w), Some(target_h)) = (layer.width, layer.height) {
            if target_w > 0 && target_h > 0 && (target_w != layer_rgba.width() || target_h != layer_rgba.height()) {
                // Resize to target dimensions
                let resized = image::imageops::resize(
                    &layer_rgba,
                    target_w,
                    target_h,
                    image::imageops::FilterType::Lanczos3
                );
                resized
            } else {
                layer_rgba
            }
        } else {
            layer_rgba
        };
        
        // Composite layer onto result
        for (px, py, pixel) in final_rgba.enumerate_pixels() {
            let target_x = pos_x + px;
            let target_y = pos_y + py;
            
            // Check bounds
            if target_x < result.width() && target_y < result.height() {
                let base_pixel = result.get_pixel(target_x, target_y);
                let blended = alpha_blend_with_opacity(base_pixel, pixel, opacity);
                result.put_pixel(target_x, target_y, blended);
            }
        }
    }
    
    // Encode result
    let result_image = DynamicImage::ImageRgba8(result);
    match encode_image(&result_image, &request.format) {
        Ok(base64) => CompositeLayersResponse {
            success: true,
            image_base64: Some(base64),
            error: None,
        },
        Err(e) => CompositeLayersResponse {
            success: false,
            image_base64: None,
            error: Some(e),
        },
    }
}

