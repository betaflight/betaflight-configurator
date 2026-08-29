//! Bridge discovery through mDNSResponder, via the `dns_sd.h` C API in libSystem.
//!
//! One browse runs for the life of the process on its own thread; mDNSResponder owns the
//! cache and the refresh queries, so unlike the in-process browser there is nothing to
//! re-arm. Each service that appears is resolved to a host and port, then to addresses,
//! synchronously on that thread — both steps bounded, so one silent service cannot wedge
//! discovery of the rest.

use std::collections::BTreeMap;
use std::ffi::{CString, c_char, c_uchar, c_void};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use super::{Bridge, SERVICE_TYPE};

/// A service that never answers must not wedge the browse thread.
const RESOLVE_TIMEOUT: Duration = Duration::from_secs(3);
/// The address record is usually already cached by the resolve above, so this is short.
const ADDRESS_TIMEOUT: Duration = Duration::from_millis(1500);

type DnsServiceRef = *mut c_void;
type DnsServiceFlags = u32;
type DnsServiceErrorType = i32;

const NO_ERROR: DnsServiceErrorType = 0;
const FLAGS_MORE_COMING: DnsServiceFlags = 0x1;
const FLAGS_ADD: DnsServiceFlags = 0x2;
const INTERFACE_ANY: u32 = 0;
/// kDNSServiceProtocol_IPv4 | kDNSServiceProtocol_IPv6
const PROTOCOL_ANY: u32 = 0x1 | 0x2;

type BrowseReply = unsafe extern "C" fn(
    DnsServiceRef,
    DnsServiceFlags,
    u32,
    DnsServiceErrorType,
    *const c_char,
    *const c_char,
    *const c_char,
    *mut c_void,
);

type ResolveReply = unsafe extern "C" fn(
    DnsServiceRef,
    DnsServiceFlags,
    u32,
    DnsServiceErrorType,
    *const c_char,
    *const c_char,
    u16,
    u16,
    *const c_uchar,
    *mut c_void,
);

type GetAddrInfoReply = unsafe extern "C" fn(
    DnsServiceRef,
    DnsServiceFlags,
    u32,
    DnsServiceErrorType,
    *const c_char,
    *const libc::sockaddr,
    u32,
    *mut c_void,
);

unsafe extern "C" {
    fn DNSServiceBrowse(
        sd_ref: *mut DnsServiceRef,
        flags: DnsServiceFlags,
        interface_index: u32,
        regtype: *const c_char,
        domain: *const c_char,
        callback: BrowseReply,
        context: *mut c_void,
    ) -> DnsServiceErrorType;

    fn DNSServiceResolve(
        sd_ref: *mut DnsServiceRef,
        flags: DnsServiceFlags,
        interface_index: u32,
        name: *const c_char,
        regtype: *const c_char,
        domain: *const c_char,
        callback: ResolveReply,
        context: *mut c_void,
    ) -> DnsServiceErrorType;

    fn DNSServiceGetAddrInfo(
        sd_ref: *mut DnsServiceRef,
        flags: DnsServiceFlags,
        interface_index: u32,
        protocol: u32,
        hostname: *const c_char,
        callback: GetAddrInfoReply,
        context: *mut c_void,
    ) -> DnsServiceErrorType;

    fn DNSServiceProcessResult(sd_ref: DnsServiceRef) -> DnsServiceErrorType;
    fn DNSServiceRefSockFD(sd_ref: DnsServiceRef) -> i32;
    fn DNSServiceRefDeallocate(sd_ref: DnsServiceRef);

    fn TXTRecordGetValuePtr(
        txt_len: u16,
        txt_record: *const c_void,
        key: *const c_char,
        value_len: *mut u8,
    ) -> *const c_void;
}

#[derive(Default)]
struct Shared {
    found: Mutex<BTreeMap<String, Bridge>>,
    error: Mutex<Option<String>>,
}

#[derive(Default)]
pub struct Browser {
    shared: Mutex<Option<Arc<Shared>>>,
}

