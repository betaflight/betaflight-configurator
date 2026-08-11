const COMMANDS: &[&str] = &[
    "list_devices",
    "request_permission",
    "open_device",
    "claim_interface",
    "release_interface",
    "close_device",
    "control_transfer_in",
    "control_transfer_out",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
