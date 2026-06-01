// BananaSlice - Generation Commands
// Tauri commands for AI image generation

use crate::api::{Model, NanoBananaClient};
use crate::keystore;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
pub struct GenerateRequest {
    pub model: String,
    pub prompt: String,
    pub image_base64: String,
    pub mask_base64: String,
    #[serde(default)]
    pub reference_images: Vec<String>, // Optional reference images as base64
}

#[derive(Debug, Serialize)]
pub struct GenerateResponse {
    pub success: bool,
    pub image_base64: Option<String>,
    pub error: Option<String>,
}

/// Get debug output directory
fn get_debug_dir() -> PathBuf {
    let path = PathBuf::from("C:/Users/sohan/Desktop/Projects/BananaSlice/debug_output");
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path
}

/// Save base64 image to file for debugging
fn save_debug_image(base64_data: &str, filename: &str) {
    if let Ok(bytes) = STANDARD.decode(base64_data) {
        let path = get_debug_dir().join(filename);
        if let Err(e) = fs::write(&path, bytes) {
            log::error!("Failed to save debug image {}: {}", filename, e);
        } else {
            log::info!("Saved debug image: {:?}", path);
        }
    }
}

/// Generate fill for a selected region
#[tauri::command]
pub async fn generate_fill(request: GenerateRequest) -> GenerateResponse {
    // Save input images for debugging
    log::info!("=== DEBUG: Saving input images ===");
    save_debug_image(&request.image_base64, "01_input_cropped.png");
    save_debug_image(&request.mask_base64, "02_input_mask.png");
    
    // Get API key from secure storage
    let api_key = match keystore::get_api_key() {
        Ok(key) => key,
        Err(_) => {
            return GenerateResponse {
                success: false,
                image_base64: None,
                error: Some("API key not configured. Please set your Gemini API key in Settings.".to_string()),
            };
        }
    };

    // Parse model
    let model = match request.model.as_str() {
        "nano-banana-pro" => Model::NanoBananaPro,
        "nano-banana-2" => Model::NanoBanana2,
        "nano-banana" | _ => Model::NanoBanana,
    };

    // Create client and make request
    let client = NanoBananaClient::new(api_key);
    
    // Convert reference images to &str slices
    let ref_images: Vec<&str> = request.reference_images.iter().map(|s| s.as_str()).collect();
    
    match client
        .generate_fill(model, &request.prompt, &request.image_base64, &request.mask_base64, &ref_images)
        .await
    {
        Ok(image_base64) => {
            // Save output image for debugging
            log::info!("=== DEBUG: Saving output image ===");
            save_debug_image(&image_base64, "03_output_generated.png");
            
            GenerateResponse {
                success: true,
                image_base64: Some(image_base64),
                error: None,
            }
        },
        Err(e) => GenerateResponse {
            success: false,
            image_base64: None,
            error: Some(e.to_string()),
        },
    }
}

/// Store the API key securely
#[tauri::command]
pub fn set_api_key(api_key: String) -> Result<(), String> {
    keystore::store_api_key(&api_key).map_err(|e| e.to_string())
}

/// Check if API key is configured
#[tauri::command]
pub fn has_api_key() -> bool {
    keystore::has_api_key()
}

/// Delete the stored API key
#[tauri::command]
pub fn delete_api_key() -> Result<(), String> {
    keystore::delete_api_key().map_err(|e| e.to_string())
}
