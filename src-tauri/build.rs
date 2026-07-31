fn main() {
    // The iOS app links the staticlib (libapp.a), where `bf_trigger_local_network_permission`
    // (see tcp.rs) is resolved from the Swift side compiled into the app. `cargo build --lib`
    // also links the cdylib crate type, and a dylib link demands every symbol resolve up front —
    // the Swift symbol isn't present there, so the cdylib link fails. The cdylib isn't loaded on
    // iOS, so let that one symbol stay undefined in it; the staticlib is unaffected.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
        println!("cargo:rustc-link-arg-cdylib=-Wl,-U,_bf_trigger_local_network_permission");
    }

    tauri_build::build()
}
