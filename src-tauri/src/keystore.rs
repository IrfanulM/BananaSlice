// Secure API Key Storage using OS Native Keychain
// Uses the 'keyring' crate to interface with:
// - Windows Credential Manager
// - macOS Keychain
// - Linux libsecret/KWallet

use keyring::Entry;
use thiserror::Error;

const SERVICE_NAME: &str = "BananaSlice-API";
const USER_ACCOUNT: &str = "Gemini-Key";

#[derive(Error, Debug)]
pub enum KeyringError {
    #[error("Failed to access system keychain: {0}")]
    KeychainError(String),

    #[error("API key not found")]
    KeyNotFound,
}

// Helper to get the keyring entry
fn get_entry() -> Result<Entry, KeyringError> {
    Entry::new(SERVICE_NAME, USER_ACCOUNT)
        .map_err(|e| KeyringError::KeychainError(format!("Failed to create keyring entry: {}", e)))
}

// Store the API key in the system keychain
pub fn store_api_key(api_key: &str) -> Result<(), KeyringError> {
    let entry = get_entry()?;
    entry
        .set_password(api_key)
        .map_err(|e| KeyringError::KeychainError(format!("Failed to set password: {}", e)))?;

    log::info!("API key securely saved to system keychain");

    // Immediate verification for debugging
    match entry.get_password() {
        Ok(_) => log::info!("API key persistence verified"),
        Err(e) => log::error!("API key saved but verification failed: {}", e),
    }

    Ok(())
}

// Retrieve the API key from the system keychain
pub fn get_api_key() -> Result<String, KeyringError> {
    let entry = get_entry()?;

    match entry.get_password() {
        Ok(key) => {
            let key = key.trim().to_string();
            if key.is_empty() {
                Err(KeyringError::KeyNotFound)
            } else {
                Ok(key)
            }
        }
        Err(e) => {
            log::debug!("Keychain check: {}", e);
            Err(KeyringError::KeyNotFound)
        }
    }
}

// Delete the API key from the system keychain
pub fn delete_api_key() -> Result<(), KeyringError> {
    let entry = get_entry()?;
    
    // We ignore error on delete if key wasn't there
    let _ = entry.delete_credential();
    
    Ok(())
}

// Check if an API key exists
pub fn has_api_key() -> bool {
    get_api_key().is_ok()
}
