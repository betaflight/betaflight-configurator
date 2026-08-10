//! Native BLE (GATT central) commands for the configurator.
//!
//! Used wherever the webview exposes no usable Web Bluetooth: iOS and macOS
//! (WKWebView) and Android (System WebView). The JS `TauriBle` protocol drives
//! these commands and receives notification bytes via the `ble-data` event, with
//! `ble-disconnected` when the link drops.
//!
//! Backed by `tauri-plugin-blec`, which speaks to a Kotlin GATT client on Android
//! and to btleplug/CoreBluetooth on Apple. The plugin owns the connection state;
//! this module keeps only the write target chosen at connect time, plus a
//! generation counter so a superseded attempt's notifications can never be
//! emitted against a newer connection.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex as TokioMutex;
use uuid::Uuid;

use tauri_plugin_blec::models::{BleDevice, CharProps, ScanFilter, Service, WriteType};
use tauri_plugin_blec::{get_handler, OnDisconnectHandler};

/// How long a scan runs before returning the peripherals seen so far. BLE
/// advertisements arrive every few hundred ms, so a couple of seconds catches
/// the modules in range without making the picker feel stuck.
const SCAN_DURATION_MS: u64 = 3000;

/// A discovered peripheral, surfaced to the device picker.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedDevice {
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

/// The characteristic `ble_send` writes to, resolved once at connect time.
#[derive(Clone)]
struct WriteTarget {
    service: Uuid,
    characteristic: Uuid,
    write_type: WriteType,
}

#[derive(Default)]
pub struct BleState {
    write_target: Mutex<Option<WriteTarget>>,
    generation: Arc<AtomicU64>,
    /// The plugin exposes one process-wide connection, so a connect and a disconnect
    /// that overlap act on the same link: a losing connect's cleanup would otherwise
    /// tear down the winner. Held across each whole transition, not just the state
    /// writes. Not taken by `ble_send`, which must not block behind a scan.
    transition: TokioMutex<()>,
}

/// blec substitutes an identifier for the advertised name when a peripheral has
/// none: the empty string on Android, and the CoreBluetooth UUID (i.e. the
/// address) on Apple. Such a peripheral is almost never a user-selectable FC
/// bridge and only clutters the picker.
fn is_nameless(device: &BleDevice) -> bool {
    device.name.is_empty() || device.name == device.address
}

/// Runs a scan and returns the peripherals seen. `discover` returns as soon as it
/// has spawned its task and then pushes the *cumulative* list every 200 ms, so the
/// last message is the full result. The receiver must stay alive for the whole
/// window: the scan task panics if it can no longer send.
async fn scan_devices() -> Result<Vec<BleDevice>, String> {
    // blec never asks for the Android runtime permissions on its own, and its scan
    // hard-rejects without them. A no-op on every other platform.
    //
    // This covers the Bluetooth permissions only. Below API 31 Android also withholds
    // scan results until location is granted, and this wrapper cannot ask for it — it
    // does not forward the flag the plugin gates that on. TauriBle requests it directly
    // on the versions that need it, before calling this.
    tauri_plugin_blec::check_permissions(true).map_err(|e| e.to_string())?;

    let handler = get_handler().map_err(|e| e.to_string())?;
    let (tx, mut rx) = tokio::sync::mpsc::channel(8);
    handler
        .discover(Some(tx), SCAN_DURATION_MS, ScanFilter::None, false)
        .await
        .map_err(|e| e.to_string())?;

    let mut devices = Vec::new();
    while let Some(batch) = rx.recv().await {
        devices = batch;
    }
    Ok(devices)
}

#[tauri::command]
pub async fn ble_scan() -> Result<Vec<ScannedDevice>, String> {
    let devices = scan_devices().await?;
    Ok(devices
        .into_iter()
        .filter(|device| !is_nameless(device))
        .map(|device| ScannedDevice {
            id: device.address,
            name: device.name,
            services: device.services.iter().map(Uuid::to_string).collect(),
        })
        .collect())
}

/// The GATT profile resolved against a connected peripheral.
struct MatchedProfile {
    /// As written in the JS table, so the frontend can look the entry back up.
    service_uuid: String,
    service: Uuid,
    write: Uuid,
    read: Uuid,
    write_type: WriteType,
}

