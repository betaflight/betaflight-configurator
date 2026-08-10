use crate::android;
use crate::error::Result;
use crate::models::{DeviceInfo, TransferInResult, TransferOutResult};

#[tauri::command]
pub async fn list_devices() -> Result<Vec<DeviceInfo>> {
    android::list_devices().await
}

#[tauri::command]
pub async fn request_permission(device_name: String) -> Result<bool> {
    android::request_permission(device_name).await
}

#[tauri::command]
pub async fn open_device(device_name: String) -> Result<()> {
    android::open_device(device_name).await
}

#[tauri::command]
pub async fn claim_interface(interface_number: u8) -> Result<()> {
    android::claim_interface(interface_number).await
}

#[tauri::command]
pub async fn release_interface(interface_number: u8) -> Result<()> {
    android::release_interface(interface_number).await
}

#[tauri::command]
pub async fn close_device() -> Result<()> {
    android::close_device().await
}

#[tauri::command]
pub async fn control_transfer_in(
    request_type: String,
    recipient: String,
    request: u8,
    value: u16,
    index: u16,
    length: u16,
    timeout_ms: Option<u64>,
) -> Result<TransferInResult> {
    android::control_transfer_in(request_type, recipient, request, value, index, length, timeout_ms).await
}

#[tauri::command]
pub async fn control_transfer_out(
    request_type: String,
    recipient: String,
    request: u8,
    value: u16,
    index: u16,
    data: Vec<u8>,
    timeout_ms: Option<u64>,
) -> Result<TransferOutResult> {
    android::control_transfer_out(request_type, recipient, request, value, index, data, timeout_ms).await
}
