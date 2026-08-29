//! mDNS discovery of Betaflight bridges (github.com/betaflight/bridge).
//!
//! The bridge advertises `_betaflight._tcp` with the raw TCP port and TXT records
//! describing its other endpoints. Only that service type is browsed, so the list
//! is bridges and nothing else. Each `mdns_browse` call returns the current snapshot,
//! so the frontend can poll it like a port list.
//!
//! Two backends, because Apple platforms will not let an app browse for itself: since
//! iOS 14 a multicast datagram sent from an app's own socket is dropped unless the app
//! holds `com.apple.developer.networking.multicast`, which Apple grants only on request.
//! The failure is silent — the browse simply never hears an answer — so `apple.rs` goes
//! through mDNSResponder via `dns_sd.h` instead, which needs no entitlement and is the
//! same machinery Bonjour itself uses. Everything else keeps the in-process browser in
//! `generic.rs`.

#[cfg(any(target_os = "ios", target_os = "macos"))]
#[path = "apple.rs"]
mod backend;

#[cfg(not(any(target_os = "ios", target_os = "macos")))]
#[path = "generic.rs"]
mod backend;

use serde::Serialize;
use tauri::State;

pub const SERVICE_TYPE: &str = "_betaflight._tcp";

#[derive(Clone, Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Bridge {
    pub name: String,
    pub host: String,
    pub addresses: Vec<String>,
    pub port: u16,
    pub board: Option<String>,
    pub version: Option<String>,
    pub ws: Option<u16>,
    pub wss: Option<u16>,
}

#[derive(Default)]
pub struct MdnsState(backend::Browser);

#[tauri::command]
pub fn mdns_browse(state: State<'_, MdnsState>) -> Result<Vec<Bridge>, String> {
    state.0.snapshot()
}
