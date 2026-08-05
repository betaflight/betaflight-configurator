mod tcp;

// Native BLE (btleplug/CoreBluetooth) is Apple-only: it shares the macOS/iOS backend and
// avoids the libdbus (Linux) and WinRT (Windows) paths, which the iOS spike doesn't need.
#[cfg(any(target_os = "ios", target_os = "macos"))]
mod ble;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_shell::init());

    // USB serial (serialplugin) is unavailable on iOS — TCP is the only transport there.
    #[cfg(not(target_os = "ios"))]
    let builder = builder.plugin(tauri_plugin_serialplugin::init());

    // Restore the last window size, position and maximized/fullscreen state on launch.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());

    // iOS: network (TCP/WebSocket) is the only transport, and a raw socket never raises the
    // Local Network permission prompt on its own. Request it at startup — before any connect —
    // so the user grants it up front instead of the first connect failing while it's pending.
    #[cfg(target_os = "ios")]
    let builder = builder.setup(|_app| {
        tcp::trigger_local_network_permission();
        Ok(())
    });

    let builder = builder.manage(tcp::TcpState::default());

    // On Apple targets register the native BLE transport alongside TCP; elsewhere only TCP
    // exists, so the handler lists diverge.
    #[cfg(any(target_os = "ios", target_os = "macos"))]
    let builder = builder.manage(ble::BleState::default()).invoke_handler(tauri::generate_handler![
        tcp::tcp_connect,
        tcp::tcp_send,
        tcp::tcp_disconnect,
        ble::ble_scan,
        ble::ble_connect,
        ble::ble_send,
        ble::ble_disconnect
    ]);
    #[cfg(not(any(target_os = "ios", target_os = "macos")))]
    let builder = builder.invoke_handler(tauri::generate_handler![
        tcp::tcp_connect,
        tcp::tcp_send,
        tcp::tcp_disconnect
    ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
