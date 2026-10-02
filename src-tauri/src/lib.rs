mod mdns;
mod tcp;

// Native BLE covers macOS, whose webview (WKWebView) has no Web Bluetooth. Linux and Windows
// keep the webview's own Web Bluetooth, which also keeps btleplug's libdbus/WinRT paths out of
// their builds and CI.
#[cfg(target_os = "macos")]
mod ble;

pub fn run() {
    // Window state restores the last size, position and maximized/fullscreen state on launch.
    // `dialog` must be registered alongside `fs`: picking a file is what grants `fs` its scope
    // entry for the path the frontend then reads or writes.
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_serialplugin::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(tcp::TcpState::default())
        .manage(mdns::MdnsState::default());

    // Registering blec is what populates the handler its Rust API resolves; the ble_* commands
    // are dead without it.
    #[cfg(target_os = "macos")]
    let builder = builder
        .plugin(tauri_plugin_blec::init())
        .manage(ble::BleState::default())
        .invoke_handler(tauri::generate_handler![
            tcp::tcp_connect,
            tcp::tcp_send,
            tcp::tcp_disconnect,
            mdns::mdns_browse,
            ble::ble_scan,
            ble::ble_connect,
            ble::ble_send,
            ble::ble_disconnect
        ]);
    #[cfg(not(target_os = "macos"))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        tcp::tcp_connect,
        tcp::tcp_send,
        tcp::tcp_disconnect,
        mdns::mdns_browse
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