impl Browser {
    pub fn snapshot(&self) -> Result<Vec<Bridge>, String> {
        let shared = {
            let mut guard = self.shared.lock().unwrap();
            match guard.as_ref() {
                Some(shared) => shared.clone(),
                None => {
                    let shared = Arc::new(Shared::default());
                    start(shared.clone())?;
                    guard.insert(shared).clone()
                }
            }
        };

        if let Some(error) = shared.error.lock().unwrap().clone() {
            return Err(error);
        }
        Ok(shared.found.lock().unwrap().values().cloned().collect())
    }
}

fn start(shared: Arc<Shared>) -> Result<(), String> {
    let regtype = CString::new(SERVICE_TYPE).map_err(|e| e.to_string())?;

    thread::spawn(move || {
        // Handed to the C callback as its context, and reclaimed when the browse ends.
        let context = Arc::into_raw(shared.clone()) as *mut c_void;
        let mut sd_ref: DnsServiceRef = std::ptr::null_mut();

        // Safety: sd_ref is a valid out-param, regtype outlives the call, and the context
        // pointer stays alive until the matching from_raw below.
        let error = unsafe {
            DNSServiceBrowse(
                &mut sd_ref,
                0,
                INTERFACE_ANY,
                regtype.as_ptr(),
                std::ptr::null(),
                browse_reply,
                context,
            )
        };

        if error != NO_ERROR {
            *shared.error.lock().unwrap() = Some(format!("DNSServiceBrowse failed ({error})"));
            unsafe { drop(Arc::from_raw(context as *const Shared)) };
            return;
        }

        // Blocks until a reply is ready, then dispatches it to browse_reply.
        while unsafe { DNSServiceProcessResult(sd_ref) } == NO_ERROR {}

        unsafe {
            DNSServiceRefDeallocate(sd_ref);
            drop(Arc::from_raw(context as *const Shared));
        }
    });

    Ok(())
}

/// Safety: called by mDNSResponder on the browse thread, with `context` the pointer handed
/// to `DNSServiceBrowse` and the string arguments valid for the duration of the call.
unsafe extern "C" fn browse_reply(
    _sd_ref: DnsServiceRef,
    flags: DnsServiceFlags,
    interface_index: u32,
    error_code: DnsServiceErrorType,
    service_name: *const c_char,
    regtype: *const c_char,
    reply_domain: *const c_char,
    context: *mut c_void,
) {
    if error_code != NO_ERROR || context.is_null() {
        return;
    }
    let shared = unsafe { &*(context as *const Shared) };

    let (Some(name), Some(regtype), Some(domain)) = (
        unsafe { cstr(service_name) },
        unsafe { cstr(regtype) },
        unsafe { cstr(reply_domain) },
    ) else {
        return;
    };

    let key = format!("{name}.{regtype}{domain}");

    if flags & FLAGS_ADD == 0 {
        shared.found.lock().unwrap().remove(&key);
        return;
    }

    if let Some(bridge) = resolve(&name, &regtype, &domain, interface_index) {
        shared.found.lock().unwrap().insert(key, bridge);
    }
}

struct Resolved {
    host: String,
    port: u16,
    txt: Vec<u8>,
}

fn resolve(name: &str, regtype: &str, domain: &str, interface_index: u32) -> Option<Bridge> {
    let c_name = CString::new(name).ok()?;
    let c_regtype = CString::new(regtype).ok()?;
    let c_domain = CString::new(domain).ok()?;

    let mut out: Option<Resolved> = None;
    let mut sd_ref: DnsServiceRef = std::ptr::null_mut();

    // Safety: every pointer outlives the call, as does `out`.
    let error = unsafe {
        DNSServiceResolve(
            &mut sd_ref,
            0,
            interface_index,
            c_name.as_ptr(),
            c_regtype.as_ptr(),
            c_domain.as_ptr(),
            resolve_reply,
            &raw mut out as *mut c_void,
        )
    };
    if error != NO_ERROR {
        return None;
    }

    let deadline = Instant::now() + RESOLVE_TIMEOUT;
    let fd = unsafe { DNSServiceRefSockFD(sd_ref) };
    while out.is_none() && pump(sd_ref, fd, deadline) {}
    unsafe { DNSServiceRefDeallocate(sd_ref) };

    let resolved = out?;
    let host = trim_dot(&resolved.host).to_string();

    Some(Bridge {
        name: name.to_string(),
        addresses: addresses_of(&host, interface_index),
        host,
        port: resolved.port,
        board: txt_value(&resolved.txt, "board"),
        version: txt_value(&resolved.txt, "version"),
        ws: txt_u16(&resolved.txt, "ws"),
        wss: txt_u16(&resolved.txt, "wss"),
    })
}

