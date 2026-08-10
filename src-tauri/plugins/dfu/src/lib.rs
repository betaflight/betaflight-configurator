//! USB DFU plugin for the Betaflight app on Android.
//!
//! Split forced by nusb on Android (no enumeration or hotplug there): Kotlin
//! owns device listing, the permission dialog and `openDevice`, then hands the
//! raw fd to Rust, which duplicates it and drives all transfers through nusb.
//! The webview talks only to the Rust commands, so the flash loop never
//! touches the Android main thread.

use tauri::plugin::{Builder, TauriPlugin};
use tauri::Runtime;

mod commands;
mod error;
mod models;

#[cfg(target_os = "android")]
mod android;

// Stub backend so the commands compile identically on every other target.
#[cfg(not(target_os = "android"))]
mod android {
    use crate::error::{Error, Result};
    use crate::models::{DeviceInfo, TransferInResult, TransferOutResult};

    fn unsupported<T>() -> Result<T> {
        Err(Error::new("DFU plugin is only available on Android"))
    }

    pub async fn list_devices() -> Result<Vec<DeviceInfo>> {
        unsupported()
    }
    pub async fn request_permission(_device_name: String) -> Result<bool> {
        unsupported()
    }
    pub async fn open_device(_device_name: String) -> Result<()> {
        unsupported()
    }
    pub async fn claim_interface(_interface_number: u8) -> Result<()> {
        unsupported()
    }
    pub async fn release_interface(_interface_number: u8) -> Result<()> {
        unsupported()
    }
    pub async fn close_device() -> Result<()> {
        unsupported()
    }
    #[allow(clippy::too_many_arguments)]
    pub async fn control_transfer_in(
        _request_type: String,
        _recipient: String,
        _request: u8,
        _value: u16,
        _index: u16,
        _length: u16,
        _timeout_ms: Option<u64>,
    ) -> Result<TransferInResult> {
        unsupported()
    }
    #[allow(clippy::too_many_arguments)]
    pub async fn control_transfer_out(
        _request_type: String,
        _recipient: String,
        _request: u8,
        _value: u16,
        _index: u16,
        _data: Vec<u8>,
        _timeout_ms: Option<u64>,
    ) -> Result<TransferOutResult> {
        unsupported()
    }
}

pub use error::{Error, Result};
pub use models::DeviceInfo;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("dfu")
        .invoke_handler(tauri::generate_handler![
            commands::list_devices,
            commands::request_permission,
            commands::open_device,
            commands::claim_interface,
            commands::release_interface,
            commands::close_device,
            commands::control_transfer_in,
            commands::control_transfer_out,
        ])
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _api.register_android_plugin("com.betaflight.dfu", "DfuPlugin")?;
            Ok(())
        })
        .build()
}
