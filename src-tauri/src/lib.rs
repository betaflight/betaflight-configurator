#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::mobile_entry_point]
fn mobile_entry() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
