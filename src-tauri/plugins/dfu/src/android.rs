use std::collections::HashMap;
use std::os::fd::{FromRawFd, OwnedFd};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use jni::objects::{GlobalRef, JClass, JObject, JString, JValue};
use jni::{JNIEnv, JavaVM};
use nusb::transfer::{ControlIn, ControlOut, ControlType, Recipient, TransferError};
use nusb::{Device, Interface, MaybeFuture};

use crate::error::{Error, Result};
use crate::models::{DeviceInfo, TransferInResult, TransferOutResult};

const DEFAULT_TIMEOUT_MS: u64 = 5000;

// ===== JNI bridge to com.betaflight.dfu.DfuNative =====

static JVM: OnceLock<JavaVM> = OnceLock::new();
static CLASS: OnceLock<GlobalRef> = OnceLock::new();

/// Called from Kotlin `DfuNative.bind()` at plugin load; captures the JavaVM
/// and a GlobalRef to the DfuNative class. The class MUST be cached here:
/// FindClass on a natively-attached thread resolves via the system class
/// loader, which cannot see APK classes, so tokio blocking threads could
/// never look it up themselves.
#[unsafe(no_mangle)]
pub extern "system" fn Java_com_betaflight_dfu_DfuNative_nativeInit(env: JNIEnv, class: JClass) {
    if let Ok(global) = env.new_global_ref(&class) {
        let _ = CLASS.set(global);
    }
    if let Ok(vm) = env.get_java_vm() {
        let _ = JVM.set(vm);
    }
}

fn not_init() -> Error {
    Error::new("DFU JNI not initialized (DfuNative.bind not called)")
}

/// Surface a pending Java exception as an Err instead of letting it silently
/// poison every subsequent JNI call on this thread.
fn map_exception(env: &mut JNIEnv, fallback: &str) -> Result<()> {
    if !env.exception_check().map_err(|e| Error::new(e.to_string()))? {
        return Ok(());
    }
    let msg: String = env
        .exception_occurred()
        .ok()
        .and_then(|exc| {
            let _ = env.exception_clear();
            let jmsg = env
                .call_method(&exc, "getMessage", "()Ljava/lang/String;", &[])
                .ok()
                .and_then(|v| v.l().ok());
            jmsg.and_then(|s| {
                let jstr = JString::from(s);
                env.get_string(&jstr).ok().map(|j| j.into())
            })
        })
        .unwrap_or_else(|| fallback.into());
    Err(Error::new(msg))
}

fn with_env<T, F>(f: F) -> Result<T>
where
    F: FnOnce(&mut JNIEnv) -> Result<T>,
{
    let vm = JVM.get().ok_or_else(not_init)?;
    let mut env = vm
        .attach_current_thread()
        .map_err(|e| Error::new(format!("JNI attach failed: {e}")))?;
    env.with_local_frame(32, |env| {
        // The exception check must run on the error path too: detaching a
        // thread with a pending Java exception aborts the process, and the
        // exception message beats jni's generic "JavaException" error.
        let out = f(env);
        map_exception(env, "DFU USB operation failed")?;
        out
    })
}

fn class() -> Result<&'static GlobalRef> {
    CLASS.get().ok_or_else(not_init)
}

fn call_with_device_name<'a>(
    env: &mut JNIEnv<'a>,
    method: &str,
    sig: &str,
    device_name: &str,
) -> Result<jni::objects::JValueOwned<'a>> {
    let name = env.new_string(device_name)?;
    Ok(env.call_static_method(class()?, method, sig, &[JValue::Object(&JObject::from(name))])?)
}

fn call_enumerate_json() -> Result<String> {
    with_env(|env| {
        let value = env.call_static_method(class()?, "enumerateJson", "()Ljava/lang/String;", &[])?;
        let jstr = JString::from(value.l()?);
        Ok(env.get_string(&jstr)?.into())
    })
}

