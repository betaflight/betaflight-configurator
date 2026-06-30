//! Raw TCP client commands for the configurator.
//!
//! The Tauri webview has no raw-socket API, and the Betaflight bridge
//! (github.com/betaflight/bridge) speaks plain TCP on port 5761 — not
//! WebSocket — so the JS `TauriTcp` protocol drives these commands instead.
//!
//! Desktop and Android use std::net. iOS won't give a raw socket local network access
//! even with the permission granted, so on iOS the socket lives in main.mm and hands
//! its connect, send and close pointers to Rust through here.

use std::net::TcpStream;
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, State};

#[cfg(not(target_os = "ios"))]
use std::io::{Read, Write};
#[cfg(not(target_os = "ios"))]
use std::net::Shutdown;
#[cfg(not(target_os = "ios"))]
use std::sync::atomic::Ordering;
#[cfg(not(target_os = "ios"))]
use std::thread;

#[cfg(target_os = "ios")]
use std::ffi::CString;
#[cfg(target_os = "ios")]
use std::os::raw::c_char;

// iOS Network.framework bridge, the socket lives in main.mm
#[cfg(target_os = "ios")]
type ConnectFn = extern "C" fn(*const c_char, u16) -> i32;
#[cfg(target_os = "ios")]
type SendFn = extern "C" fn(*const u8, usize);
#[cfg(target_os = "ios")]
type CloseFn = extern "C" fn();

#[cfg(target_os = "ios")]
static TCP_FNS: Mutex<Option<(ConnectFn, SendFn, CloseFn)>> = Mutex::new(None);

// Live AppHandle so the native callbacks can emit events.
#[cfg(target_os = "ios")]
static IOS_APP: Mutex<Option<AppHandle>> = Mutex::new(None);

/// Registers main.mm's NWConnection entry points.
#[cfg(target_os = "ios")]
#[unsafe(no_mangle)]
pub extern "C" fn rust_register_tcp(connect: ConnectFn, send: SendFn, close: CloseFn) {
    *TCP_FNS.lock().unwrap() = Some((connect, send, close));
}

/// Called by main.mm with received bytes.
#[cfg(target_os = "ios")]
#[unsafe(no_mangle)]
pub extern "C" fn rust_tcp_on_data(bytes: *const u8, len: usize) {
    if bytes.is_null() || len == 0 {
        return;
    }
    let data = unsafe { std::slice::from_raw_parts(bytes, len) }.to_vec();
    if let Some(app) = IOS_APP.lock().unwrap().as_ref() {
        let _ = app.emit("tcp-data", data);
    }
}

/// Called by main.mm when the connection closes or fails.
#[cfg(target_os = "ios")]
#[unsafe(no_mangle)]
pub extern "C" fn rust_tcp_on_closed() {
    if let Some(app) = IOS_APP.lock().unwrap().as_ref() {
        let _ = app.emit("tcp-closed", ());
    }
}

#[derive(Default)]
pub struct TcpState {
    stream: Mutex<Option<TcpStream>>,
    epoch: Arc<AtomicU64>,
}

#[tauri::command]
pub fn tcp_connect(
    app: AppHandle,
    state: State<'_, TcpState>,
    ip: String,
    port: u16,
) -> Result<(), String> {
    #[cfg(target_os = "ios")]
    {
        let _ = state; // Socket lives in NWConnection on iOS
        let fns = *TCP_FNS.lock().unwrap();
        let connect = fns
            .map(|(c, _, _)| c)
            .ok_or_else(|| "native TCP transport not registered".to_string())?;
        *IOS_APP.lock().unwrap() = Some(app);
        let cip = CString::new(ip).map_err(|e| e.to_string())?;
        let code = connect(cip.as_ptr(), port);
        if code == 0 {
            Ok(())
        } else {
            let state = code / 1000;
            let errno = code % 1000;
            let state_s = match state {
                0 => "invalid",
                1 => "waiting",
                2 => "preparing",
                4 => "failed",
                5 => "cancelled",
                999 => "timeout-12s",
                _ => "?",
            };
            let errno_s = match errno {
                0 => "-",
                1 => "EPERM/denied",
                49 => "EADDRNOTAVAIL",
                50 => "ENETDOWN",
                51 => "ENETUNREACH",
                54 => "ECONNRESET",
                60 => "ETIMEDOUT",
                61 => "ECONNREFUSED",
                64 => "EHOSTDOWN",
                65 => "EHOSTUNREACH",
                _ => "errno",
            };
            Err(format!(
                "NWConnection failed, state={state} ({state_s}), errno={errno} ({errno_s})"
            ))
        }
    }

    #[cfg(not(target_os = "ios"))]
    {
        let stream = TcpStream::connect((ip.as_str(), port)).map_err(|e| e.to_string())?;
        // Disable Nagle to keep MSP round-trips snappy, matching the bridge.
        let _ = stream.set_nodelay(true);

        let reader = stream.try_clone().map_err(|e| e.to_string())?;

        // Bump the epoch and tear down any previous connection so its reader stops.
        let epoch = state.epoch.clone();
        let my_epoch = epoch.fetch_add(1, Ordering::SeqCst) + 1;
        if let Some(old) = state.stream.lock().unwrap().replace(stream) {
            let _ = old.shutdown(Shutdown::Both);
        }

        thread::spawn(move || {
            let mut reader = reader;
            let mut buf = [0u8; 4096];
            loop {
                if epoch.load(Ordering::SeqCst) != my_epoch {
                    break;
                }
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => {
                        if epoch.load(Ordering::SeqCst) == my_epoch {
                            let _ = app.emit("tcp-closed", ());
                        }
                        break;
                    }
                    Ok(n) => {
                        if epoch.load(Ordering::SeqCst) != my_epoch {
                            break;
                        }
                        let _ = app.emit("tcp-data", buf[..n].to_vec());
                    }
                }
            }
        });

        Ok(())
    }
}

#[tauri::command]
pub fn tcp_send(state: State<'_, TcpState>, data: Vec<u8>) -> Result<(), String> {
    #[cfg(target_os = "ios")]
    {
        let _ = state;
        let fns = *TCP_FNS.lock().unwrap();
        if let Some((_, send, _)) = fns {
            send(data.as_ptr(), data.len());
        }
        Ok(())
    }

    #[cfg(not(target_os = "ios"))]
    {
        let mut guard = state.stream.lock().unwrap();
        match guard.as_mut() {
            Some(stream) => stream.write_all(&data).map_err(|e| e.to_string()),
            None => Err("TCP socket is not connected".into()),
        }
    }
}

#[tauri::command]
pub fn tcp_disconnect(state: State<'_, TcpState>) -> Result<(), String> {
    #[cfg(target_os = "ios")]
    {
        let _ = state;
        let fns = *TCP_FNS.lock().unwrap();
        if let Some((_, _, close)) = fns {
            close();
        }
        Ok(())
    }

    #[cfg(not(target_os = "ios"))]
    {
        // Fence the reader first so its closure doesn't emit a spurious tcp-closed.
        state.epoch.fetch_add(1, Ordering::SeqCst);
        if let Some(stream) = state.stream.lock().unwrap().take() {
            let _ = stream.shutdown(Shutdown::Both);
        }
        Ok(())
    }
}
