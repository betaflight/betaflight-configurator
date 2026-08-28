//! mDNS discovery of Betaflight bridges (github.com/betaflight/bridge).
//!
//! The bridge advertises `_betaflight._tcp` with the raw TCP port and TXT records
//! describing its other endpoints. Only that service type is browsed, so the list
//! is bridges and nothing else. One daemon lives for the process; each
//! `mdns_browse` call drains the events it has queued since the last call and
//! returns the current snapshot, so the frontend can poll it like a port list.

use std::collections::BTreeMap;
use std::net::IpAddr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use mdns_sd::{Receiver, ResolvedService, ServiceDaemon, ServiceEvent};
use serde::Serialize;
use tauri::State;

const SERVICE_TYPE: &str = "_betaflight._tcp.local.";

// The bridge's records carry a 120 s TTL and it does not answer the daemon's
// known-answer refresh queries, so a single long-lived browse expires the bridge
// after two minutes. A fresh browse sends a plain query, which it does answer.
const REBROWSE_INTERVAL: Duration = Duration::from_secs(30);

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
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

struct Browser {
    daemon: ServiceDaemon,
    events: Receiver<ServiceEvent>,
    last_browse: Instant,
}

#[derive(Default)]
pub struct MdnsState {
    browser: Mutex<Option<Browser>>,
    found: Mutex<BTreeMap<String, Bridge>>,
}

fn trim_dot(s: &str) -> &str {
    s.trim_end_matches('.')
}

fn instance_name(fullname: &str) -> String {
    trim_dot(fullname)
        .strip_suffix(trim_dot(SERVICE_TYPE))
        .map(trim_dot)
        .unwrap_or(fullname)
        .to_string()
}

fn txt_u16(txt: &mdns_sd::TxtProperties, key: &str) -> Option<u16> {
    txt.get_property_val_str(key).and_then(|v| v.parse().ok())
}

fn bridge_from(info: &ResolvedService) -> Bridge {
    let mut addresses: Vec<IpAddr> = info.addresses.iter().map(|a| a.to_ip_addr()).collect();
    addresses.sort_by_key(|a| (a.is_ipv6(), *a));
    Bridge {
        name: instance_name(&info.fullname),
        host: trim_dot(&info.host).to_string(),
        addresses: addresses.iter().map(ToString::to_string).collect(),
        port: info.port,
        board: info
            .txt_properties
            .get_property_val_str("board")
            .map(str::to_string),
        version: info
            .txt_properties
            .get_property_val_str("version")
            .map(str::to_string),
        ws: txt_u16(&info.txt_properties, "ws"),
        wss: txt_u16(&info.txt_properties, "wss"),
    }
}

fn start_browser() -> Result<Browser, String> {
    let daemon = ServiceDaemon::new().map_err(|e| e.to_string())?;
    let events = daemon.browse(SERVICE_TYPE).map_err(|e| e.to_string())?;
    Ok(Browser {
        daemon,
        events,
        last_browse: Instant::now(),
    })
}

fn apply(found: &mut BTreeMap<String, Bridge>, event: ServiceEvent) {
    match event {
        ServiceEvent::ServiceResolved(info) => {
            found.insert(info.fullname.clone(), bridge_from(&info));
        }
        ServiceEvent::ServiceRemoved(_, fullname) => {
            found.remove(&fullname);
        }
        _ => {}
    }
}

#[tauri::command]
pub fn mdns_browse(state: State<'_, MdnsState>) -> Result<Vec<Bridge>, String> {
    let mut browser = state.browser.lock().unwrap();
    if browser.is_none() {
        *browser = Some(start_browser()?);
    }
    let browser = browser.as_mut().unwrap();
    if browser.last_browse.elapsed() >= REBROWSE_INTERVAL {
        browser
            .daemon
            .browse(SERVICE_TYPE)
            .map_err(|e| e.to_string())?;
        browser.last_browse = Instant::now();
    }

    let mut found = state.found.lock().unwrap();
    while let Ok(event) = browser.events.try_recv() {
        apply(&mut found, event);
    }
    Ok(found.values().cloned().collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn instance_name_strips_service_type() {
        assert_eq!(
            instance_name("betaflight-bridge-f8a260._betaflight._tcp.local."),
            "betaflight-bridge-f8a260"
        );
    }

    #[test]
    fn removed_event_drops_bridge() {
        let mut found = BTreeMap::new();
        found.insert(
            "a._betaflight._tcp.local.".to_string(),
            Bridge {
                name: "a".into(),
                host: "a.local".into(),
                addresses: vec![],
                port: 5761,
                board: None,
                version: None,
                ws: None,
                wss: None,
            },
        );
        apply(
            &mut found,
            ServiceEvent::ServiceRemoved(
                SERVICE_TYPE.to_string(),
                "a._betaflight._tcp.local.".to_string(),
            ),
        );
        assert!(found.is_empty());
    }

    // Live check against a bridge on the LAN: `cargo test -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn browse_live() {
        let browser = start_browser().unwrap();
        let mut found = BTreeMap::new();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(3);
        while std::time::Instant::now() < deadline {
            if let Ok(event) = browser
                .events
                .recv_timeout(std::time::Duration::from_millis(200))
            {
                apply(&mut found, event);
            }
        }
        for b in found.values() {
            println!("{b:?}");
        }
        assert!(!found.is_empty(), "no bridge answered");
    }
}
