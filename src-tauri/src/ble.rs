//! Native BLE (GATT central) commands for the configurator.
//!
//! The Tauri webview exposes no usable Web Bluetooth on iOS (WKWebView has no
//! `navigator.bluetooth`), so the JS `TauriBle` protocol drives these commands
//! instead. Backed by btleplug, whose CoreBluetooth backend is shared between
//! macOS and iOS — hence this module is gated to Apple targets (Linux would pull
//! in libdbus and Windows a separate WinRT path; neither is needed for the iOS
//! spike and both would touch desktop CI).
//!
//! A single connection is held in managed state. Notifications from the read
//! characteristic are forwarded to the frontend via the `ble-data` event, and
//! `ble-disconnected` fires when the link drops. An epoch counter fences each
//! connection so a stale notification task (left over from a reconnect or
//! disconnect) can never emit against the live peripheral.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use btleplug::api::{Central, CharPropFlags, Characteristic, Manager as _, Peripheral as _, ScanFilter, WriteType};
use btleplug::platform::{Adapter, Manager, Peripheral};

/// How long a scan runs before returning the peripherals seen so far. BLE
/// advertisements arrive every few hundred ms, so a couple of seconds catches
/// the modules in range without making the picker feel stuck.
const SCAN_DURATION: Duration = Duration::from_secs(3);

/// A discovered peripheral, surfaced to the device picker.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BleDevice {
    id: String,
    name: String,
    services: Vec<String>,
}

/// One entry of the JS `bluetoothDevices` table — the authoritative GATT map
/// (remotely overridable), passed in at connect time so the Rust side never
/// hard-codes UUIDs.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BleDeviceDescriptor {
    service_uuid: String,
    write_characteristic: String,
    read_characteristic: String,
}

/// Which descriptor matched, so the frontend can restore its `deviceDescription`
/// (used for the CC2541 CRC-corruption workaround).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BleConnectResult {
    service_uuid: String,
}

#[derive(Default)]
pub struct BleState {
    adapter: Mutex<Option<Adapter>>,
    peripheral: Mutex<Option<Peripheral>>,
    write_char: Mutex<Option<Characteristic>>,
    epoch: Arc<AtomicU64>,
}

/// Lazily create and cache the first BLE adapter. The same adapter instance must
/// serve both scan and connect: it holds the discovered-peripheral map that
/// `peripheral()` lookups resolve against.
async fn get_adapter(state: &State<'_, BleState>) -> Result<Adapter, String> {
    if let Some(adapter) = state.adapter.lock().unwrap().clone() {
        return Ok(adapter);
    }
    let manager = Manager::new().await.map_err(|e| e.to_string())?;
    let adapter = manager
        .adapters()
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| "no Bluetooth adapter available".to_string())?;
    *state.adapter.lock().unwrap() = Some(adapter.clone());
    Ok(adapter)
}

#[tauri::command]
pub async fn ble_scan(state: State<'_, BleState>) -> Result<Vec<BleDevice>, String> {
    let adapter = get_adapter(&state).await?;

    // Empty filter = discover everything, mirroring Web Bluetooth's acceptAllDevices;
    // service matching happens at connect time against the JS descriptor table.
    adapter.start_scan(ScanFilter::default()).await.map_err(|e| e.to_string())?;
    tokio::time::sleep(SCAN_DURATION).await;
    let _ = adapter.stop_scan().await;

    let peripherals = adapter.peripherals().await.map_err(|e| e.to_string())?;
    let mut devices = Vec::new();
    for peripheral in peripherals {
        let props = peripheral.properties().await.ok().flatten();
        // A peripheral with no advertised name is almost never a user-selectable FC
        // bridge and only clutters the picker, so drop it.
        let Some(name) = props.as_ref().and_then(|p| p.local_name.clone()) else {
            continue;
        };
        let services = props.map(|p| p.services.iter().map(|u| u.to_string()).collect()).unwrap_or_default();
        devices.push(BleDevice {
            id: peripheral.id().to_string(),
            name,
            services,
        });
    }
    Ok(devices)
}

