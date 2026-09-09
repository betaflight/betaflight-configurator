fn main() {
    // The iOS app links the staticlib (libapp.a), where the `bf_*` symbols below are resolved
    // from the Swift side compiled into the app. `cargo build --lib` also links the cdylib crate
    // type, and a dylib link demands every symbol resolve up front — the Swift symbols aren't
    // present there, so the cdylib link fails. The cdylib isn't loaded on iOS, so let these stay
    // undefined in it; the staticlib is unaffected.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
        for symbol in ["_bf_trigger_local_network_permission", "_bf_use_full_screen_webview"] {
            println!("cargo:rustc-link-arg-cdylib=-Wl,-U,{symbol}");
        }
    }

    tauri_build::build()
}
