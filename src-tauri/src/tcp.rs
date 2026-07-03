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
use std::net::{Shutdown, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use tauri::{AppHandle, Emitter, State};

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

    Ok(())
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
