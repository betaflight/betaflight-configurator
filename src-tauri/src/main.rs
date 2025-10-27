#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

fn main() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init());

    #[cfg(target_os = "android")]
    {
        // Local Android serial plugin that mirrors the commands used by the frontend
        builder = builder.plugin(crate::serial_android::init_android());
    }

    #[cfg(not(target_os = "android"))]
    {
        // Desktop: use official plugin for now
        builder = builder.plugin(tauri_plugin_serialplugin::init());
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(target_os = "android")]
mod serial_android;
