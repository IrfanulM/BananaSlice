// Nano Banana API Module
// Handles communication with Google's Gemini Image API

use reqwest::Client;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ApiError {
    #[error("HTTP request failed: {0}")]
    RequestFailed(#[from] reqwest::Error),
    
    #[allow(dead_code)]
    #[error("API key not configured")]
    ApiKeyMissing,
    
    #[error("API returned error: {0}")]
    ApiError(String),
    
    #[error("Failed to parse response: {0}")]
    ParseError(String),
    
    #[error("No image generated")]
    NoImageGenerated,
}

#[derive(Debug, Serialize)]
struct GeminiRequest {
    contents: Vec<Content>,
    #[serde(rename = "generationConfig")]
    generation_config: GenerationConfig,
}

#[derive(Debug, Serialize)]
struct Content {
    parts: Vec<Part>,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum Part {
    Text { text: String },
    InlineData { inline_data: InlineData },
}

#[derive(Debug, Serialize)]
struct InlineData {
    mime_type: String,
    data: String,
}

#[derive(Debug, Serialize)]
struct GenerationConfig {
    #[serde(rename = "responseModalities")]
    response_modalities: Vec<String>,
    #[serde(rename = "imageConfig", skip_serializing_if = "Option::is_none")]
    image_config: Option<ImageConfig>,
}

#[derive(Debug, Serialize)]
struct ImageConfig {
    #[serde(rename = "aspectRatio")]
    aspect_ratio: String,
}

/// Get image dimensions from base64 PNG data
fn get_image_dimensions(base64_data: &str) -> Option<(u32, u32)> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    
    let bytes = STANDARD.decode(base64_data).ok()?;
    
    // PNG header check and dimension extraction
    if bytes.len() < 24 {
        return None;
    }
    
    // Check PNG magic number
    if &bytes[0..8] != &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
        return None;
    }
    
    // Width and height are at bytes 16-19 and 20-23 (big-endian)
    let width = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
    let height = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
    
    Some((width, height))
}

/// Calculate the closest supported aspect ratio for Gemini API
/// Supported: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9
fn calculate_aspect_ratio(width: u32, height: u32) -> String {
    let ratio = width as f64 / height as f64;
    
    // Supported aspect ratios from API docs
    let ratios = [
        (8.0 / 1.0, "8:1"),
        (4.0 / 1.0, "4:1"),
        (21.0 / 9.0, "21:9"),
        (16.0 / 9.0, "16:9"),
        (5.0 / 4.0, "5:4"),
        (4.0 / 3.0, "4:3"),
        (3.0 / 2.0, "3:2"),
        (1.0, "1:1"),
        (4.0 / 5.0, "4:5"),
        (3.0 / 4.0, "3:4"),
        (2.0 / 3.0, "2:3"),
        (9.0 / 16.0, "9:16"),
        (1.0 / 4.0, "1:4"),
        (1.0 / 8.0, "1:8"),
    ];
    
    // Find the closest ratio
    let mut closest = "1:1";
    let mut min_diff = f64::MAX;
    
    for (r, name) in ratios.iter() {
        let diff = (ratio - r).abs();
        if diff < min_diff {
            min_diff = diff;
            closest = name;
        }
    }
    
    log::info!("Image {}x{} ratio={:.3}, closest supported: {}", width, height, ratio, closest);
    closest.to_string()
}


#[derive(Debug, Deserialize)]
struct GeminiResponse {
    candidates: Option<Vec<Candidate>>,
    error: Option<GeminiError>,
}

#[derive(Debug, Deserialize)]
struct Candidate {
    content: CandidateContent,
}

#[derive(Debug, Deserialize)]
struct CandidateContent {
    parts: Vec<ResponsePart>,
}

#[derive(Debug, Deserialize)]
struct ResponsePart {
    #[serde(rename = "inlineData")]
    inline_data: Option<ResponseInlineData>,
    text: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ResponseInlineData {
    #[serde(rename = "mimeType")]
    mime_type: String,
    data: String,
}

#[derive(Debug, Deserialize)]
struct GeminiError {
    message: String,
}

pub struct NanoBananaClient {
    client: Client,
    api_key: String,
    base_url: String,
}

impl NanoBananaClient {
    pub fn new(api_key: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
            base_url: "https://generativelanguage.googleapis.com/v1beta".to_string(),
        }
    }