/// Picks the first descriptor whose service and both characteristics resolve on
/// the connected peripheral. Order matters: the JS table lists device variants
/// most-specific first, which is what lets a family like SpeedyBee fall through
/// to the profile it actually implements.
fn match_descriptor(services: &[Service], descriptors: &[BleDeviceDescriptor]) -> Option<MatchedProfile> {
    for descriptor in descriptors {
        let (Ok(service_uuid), Ok(write_uuid), Ok(read_uuid)) = (
            Uuid::parse_str(&descriptor.service_uuid),
            Uuid::parse_str(&descriptor.write_characteristic),
            Uuid::parse_str(&descriptor.read_characteristic),
        ) else {
            continue;
        };

        let Some(service) = services.iter().find(|s| s.uuid == service_uuid) else {
            continue;
        };
        let Some(write) = service.characteristics.iter().find(|c| c.uuid == write_uuid) else {
            continue;
        };
        if !service.characteristics.iter().any(|c| c.uuid == read_uuid) {
            continue;
        }

        // Prefer acknowledged writes when the characteristic supports them (matching
        // the Web Bluetooth path), falling back to write-without-response otherwise.
        let write_type = if write.properties.contains(CharProps::Write) {
            WriteType::WithResponse
        } else {
            WriteType::WithoutResponse
        };
        return Some(MatchedProfile {
            service_uuid: descriptor.service_uuid.clone(),
            service: service_uuid,
            write: write_uuid,
            read: read_uuid,
            write_type,
        });
    }
    None
}

/// Reports the link dropping, unless a later connect or disconnect superseded this
/// attempt. `OnDisconnectHandler` is a one-shot, so each connect needs a fresh one.
fn disconnect_emitter(app: AppHandle, generation: Arc<AtomicU64>, my_generation: u64) -> OnDisconnectHandler {
    OnDisconnectHandler::from_sync(move || {
        if generation.load(Ordering::SeqCst) == my_generation {
            let _ = app.emit("ble-disconnected", ());
        }
    })
}

#[tauri::command]
pub async fn ble_connect(
    app: AppHandle,
    state: State<'_, BleState>,
    id: String,
    devices: Vec<BleDeviceDescriptor>,
) -> Result<BleConnectResult, String> {
    // Serialise the whole attempt against other transitions, so a cleanup here can
    // never tear down a link that a concurrent connect established.
    let _transition = state.transition.lock().await;

    // Reserve this attempt's generation before any await, so an attempt superseded
    // by a later connect or disconnect can no longer emit.
    let generation = state.generation.clone();
    let my_generation = generation.fetch_add(1, Ordering::SeqCst) + 1;

    let handler = get_handler().map_err(|e| e.to_string())?;

    // blec resolves the address against the peripherals cached by its last scan, so
    // a reconnect to a remembered device on a cold start finds nothing. Scan once
    // and retry rather than making the frontend care.
    let emit_disconnect = || disconnect_emitter(app.clone(), generation.clone(), my_generation);
    if let Err(err) = handler.connect(&id, emit_disconnect(), false).await {
        scan_devices().await?;
        handler
            .connect(&id, emit_disconnect(), false)
            .await
            .map_err(|retry_err| format!("{err} (after rescan: {retry_err})"))?;
    }

    // Must happen before any later scan: blec clears its peripheral cache when a new
    // discover starts, and this call resolves the address against that cache.
    let services = match handler.discover_services(&id).await {
        Ok(services) => services,
        Err(e) => {
            let _ = handler.disconnect().await;
            return Err(e.to_string());
        }
    };

    let Some(profile) = match_descriptor(&services, &devices) else {
        let _ = handler.disconnect().await;
        return Err("device exposes no supported Betaflight GATT service".to_string());
    };

    let subscribe_result = {
        let app = app.clone();
        let generation = generation.clone();
        handler
            .subscribe(profile.read, Some(profile.service), move |data: Vec<u8>| {
                if generation.load(Ordering::SeqCst) == my_generation {
                    let _ = app.emit("ble-data", data);
                }
            })
            .await
    };
    if let Err(e) = subscribe_result {
        let _ = handler.disconnect().await;
        return Err(e.to_string());
    }

    // Refuse to install if something superseded us while connecting.
    if generation.load(Ordering::SeqCst) != my_generation {
        let _ = handler.disconnect().await;
        return Err("connection attempt superseded".to_string());
    }
    *state.write_target.lock().unwrap() = Some(WriteTarget {
        service: profile.service,
        characteristic: profile.write,
        write_type: profile.write_type,
    });

    Ok(BleConnectResult {
        service_uuid: profile.service_uuid,
    })
}

#[tauri::command]
pub async fn ble_send(state: State<'_, BleState>, data: Vec<u8>) -> Result<(), String> {
    let target = state.write_target.lock().unwrap().clone();
    let Some(target) = target else {
        return Err("BLE peripheral is not connected".to_string());
    };

    get_handler()
        .map_err(|e| e.to_string())?
        .send_data(target.characteristic, Some(target.service), &data, target.write_type)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ble_disconnect(state: State<'_, BleState>) -> Result<(), String> {
    let _transition = state.transition.lock().await;

    // Bump first so the disconnect callback doesn't emit a spurious ble-disconnected
    // after an intentional teardown.
    state.generation.fetch_add(1, Ordering::SeqCst);
    *state.write_target.lock().unwrap() = None;

    get_handler()
        .map_err(|e| e.to_string())?
        .disconnect()
        .await
        .map_err(|e| e.to_string())
}
