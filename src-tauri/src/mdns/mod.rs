//! mDNS discovery of Betaflight bridges (github.com/betaflight/bridge).
//!
//! The bridge advertises `_betaflight._tcp` with the raw TCP port and TXT records
//! describing its other endpoints. Only that service type is browsed, so the list
//! is bridges and nothing else. Each `mdns_browse` call returns the current snapshot,
//! so the frontend can poll it like a port list.
//!
//! Two backends: macOS already runs mDNSResponder, the system daemon Bonjour itself
//! uses, so `apple.rs` browses through it via `dns_sd.h` rather than opening a second
//! multicast responder in the app. Everything else keeps the in-process browser in
//! `generic.rs`.

#[cfg(target_os = "macos")]
#[path = "apple.rs"]
mod backend;

#[cfg(not(target_os = "macos"))]
#[path = "generic.rs"]
mod backend;

use std::net::IpAddr;

use serde::Serialize;
use tauri::State;

pub const SERVICE_TYPE: &str = "_betaflight._tcp";

/// A link-local v6 address needs a scope id to be usable, which the frontend's `tcp://`
/// URL cannot carry, so it would only ever produce a failed connect.
fn is_link_local(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V6(v6) => (v6.segments()[0] & 0xffc0) == 0xfe80,
        IpAddr::V4(_) => false,
    }
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn link_local_v6_is_rejected() {
        assert!(is_link_local("fe80::1".parse().unwrap()));
        assert!(!is_link_local("fd00::1".parse().unwrap()));
        assert!(!is_link_local("10.1.1.208".parse().unwrap()));
    }
}