fn call_request_permission(device_name: &str) -> Result<bool> {
    with_env(|env| {
        Ok(call_with_device_name(env, "requestPermission", "(Ljava/lang/String;)Z", device_name)?.z()?)
    })
}

fn call_open_device_fd(device_name: &str) -> Result<i32> {
    with_env(|env| Ok(call_with_device_name(env, "openDeviceFd", "(Ljava/lang/String;)I", device_name)?.i()?))
}

fn call_close_device_fd(device_name: &str) -> Result<()> {
    with_env(|env| {
        call_with_device_name(env, "closeDeviceFd", "(Ljava/lang/String;)V", device_name)?;
        Ok(())
    })
}

// ===== Open-device state =====

struct OpenDevice {
    device_name: String,
    device: Device,
    claimed: HashMap<u8, Interface>,
}

static DEVICE: Mutex<Option<OpenDevice>> = Mutex::new(None);

fn lock() -> std::sync::MutexGuard<'static, Option<OpenDevice>> {
    // A poisoned lock only means a prior USB call panicked; the Option state
    // is still coherent, so keep serving rather than wedging every command.
    DEVICE.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn current_device() -> Result<Device> {
    lock()
        .as_ref()
        .map(|open| open.device.clone())
        .ok_or_else(|| Error::new("no DFU device open"))
}

fn close_locked(open: OpenDevice) {
    // Drop claimed interfaces and the nusb Device (closing the dup'd fd)
    // before Kotlin closes the original UsbDeviceConnection fd.
    drop(open.claimed);
    drop(open.device);
    if let Err(e) = call_close_device_fd(&open.device_name) {
        eprintln!("[tauri-plugin-dfu] closeDeviceFd({}) failed: {e}", open.device_name);
    }
}

async fn blocking<T, F>(f: F) -> Result<T>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| Error::new(format!("DFU task failed: {e}")))?
}

// ===== Command implementations =====

#[derive(serde::Deserialize)]
struct EnumerationResult {
    devices: Vec<DeviceInfo>,
}

pub async fn list_devices() -> Result<Vec<DeviceInfo>> {
    blocking(|| {
        let json = call_enumerate_json()?;
        let parsed: EnumerationResult = serde_json::from_str(&json)
            .map_err(|e| Error::new(format!("bad enumeration JSON: {e}")))?;
        Ok(parsed.devices)
    })
    .await
}

pub async fn request_permission(device_name: String) -> Result<bool> {
    // Kotlin blocks up to 30 s waiting for the permission broadcast; keep that
    // wait on a blocking thread so the webview and main thread stay live.
    blocking(move || call_request_permission(&device_name)).await
}

fn open_nusb_device(fd: i32) -> Result<Device> {
    if fd < 0 {
        return Err(Error::new(format!("openDeviceFd returned bad fd {fd}")));
    }
    // Kotlin's UsbDeviceConnection still owns fd; dup so nusb's OwnedFd
    // closing on drop cannot pull the connection out from under Kotlin.
    let dup_fd = unsafe { libc::dup(fd) };
    if dup_fd < 0 {
        return Err(Error::new(format!(
            "dup failed: {}",
            std::io::Error::last_os_error()
        )));
    }
    let owned = unsafe { OwnedFd::from_raw_fd(dup_fd) };
    Device::from_fd(owned)
        .wait()
        .map_err(|e| Error::new(format!("nusb open from fd failed: {e}")))
}

pub async fn open_device(device_name: String) -> Result<()> {
    blocking(move || {
        if let Some(open) = lock().take() {
            close_locked(open);
        }
        let fd = call_open_device_fd(&device_name)?;
        let device = match open_nusb_device(fd) {
            Ok(device) => device,
            Err(e) => {
                // openDeviceFd succeeded, so Kotlin cached a connection that
                // nothing else will ever close now that the open failed.
                let _ = call_close_device_fd(&device_name);
                return Err(e);
            }
        };
        *lock() = Some(OpenDevice {
            device_name,
            device,
            claimed: HashMap::new(),
        });
        Ok(())
    })
    .await
}