    pub fn with_base_url(api_key: String, base_url: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
            base_url,
        }
    }

    /// Generate fill for a masked region
    /// 
    /// # Arguments
    /// * `model` - Which model to use (NanoBanana or NanoBananaPro)
    /// * `prompt` - Text description of what to generate
    /// * `image_base64` - The cropped source image as base64
    /// * `mask_base64` - The mask image as base64 (white = generate, black = keep)
    /// * `reference_images` - Optional reference images to guide generation
    /// * `custom_base_url` - Optional custom base URL override
    pub async fn generate_fill(
        &self,
        model: &str,
        prompt: &str,
        image_base64: &str,
        mask_base64: &str,
        reference_images: &[&str],
    ) -> Result<String, ApiError> {
        let url = format!(
            "{}/models/{}:generateContent?key={}",
            self.base_url, model, self.api_key
        );

        // Build parts array starting with source image and mask
        let mut parts = vec![
            // Source image (primary - this is what we're editing)
            Part::InlineData {
                inline_data: InlineData {
                    mime_type: "image/png".to_string(),
                    data: image_base64.to_string(),
                },
            },
            // Mask image
            Part::InlineData {
                inline_data: InlineData {
                    mime_type: "image/png".to_string(),
                    data: mask_base64.to_string(),
                },
            },
        ];

        // Add reference images if provided
        for (i, ref_image) in reference_images.iter().enumerate() {
            log::info!("Adding reference image {} ({} bytes)", i + 1, ref_image.len());
            parts.push(Part::InlineData {
                inline_data: InlineData {
                    mime_type: "image/png".to_string(),
                    data: ref_image.to_string(),
                },
            });
        }

        // Build prompt text based on whether we have reference images
        let prompt_text = if reference_images.is_empty() {
            format!(
                "Edit this image. The second image is a mask where white areas should be replaced. \
                In the white masked areas, generate: {}. \
                Keep the black areas unchanged. Match the style and lighting of the original image.",
                prompt
            )
        } else {
            format!(
                "Edit the first image. The second image is a mask where white areas should be replaced. \
                The additional images are references to help guide the generation. \
                In the white masked areas, generate: {}. \
                Use the reference images as context for the generation. \
                Keep the black areas unchanged.",
                prompt
            )
        };

        // Add prompt text
        parts.push(Part::Text { text: prompt_text });

        // Only set explicit aspect ratio when there are reference images
        // (without refs, the API correctly infers from the single input image)
        let image_config = if !reference_images.is_empty() {
            get_image_dimensions(image_base64)
                .map(|(w, h)| {
                    let ratio = calculate_aspect_ratio(w, h);
                    log::info!("Reference images present - setting aspectRatio to: {}", ratio);
                    ImageConfig { aspect_ratio: ratio }
                })
        } else {
            None
        };

        let request = GeminiRequest {
            contents: vec![Content { parts }],
            generation_config: GenerationConfig {
                response_modalities: vec!["IMAGE".to_string()],
                image_config,
            },
        };

        // Send request
        log::info!("Sending request to Gemini API: {}", model);
        
        let response = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await?;

        let status = response.status();
        let response_text = response.text().await?;
        
        log::info!("API response status: {}", status);
        
        // Parse response
        let gemini_response: GeminiResponse = serde_json::from_str(&response_text)
            .map_err(|e| ApiError::ParseError(format!("{}: {}", e, &response_text[..response_text.len().min(200)])))?;

        // Check for API error
        if let Some(error) = gemini_response.error {
            log::error!("Gemini API error: {}", error.message);
            return Err(ApiError::ApiError(error.message));
        }

        // Extract generated image
        let candidates = gemini_response.candidates.ok_or_else(|| {
            log::error!("No candidates in response. Full response: {}", &response_text[..response_text.len().min(500)]);
            ApiError::NoImageGenerated
        })?;
        
        log::info!("Got {} candidates", candidates.len());
        
        for candidate in candidates {
            log::info!("Candidate has {} parts", candidate.content.parts.len());
            for (i, part) in candidate.content.parts.into_iter().enumerate() {
                log::info!("Part {}: text={}, inline_data={}", i, part.text.is_some(), part.inline_data.is_some());
                if let Some(ref text) = part.text {
                    log::info!("Found text part: {}", &text[..text.len().min(200)]);
                }
                if let Some(inline_data) = part.inline_data {
                    log::info!("Found inline_data with mime_type: {}", inline_data.mime_type);
                    if inline_data.mime_type.starts_with("image/") {
                        log::info!("Returning image data ({} bytes)", inline_data.data.len());
                        return Ok(inline_data.data);
                    }
                }
            }
        }

        log::error!("No image found in response parts");
        Err(ApiError::NoImageGenerated)
    }
}
