use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub device_name: String,
    pub vendor_id: u16,
    pub product_id: u16,
    #[serde(default)]
    pub serial_number: String,
    #[serde(default)]
    pub product_name: String,
    #[serde(default)]
    pub manufacturer_name: String,
    pub has_permission: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferInResult {
    pub status: String,
    pub data: Vec<u8>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferOutResult {
    pub status: String,
}