pub async fn claim_interface(interface_number: u8) -> Result<()> {
    blocking(move || {
        let (device, device_name) = {
            let guard = lock();
            let open = guard.as_ref().ok_or_else(|| Error::new("no DFU device open"))?;
            (open.device.clone(), open.device_name.clone())
        };
        let interface = device
            .detach_and_claim_interface(interface_number)
            .wait()
            .map_err(|e| Error::new(format!("claim interface {interface_number} failed: {e}")))?;
        // The lock is dropped during the blocking claim; only record the claim
        // if the same device is still the open one.
        match lock().as_mut() {
            Some(open) if open.device_name == device_name => {
                open.claimed.insert(interface_number, interface);
                Ok(())
            }
            _ => Err(Error::new("device changed while claiming interface")),
        }
    })
    .await
}

pub async fn release_interface(interface_number: u8) -> Result<()> {
    blocking(move || {
        if let Some(open) = lock().as_mut() {
            open.claimed.remove(&interface_number);
        }
        Ok(())
    })
    .await
}

pub async fn close_device() -> Result<()> {
    blocking(|| {
        if let Some(open) = lock().take() {
            close_locked(open);
        }
        Ok(())
    })
    .await
}

fn parse_control_type(request_type: &str) -> Result<ControlType> {
    match request_type {
        "standard" => Ok(ControlType::Standard),
        "class" => Ok(ControlType::Class),
        "vendor" => Ok(ControlType::Vendor),
        other => Err(Error::new(format!("unknown requestType: {other}"))),
    }
}

fn parse_recipient(recipient: &str) -> Result<Recipient> {
    match recipient {
        "device" => Ok(Recipient::Device),
        "interface" => Ok(Recipient::Interface),
        "endpoint" => Ok(Recipient::Endpoint),
        "other" => Ok(Recipient::Other),
        other => Err(Error::new(format!("unknown recipient: {other}"))),
    }
}

pub async fn control_transfer_in(
    request_type: String,
    recipient: String,
    request: u8,
    value: u16,
    index: u16,
    length: u16,
    timeout_ms: Option<u64>,
) -> Result<TransferInResult> {
    blocking(move || {
        let device = current_device()?;
        let setup = ControlIn {
            control_type: parse_control_type(&request_type)?,
            recipient: parse_recipient(&recipient)?,
            request,
            value,
            index,
            length,
        };
        let timeout = Duration::from_millis(timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS));
        match device.control_in(setup, timeout).wait() {
            Ok(data) => Ok(TransferInResult {
                status: "ok".into(),
                data,
            }),
            // WebUSB reports a stall as a completed transfer with status
            // "stall"; the shared descriptor layer relies on that distinction.
            Err(TransferError::Stall) => Ok(TransferInResult {
                status: "stall".into(),
                data: Vec::new(),
            }),
            Err(e) => Err(Error::new(format!("control transfer in failed: {e}"))),
        }
    })
    .await
}

pub async fn control_transfer_out(
    request_type: String,
    recipient: String,
    request: u8,
    value: u16,
    index: u16,
    data: Vec<u8>,
    timeout_ms: Option<u64>,
) -> Result<TransferOutResult> {
    blocking(move || {
        let device = current_device()?;
        let setup = ControlOut {
            control_type: parse_control_type(&request_type)?,
            recipient: parse_recipient(&recipient)?,
            request,
            value,
            index,
            data: &data,
        };
        let timeout = Duration::from_millis(timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS));
        match device.control_out(setup, timeout).wait() {
            Ok(()) => Ok(TransferOutResult { status: "ok".into() }),
            Err(TransferError::Stall) => Ok(TransferOutResult {
                status: "stall".into(),
            }),
            Err(e) => Err(Error::new(format!("control transfer out failed: {e}"))),
        }
    })
    .await
}
