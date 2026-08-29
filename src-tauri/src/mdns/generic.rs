//! Bridge discovery with an in-process multicast browser (`mdns-sd`).
//!
//! Used everywhere except Apple platforms, which cannot browse from an app-owned socket
//! without an entitlement — see `apple.rs`. One daemon lives for the process; each snapshot
//! drains the events queued since the last one.

use std::collections::BTreeMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use mdns_sd::{Receiver, ResolvedService, ServiceDaemon, ServiceEvent};

use super::{Bridge, SERVICE_TYPE};

// The bridge's records carry a 120 s TTL and it does not answer the daemon's known-answer
// refresh queries, so a single long-lived browse expires the bridge after two minutes. A
// fresh browse sends a plain query, which it does answer.
const REBROWSE_INTERVAL: Duration = Duration::from_secs(30);

fn service_type() -> String {
    format!("{SERVICE_TYPE}.local.")
}

struct Daemon {
    daemon: ServiceDaemon,
    events: Receiver<ServiceEvent>,
    last_browse: Instant,
}

#[derive(Default)]
pub struct Browser {
    daemon: Mutex<Option<Daemon>>,
    found: Mutex<BTreeMap<String, Bridge>>,
}

impl Browser {
    pub fn snapshot(&self) -> Result<Vec<Bridge>, String> {
        let mut guard = self.daemon.lock().unwrap();
        if guard.is_none() {
            *guard = Some(start()?);
        }
        let browser = guard.as_mut().unwrap();

        if browser.last_browse.elapsed() >= REBROWSE_INTERVAL {
            browser
                .daemon
                .browse(&service_type())
                .map_err(|e| e.to_string())?;
            browser.last_browse = Instant::now();
        }

        let mut found = self.found.lock().unwrap();
        while let Ok(event) = browser.events.try_recv() {
            apply(&mut found, event);
        }
        Ok(found.values().cloned().collect())
    }
}

fn start() -> Result<Daemon, String> {
    let daemon = ServiceDaemon::new().map_err(|e| e.to_string())?;
    let events = daemon.browse(&service_type()).map_err(|e| e.to_string())?;
    Ok(Daemon {
        daemon,
        events,
        last_browse: Instant::now(),
    })
}

fn trim_dot(value: &str) -> &str {
    value.trim_end_matches('.')
}

fn instance_name(fullname: &str) -> String {
    trim_dot(fullname)
        .strip_suffix(trim_dot(&service_type()))
        .map(trim_dot)
        .unwrap_or(fullname)
        .to_string()
}

fn txt_u16(txt: &mdns_sd::TxtProperties, key: &str) -> Option<u16> {
    txt.get_property_val_str(key).and_then(|v| v.parse().ok())
}

fn bridge_from(info: &ResolvedService) -> Bridge {
    let mut addresses: Vec<std::net::IpAddr> =
        info.addresses.iter().map(|a| a.to_ip_addr()).collect();
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
                port: 5761,
                ..Bridge::default()
            },
        );
        apply(
            &mut found,
            ServiceEvent::ServiceRemoved(service_type(), "a._betaflight._tcp.local.".to_string()),
        );
        assert!(found.is_empty());
    }
}