/// Safety: called by mDNSResponder with `context` pointing at the caller's `Option<Resolved>`.
unsafe extern "C" fn resolve_reply(
    _sd_ref: DnsServiceRef,
    _flags: DnsServiceFlags,
    _interface_index: u32,
    error_code: DnsServiceErrorType,
    _fullname: *const c_char,
    host_target: *const c_char,
    port: u16,
    txt_len: u16,
    txt_record: *const c_uchar,
    context: *mut c_void,
) {
    if error_code != NO_ERROR || context.is_null() {
        return;
    }
    let Some(host) = (unsafe { cstr(host_target) }) else {
        return;
    };

    let txt = if txt_record.is_null() || txt_len == 0 {
        Vec::new()
    } else {
        unsafe { std::slice::from_raw_parts(txt_record, txt_len as usize) }.to_vec()
    };

    let out = unsafe { &mut *(context as *mut Option<Resolved>) };
    *out = Some(Resolved {
        host,
        // dns_sd reports the port in network byte order.
        port: u16::from_be(port),
        txt,
    });
}

#[derive(Default)]
struct Addresses {
    found: Vec<IpAddr>,
    complete: bool,
}

/// Resolves the host through mDNSResponder rather than `getaddrinfo`. The frontend hands
/// whatever this returns to `tcp_connect`, and a `.local` name is not dependably resolvable
/// from inside the app — it connects on device but times out in the simulator — so the
/// browse has to produce literals. Falls back to the name only when no record arrives.
fn addresses_of(host: &str, interface_index: u32) -> Vec<String> {
    let Ok(c_host) = CString::new(host) else {
        return vec![host.to_string()];
    };

    let mut out = Addresses::default();
    let mut sd_ref: DnsServiceRef = std::ptr::null_mut();

    // Safety: c_host outlives the call, as does `out`.
    let error = unsafe {
        DNSServiceGetAddrInfo(
            &mut sd_ref,
            0,
            interface_index,
            PROTOCOL_ANY,
            c_host.as_ptr(),
            get_addr_info_reply,
            &raw mut out as *mut c_void,
        )
    };
    if error != NO_ERROR {
        return vec![host.to_string()];
    }

    let deadline = Instant::now() + ADDRESS_TIMEOUT;
    let fd = unsafe { DNSServiceRefSockFD(sd_ref) };
    while !out.complete && pump(sd_ref, fd, deadline) {}
    unsafe { DNSServiceRefDeallocate(sd_ref) };

    if out.found.is_empty() {
        return vec![host.to_string()];
    }
    out.found.sort_by_key(|address| (address.is_ipv6(), *address));
    out.found.dedup();
    out.found.iter().map(ToString::to_string).collect()
}

/// Safety: called by mDNSResponder with `context` pointing at the caller's `Addresses`.
unsafe extern "C" fn get_addr_info_reply(
    _sd_ref: DnsServiceRef,
    flags: DnsServiceFlags,
    _interface_index: u32,
    error_code: DnsServiceErrorType,
    _hostname: *const c_char,
    address: *const libc::sockaddr,
    _ttl: u32,
    context: *mut c_void,
) {
    if context.is_null() {
        return;
    }
    let out = unsafe { &mut *(context as *mut Addresses) };

    if error_code == NO_ERROR
        && flags & FLAGS_ADD != 0
        && let Some(ip) = unsafe { ip_from_sockaddr(address) }
        // A link-local v6 address needs a scope id to be usable, which the frontend's
        // `tcp://` URL cannot carry, so it would only ever produce a failed connect.
        && !is_link_local(ip)
    {
        out.found.push(ip);
    }

    if flags & FLAGS_MORE_COMING == 0 {
        out.complete = true;
    }
}

fn is_link_local(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V6(v6) => (v6.segments()[0] & 0xffc0) == 0xfe80,
        IpAddr::V4(_) => false,
    }
}

