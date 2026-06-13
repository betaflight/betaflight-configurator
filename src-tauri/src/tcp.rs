//! Raw TCP client commands for the configurator.
//!
//! The Tauri webview has no raw-socket API, and the Betaflight bridge
//! (github.com/betaflight/bridge) speaks plain TCP on port 5761 — not
//! WebSocket — so the JS `TauriTcp` protocol drives these commands instead.
//!
//! A single connection is held in managed state. The reader runs on its own
//! thread and forwards bytes to the frontend via the `tcp-data` event;
//! `tcp-closed` fires when the peer hangs up or the socket errors.

use std::io::{Read, Write};
use std::net::{Shutdown, TcpStream};
use std::sync::Mutex;
use std::thread;

use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct TcpState {
    stream: Mutex<Option<TcpStream>>,
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
    *state.stream.lock().unwrap() = Some(stream);

    thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => {
                    let _ = app.emit("tcp-closed", ());
                    break;
                }
                Ok(n) => {
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
    if let Some(stream) = state.stream.lock().unwrap().take() {
        let _ = stream.shutdown(Shutdown::Both);
    }
    Ok(())
}
