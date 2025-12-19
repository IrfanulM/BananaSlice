// Rust backend for Tauri application

mod api;
mod commands;
mod keystore;

use commands::{
    get_app_info, open_image, save_image,
    generate_fill, set_api_key, has_api_key, delete_api_key,
    composite_patch, composite_layers
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            open_image,
            save_image,
            generate_fill,
            set_api_key,
            has_api_key,
            delete_api_key,
            composite_patch,
            composite_layers
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

