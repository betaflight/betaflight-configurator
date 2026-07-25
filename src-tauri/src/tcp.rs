//! Raw TCP client commands for the configurator.
//!
//! The Tauri webview has no raw-socket API, and the Betaflight bridge
//! (github.com/betaflight/bridge) speaks plain TCP on port 5761 — not
//! WebSocket — so the JS `TauriTcp` protocol drives these commands instead.
//!
//! A single connection is held in managed state. The reader runs on its own
//! thread and forwards bytes to the frontend via the `tcp-data` event;
//! `tcp-closed` fires when the peer hangs up or the socket errors. An epoch
//! counter fences each connection so a stale reader (left over from a
//! reconnect or disconnect) can never emit against the live socket.

use std::io::{Read, Write};
use std::net::{Shutdown, TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, State};

/// Total budget for the TCP handshake, across every address a hostname resolves to.
/// `TcpStream::connect` has no timeout of its own, and an invalid/unreachable manual IP
/// would otherwise block on the OS's SYN-retry timeout, which runs to tens of seconds
/// (Windows) or minutes (Linux default).
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Default)]
pub struct TcpState {
    stream: Mutex<Option<TcpStream>>,
    epoch: Arc<AtomicU64>,
}

#[tauri::command]
pub async fn tcp_connect(
    app: AppHandle,
    state: State<'_, TcpState>,
    ip: String,
    port: u16,
) -> Result<(), String> {
    // Reserve this attempt's epoch up front, before the network attempt starts. This command
    // runs off the main thread (see below), so a slow/stale attempt can overlap a later
    // tcp_disconnect or tcp_connect; bumping here — rather than only after connecting — lets
    // the check below detect that and refuse to install a superseded connection.
    let epoch = state.epoch.clone();
    let my_epoch = epoch.fetch_add(1, Ordering::SeqCst) + 1;

    // The blocking connect itself moves to a dedicated thread (`spawn_blocking`) so it can't
    // stall an async runtime worker either. Without both this and `async fn` above, a bad
    // manual IP froze the whole window for as long as the OS took to give up.
    let connected = tauri::async_runtime::spawn_blocking(move || -> Result<TcpStream, String> {
        let addrs = (ip.as_str(), port).to_socket_addrs().map_err(|e| e.to_string())?;
        let deadline = Instant::now() + CONNECT_TIMEOUT;
        // Stays at this default only if `addrs` was empty (resolved to zero addresses);
        // the deadline can't already be exhausted at the first iteration since it was
        // just set above, so every other exit path overwrites it with a real error.
        let mut last_err = "could not resolve address".to_string();

        for addr in addrs {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                break;
            }
            match TcpStream::connect_timeout(&addr, remaining) {
                Ok(stream) => return Ok(stream),
                Err(e) => last_err = e.to_string(),
            }
        }

        Err(last_err)
    })
    .await
    .map_err(|e| e.to_string())?;

    let stream = match connected {
        Ok(stream) => stream,
        Err(e) => {
            // We bumped the epoch above, so if a connection was already installed, its
            // reader thread has already exited on the epoch mismatch even though this
            // failed attempt never replaced it. Restart a reader for it — but only if
            // nothing else raced ahead of us (a newer connect/disconnect) in the meantime,
            // since that case is already handled correctly on its own.
            let guard = state.stream.lock().unwrap();
            if epoch.load(Ordering::SeqCst) == my_epoch
                && let Some(old) = guard.as_ref()
                && let Ok(reader) = old.try_clone()
            {
                spawn_reader(app, epoch.clone(), my_epoch, reader);
            }
            return Err(e);
        }
    };

    // Disable Nagle to keep MSP round-trips snappy, matching the bridge.
    let _ = stream.set_nodelay(true);

    let reader = stream.try_clone().map_err(|e| e.to_string())?;

    // Install the new stream only if nothing superseded us while we were connecting (a
    // disconnect or a newer connect attempt would have bumped the epoch already). Checking
    // and installing under the same lock keeps this atomic against a concurrent disconnect.
    {
        let mut guard = state.stream.lock().unwrap();
        if epoch.load(Ordering::SeqCst) != my_epoch {
            drop(guard);
            let _ = stream.shutdown(Shutdown::Both);
            return Err("connection attempt superseded".into());
        }
        if let Some(old) = guard.replace(stream) {
            let _ = old.shutdown(Shutdown::Both);
        }
    }

    spawn_reader(app, epoch, my_epoch, reader);

    Ok(())
}

/// Forwards bytes from `reader` to the frontend until the peer hangs up, the socket errors,
/// or `epoch` no longer matches `my_epoch` (a later reconnect or disconnect superseded it).
fn spawn_reader(app: AppHandle, epoch: Arc<AtomicU64>, my_epoch: u64, mut reader: TcpStream) {
    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            // A newer connect/disconnect superseded us — exit without emitting.
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
}

#[tauri::command]
pub fn tcp_send(state: State<'_, TcpState>, data: Vec<u8>) -> Result<(), String> {
    let mut guard = state.stream.lock().unwrap();
    match guard.as_mut() {
        Some(stream) => stream.write_all(&data).map_err(|e| e.to_string()),
        None => Err("TCP socket is not connected".into()),
    }
}

#[tauri::command]
pub fn tcp_disconnect(state: State<'_, TcpState>) -> Result<(), String> {
    // Fence the reader first so its closure doesn't emit a spurious tcp-closed.
    state.epoch.fetch_add(1, Ordering::SeqCst);
    if let Some(stream) = state.stream.lock().unwrap().take() {
        let _ = stream.shutdown(Shutdown::Both);
    }
    Ok(())
}
