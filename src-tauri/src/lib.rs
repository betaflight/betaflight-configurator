mod mdns;
mod tcp;

// Native BLE covers the platforms whose webview has no Web Bluetooth: Apple (WKWebView) and
// Android (System WebView). Linux and Windows keep the webview's own Web Bluetooth, which also
// keeps btleplug's libdbus/WinRT paths out of desktop builds and CI.
#[cfg(any(target_os = "ios", target_os = "macos", target_os = "android"))]
mod ble;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_shell::init());

    // USB serial (serialplugin) is unavailable on iOS — TCP is the only transport there.
    #[cfg(not(target_os = "ios"))]
    let builder = builder.plugin(tauri_plugin_serialplugin::init());

    // USB DFU flashing: desktop keeps WebUSB in the webview, so the native
    // plugin is Android-only.
    #[cfg(target_os = "android")]
    let builder = builder.plugin(tauri_plugin_dfu::init());

    // Restore the last window size, position and maximized/fullscreen state on launch.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());

    // Native file open/save dialogs plus the file IO the frontend performs on the path
    // they return. Desktop only: the mobile webviews keep the browser flow. `dialog` must
    // be registered alongside `fs` — picking a file is what grants `fs` its scope entry.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init());

    // iOS: network (TCP/WebSocket) is the only transport, and a raw socket never raises the
    // Local Network permission prompt on its own. Request it at startup — before any connect —
    // so the user grants it up front instead of the first connect failing while it's pending.
    // WebKit keeps the layout viewport inside the safe area despite `viewport-fit=cover`, so on
    // a notched screen the page is laid out short and the strips above and below it are webview
    // background no CSS can reach. The Swift side frees the layout and feeds the real insets back
    // to the page.
    #[cfg(target_os = "ios")]
    unsafe extern "C" {
        fn bf_use_full_screen_webview();
    }

    #[cfg(target_os = "ios")]
    let builder = builder.setup(|_app| {
        tcp::trigger_local_network_permission();
        // Safety: provided by the app's Swift side, linked into the same binary; it only
        // schedules work on the main queue and returns.
        unsafe {
            bf_use_full_screen_webview();
        }
        Ok(())
    });

    let builder = builder
        .manage(tcp::TcpState::default())
        .manage(mdns::MdnsState::default());

    // Registering blec is what populates the handler its Rust API resolves, and what registers
    // the Android native plugin — the ble_* commands are dead without it.
    #[cfg(any(target_os = "ios", target_os = "macos", target_os = "android"))]
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
    #[cfg(not(any(target_os = "ios", target_os = "macos", target_os = "android")))]
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
