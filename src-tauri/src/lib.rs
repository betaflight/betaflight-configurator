mod mdns;
mod tcp;

// Native BLE covers macOS, whose webview (WKWebView) has no Web Bluetooth. Linux and Windows
// keep the webview's own Web Bluetooth, which also keeps btleplug's libdbus/WinRT paths out of
// their builds and CI.
#[cfg(target_os = "macos")]
mod ble;

use std::sync::atomic::{AtomicU32, Ordering};
use tauri::webview::NewWindowResponse;
use tauri::{App, WebviewUrl, WebviewWindowBuilder};

const POPUP_LABEL_PREFIX: &str = "popup-";

// Without an on_new_window handler wry rejects every window.open, so popups (log, radio emulator)
// would silently never open. The main window is therefore built here rather than from config.
fn build_main_window(app: &App) -> tauri::Result<()> {
    let handle = app.handle().clone();
    let popup_count = AtomicU32::new(0);
    let config = &app.config().app.windows[0];
    WebviewWindowBuilder::from_config(app, config)?
        .on_new_window(move |_url, features| {
            let label = format!(
                "{POPUP_LABEL_PREFIX}{}",
                popup_count.fetch_add(1, Ordering::Relaxed)
            );
            // The opener's webview loads the URL into the window returned here, which is what keeps
            // window.opener and the same origin intact.
            let popup = WebviewWindowBuilder::new(
                &handle,
                label,
                WebviewUrl::External("about:blank".parse().unwrap()),
            )
            .window_features(features)
            .on_document_title_changed(|window, title| {
                let _ = window.set_title(&title);
            })
            .build();
            match popup {
                Ok(window) => NewWindowResponse::Create { window },
                Err(error) => {
                    eprintln!("failed to open popup window: {error}");
                    NewWindowResponse::Deny
                }
            }
        })
        .build()?;
    Ok(())
}

pub fn run() {
    // WebKitGTK's DMA-BUF renderer leaves some composited layers unpainted on several Linux
    // GPU/driver setups: the fixed bottom toolbar stays clickable but is never drawn (#5655).
    // Disable it unless the user already chose a value, before the webview is created.
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            // SAFETY: called at the very start of run(), before Tauri or WebKitGTK spawn any
            // threads, so no other thread can be reading the environment concurrently.
            unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
        }
    }
    // Window state restores the last size, position and maximized/fullscreen state on launch.
    // `dialog` must be registered alongside `fs`: picking a file is what grants `fs` its scope
    // entry for the path the frontend then reads or writes.
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_serialplugin::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_filter(|label| !label.starts_with(POPUP_LABEL_PREFIX))
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(tcp::TcpState::default())
        .manage(mdns::MdnsState::default())
        .setup(|app| Ok(build_main_window(app)?));

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