/// Waits for the next reply on `fd` and dispatches it. Returns false when the deadline
/// passed, the socket errored, or the service ended.
fn pump(sd_ref: DnsServiceRef, fd: i32, deadline: Instant) -> bool {
    if fd < 0 {
        return false;
    }
    let remaining = deadline.saturating_duration_since(Instant::now());
    if remaining.is_zero() {
        return false;
    }

    let mut poll_fd = libc::pollfd {
        fd,
        events: libc::POLLIN,
        revents: 0,
    };
    // Safety: a single valid descriptor, owned by the sd_ref that outlives this call.
    if unsafe { libc::poll(&mut poll_fd, 1, remaining.as_millis() as i32) } <= 0 {
        return false;
    }
    unsafe { DNSServiceProcessResult(sd_ref) == NO_ERROR }
}

/// Safety: `address` must be null or point at a valid `sockaddr`.
unsafe fn ip_from_sockaddr(address: *const libc::sockaddr) -> Option<IpAddr> {
    if address.is_null() {
        return None;
    }
    match unsafe { (*address).sa_family } as i32 {
        libc::AF_INET => {
            let v4 = address as *const libc::sockaddr_in;
            Some(IpAddr::V4(Ipv4Addr::from(u32::from_be(unsafe {
                (*v4).sin_addr.s_addr
            }))))
        }
        libc::AF_INET6 => {
            let v6 = address as *const libc::sockaddr_in6;
            Some(IpAddr::V6(Ipv6Addr::from(unsafe {
                (*v6).sin6_addr.s6_addr
            })))
        }
        _ => None,
    }
}

fn txt_value(txt: &[u8], key: &str) -> Option<String> {
    let c_key = CString::new(key).ok()?;
    let mut len: u8 = 0;

    // Safety: txt is a valid buffer of txt.len() bytes; the result borrows from it.
    let value = unsafe {
        TXTRecordGetValuePtr(
            txt.len() as u16,
            txt.as_ptr() as *const c_void,
            c_key.as_ptr(),
            &mut len,
        )
    };
    if value.is_null() {
        return None;
    }

    let bytes = unsafe { std::slice::from_raw_parts(value as *const u8, len as usize) };
    String::from_utf8(bytes.to_vec()).ok()
}

fn txt_u16(txt: &[u8], key: &str) -> Option<u16> {
    txt_value(txt, key).and_then(|value| value.parse().ok())
}

/// Safety: `ptr` must be null or a valid NUL-terminated C string.
unsafe fn cstr(ptr: *const c_char) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    unsafe { std::ffi::CStr::from_ptr(ptr) }
        .to_str()
        .ok()
        .map(str::to_string)
}

fn trim_dot(value: &str) -> &str {
    value.trim_end_matches('.')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trailing_dot_is_stripped_from_hosts() {
        assert_eq!(
            trim_dot("betaflight-bridge-f8a260.local."),
            "betaflight-bridge-f8a260.local"
        );
    }

    #[test]
    fn missing_txt_keys_are_none() {
        assert_eq!(txt_value(&[], "board"), None);
        assert_eq!(txt_u16(&[], "ws"), None);
    }

    #[test]
    fn link_local_v6_is_rejected() {
        assert!(is_link_local("fe80::1".parse().unwrap()));
        assert!(!is_link_local("fd00::1".parse().unwrap()));
        assert!(!is_link_local("10.1.1.208".parse().unwrap()));
    }

    #[test]
    fn unknown_host_falls_back_to_the_name() {
        assert_eq!(
            addresses_of("betaflight-bridge-does-not-exist.local", INTERFACE_ANY),
            vec!["betaflight-bridge-does-not-exist.local".to_string()]
        );
    }

    // Live check against a bridge on the LAN: `cargo test -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn browse_live() {
        let browser = Browser::default();
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            let found = browser.snapshot().unwrap();
            if !found.is_empty() {
                for bridge in &found {
                    println!("{bridge:?}");
                }
                assert!(found.iter().all(|bridge| !bridge.addresses.is_empty()));
                return;
            }
            thread::sleep(Duration::from_millis(250));
        }
        panic!("no bridge answered");
    }
}