#[tauri::command]
pub async fn ble_connect(
    app: AppHandle,
    state: State<'_, BleState>,
    id: String,
    devices: Vec<BleDeviceDescriptor>,
) -> Result<BleConnectResult, String> {
    // Reserve this attempt's epoch before any await, so a slower attempt that gets
    // superseded by a later connect/disconnect refuses to install its peripheral.
    let epoch = state.epoch.clone();
    let my_epoch = epoch.fetch_add(1, Ordering::SeqCst) + 1;

    let adapter = get_adapter(&state).await?;
    let peripherals = adapter.peripherals().await.map_err(|e| e.to_string())?;
    let peripheral = peripherals
        .into_iter()
        .find(|p| p.id().to_string() == id)
        .ok_or_else(|| "device not found — rescan and try again".to_string())?;

    peripheral.connect().await.map_err(|e| e.to_string())?;
    peripheral.discover_services().await.map_err(|e| e.to_string())?;

    let characteristics = peripheral.characteristics();
    let mut matched: Option<(String, Characteristic, Characteristic)> = None;
    for descriptor in &devices {
        let (Ok(service_uuid), Ok(write_uuid), Ok(read_uuid)) = (
            Uuid::parse_str(&descriptor.service_uuid),
            Uuid::parse_str(&descriptor.write_characteristic),
            Uuid::parse_str(&descriptor.read_characteristic),
        ) else {
            continue;
        };
        let write = characteristics.iter().find(|c| c.service_uuid == service_uuid && c.uuid == write_uuid);
        let read = characteristics.iter().find(|c| c.service_uuid == service_uuid && c.uuid == read_uuid);
        if let (Some(write), Some(read)) = (write, read) {
            matched = Some((descriptor.service_uuid.clone(), write.clone(), read.clone()));
            break;
        }
    }

    let (service_uuid, write_char, read_char) = match matched {
        Some(found) => found,
        None => {
            let _ = peripheral.disconnect().await;
            return Err("device exposes no supported Betaflight GATT service".to_string());
        }
    };

    peripheral.subscribe(&read_char).await.map_err(|e| e.to_string())?;

    // Install only if nothing superseded us while connecting; check and install under
    // the same lock so a concurrent disconnect can't race the store.
    {
        let mut guard = state.peripheral.lock().unwrap();
        if epoch.load(Ordering::SeqCst) != my_epoch {
            drop(guard);
            let _ = peripheral.disconnect().await;
            return Err("connection attempt superseded".to_string());
        }
        *guard = Some(peripheral.clone());
        *state.write_char.lock().unwrap() = Some(write_char);
    }

    spawn_notifications(app, epoch, my_epoch, peripheral, read_char.uuid);

    Ok(BleConnectResult { service_uuid })
}

/// Forwards notifications from the read characteristic to the frontend until the
/// peripheral drops the link or `epoch` no longer matches (a later reconnect or
/// disconnect superseded it). The stream ending is treated as a disconnect.
fn spawn_notifications(app: AppHandle, epoch: Arc<AtomicU64>, my_epoch: u64, peripheral: Peripheral, read_uuid: Uuid) {
    tauri::async_runtime::spawn(async move {
        let mut stream = match peripheral.notifications().await {
            Ok(stream) => stream,
            Err(_) => {
                if epoch.load(Ordering::SeqCst) == my_epoch {
                    let _ = app.emit("ble-disconnected", ());
                }
                return;
            }
        };

        while let Some(notification) = stream.next().await {
            if epoch.load(Ordering::SeqCst) != my_epoch {
                return;
            }
            if notification.uuid == read_uuid {
                let _ = app.emit("ble-data", notification.value);
            }
        }

        // Stream ended: the link is gone. Only report it if we are still the live epoch.
        if epoch.load(Ordering::SeqCst) == my_epoch {
            let _ = app.emit("ble-disconnected", ());
        }
    });
}

#[tauri::command]
pub async fn ble_send(state: State<'_, BleState>, data: Vec<u8>) -> Result<(), String> {
    // Clone the handles out from under the locks before awaiting; btleplug's
    // Peripheral/Characteristic are cheap Arc-backed clones.
    let peripheral = state.peripheral.lock().unwrap().clone();
    let write_char = state.write_char.lock().unwrap().clone();
    let (Some(peripheral), Some(write_char)) = (peripheral, write_char) else {
        return Err("BLE peripheral is not connected".to_string());
    };

    // Prefer acknowledged writes when the characteristic supports them (matching the
    // Web Bluetooth path), falling back to write-without-response otherwise.
    let write_type = if write_char.properties.contains(CharPropFlags::WRITE) {
        WriteType::WithResponse
    } else {
        WriteType::WithoutResponse
    };

    peripheral.write(&write_char, &data, write_type).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ble_disconnect(state: State<'_, BleState>) -> Result<(), String> {
    // Fence the notification task first so its stream-end doesn't emit a spurious
    // ble-disconnected after an intentional teardown.
    state.epoch.fetch_add(1, Ordering::SeqCst);
    let peripheral = state.peripheral.lock().unwrap().take();
    *state.write_char.lock().unwrap() = None;
    if let Some(peripheral) = peripheral {
        let _ = peripheral.disconnect().await;
    }
    Ok(())
}
