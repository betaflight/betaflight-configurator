# Android DFU (Device Firmware Update) Implementation Plan

## Overview

The Betaflight Configurator currently supports DFU flashing on desktop browsers via the **WebUSB API** (`webusbdfu.js`). On Android, WebUSB is not available inside a Capacitor WebView. This document describes how to implement a native Android Capacitor plugin (`BetaflightDfuPlugin`) that replicates the same DFU protocol used by `webusbdfu.js`, but using Android's native `UsbManager` APIs.

**Key decision: We are NOT using the Nordic DFU library.** The Nordic library implements the Nordic-specific BLE DFU protocol, which is designed for Nordic nRF chips. Betaflight flight controllers use **STM32 USB DFU** (a USB control transfer protocol defined by ST Microelectronics), along with GD32, AT32, APM32, and RP2040 DFU bootloaders. These are all **USB-based** DFU protocols, not BLE-based. The implementation must use Android's `UsbManager` and `UsbDeviceConnection` to perform USB control transfers directly, mirroring what `webusbdfu.js` does via WebUSB.

---

## Current Architecture

### Desktop/Web Flow
```
FirmwareFlasherTab.vue
  -> useFirmwareFlashing.js (composable)
    -> webusbdfu.js (WebUSB API - navigator.usb)
      -> USB control transfers to STM32 DFU bootloader
```

### Existing Android Plugins (pattern to follow)
```
android/app/src/main/java/betaflight/app/protocols/
├── serial/
│   ├── BetaflightSerialPlugin.java    # @CapacitorPlugin, USB serial via usb-serial-for-android
│   └── UsbPermissionReceiver.java     # Explicit BroadcastReceiver for Android 14+
├── ble/
│   └── BetaflightBlePlugin.java       # @CapacitorPlugin, BLE via Nordic BLE library
└── tcp/
    └── BetaflightTcpPlugin.java       # @CapacitorPlugin, raw TCP sockets
```

Each plugin follows this pattern:
1. **Native Java plugin** extending `com.getcapacitor.Plugin` with `@CapacitorPlugin` annotation
2. **Registration** in `MainActivity.java` via `registerPlugin()`
3. **JS adapter** in `src/js/protocols/` that wraps `Capacitor.Plugins.PluginName`
4. **Integration** into `port_handler.js` and `useFirmwareFlashing.js`

### Platform Detection
`src/js/utils/checkCompatibility.js` already has:
- `isAndroid()` - detects Capacitor Android platform
- `checkUsbSupport()` - currently returns `false` for Android (marked "Not implemented yet")

### Current DFU Protocol (`webusbdfu.js`)

The existing implementation is a 1,377-line state machine that:
1. **Discovers** DFU devices via `navigator.usb.getDevices()` with vendor/product ID filters
2. **Opens** the USB device and claims interface 0
3. **Reads chip info** from USB interface descriptors (flash layout, memory map)
4. **Erases** flash pages via DFU DNLOAD commands with erase opcodes
5. **Writes** firmware in blocks (transfer size typically 2048 bytes)
6. **Verifies** by reading back and comparing
7. **Exits DFU** mode to boot the new firmware

All communication uses USB control transfers:
- **Request type**: Class, Recipient: Interface
- **DFU requests**: DETACH(0x00), DNLOAD(0x01), UPLOAD(0x02), GETSTATUS(0x03), CLRSTATUS(0x04), GETSTATE(0x05), ABORT(0x06)

### Supported DFU Devices (from `devices.js`)
| Vendor ID | Product ID | Device |
|-----------|-----------|--------|
| 1155 (0x0483) | 57105 (0xDF11) | STM32 DFU Mode |
| 10473 (0x28E9) | 393 (0x0189) | GD32 DFU Bootloader |
| 11836 (0x2E3C) | 57105 (0xDF11) | AT32F435 DFU Bootloader |
| 12619 (0x314B) | 262 (0x0106) | APM32 DFU Bootloader |
| 11914 (0x2E8A) | 15 (0x000F) | Raspberry Pi Pico Bootloader |

These are already declared in `android/app/src/main/res/xml/device_filter.xml`.

---

## Implementation Plan

### Phase 1: Native Plugin (Java)

#### 1.1 Create `BetaflightDfuPlugin.java`

**Location**: `android/app/src/main/java/betaflight/app/protocols/dfu/BetaflightDfuPlugin.java`

```java
package betaflight.app.protocols.dfu;

@CapacitorPlugin(
    name = "BetaflightDfu",
    permissions = {
        @Permission(strings = {}, alias = "usb")
    }
)
public class BetaflightDfuPlugin extends Plugin {
    // ...
}
```

**Plugin Methods** (matching `webusbdfu.js` interface):

| Method | Parameters | Description |
|--------|-----------|-------------|
| `getDevices()` | - | List DFU-mode USB devices with permission |
| `requestPermission()` | - | Request USB access for DFU devices |
| `openDevice(call)` | `{ deviceId }` | Open device, claim interface 0, read descriptors |
| `controlTransferIn(call)` | `{ request, value, iface, length }` | USB control transfer IN (device -> host) |
| `controlTransferOut(call)` | `{ request, value, iface, data }` | USB control transfer OUT (host -> device) |
| `closeDevice(call)` | - | Release interface, close connection |
| `resetDevice(call)` | - | Reset USB device |
| `getStringDescriptor(call)` | `{ index }` | Read USB string descriptor |
| `getInterfaceDescriptors(call)` | `{ interfaceNum }` | Read interface alternate setting descriptors |
| `getFunctionalDescriptor(call)` | `{ iface }` | Read DFU functional descriptor |

**Why low-level control transfer methods?**

The existing `webusbdfu.js` implements a complex state machine with:
- Chip-specific workarounds (H743 Rev.V busy state handling)
- Read-unprotect procedures with timed waits
- Multi-block erase/write/verify with progress
- Flash layout parsing from descriptors

Rather than reimplementing this entire state machine in Java (duplicating 1,377 lines of battle-tested logic), the plugin exposes **low-level USB control transfers**. The existing JavaScript state machine (`webusbdfu.js`) orchestrates the DFU protocol and simply calls into the native plugin for USB I/O. This approach:
- Avoids duplicating protocol logic across two languages
- Keeps the single source of truth in JS (easier to maintain, test, and debug)
- Matches how WebUSB works (JS controls the protocol, browser provides USB I/O)
- Allows all chip-specific workarounds to remain in one place

#### 1.2 Core Implementation Details

**USB Device Detection** - Filter by DFU vendor/product IDs:
```java
private static final int[][] DFU_DEVICE_FILTERS = {
    {0x0483, 0xDF11},  // STM32 DFU
    {0x28E9, 0x0189},  // GD32 DFU
    {0x2E3C, 0xDF11},  // AT32F435 DFU
    {0x314B, 0x0106},  // APM32 DFU
    {0x2E8A, 0x000F},  // Raspberry Pi Pico Bootloader
};
```

**Control Transfers** - Map to `UsbDeviceConnection`:
```java
// IN transfer (device -> host)
byte[] buffer = new byte[length];
int result = connection.controlTransfer(
    UsbConstants.USB_DIR_IN | UsbConstants.USB_TYPE_CLASS | UsbConstants.USB_RECIP_INTERFACE,
    request, value, iface, buffer, length, timeout
);

// OUT transfer (host -> device)
int result = connection.controlTransfer(
    UsbConstants.USB_DIR_OUT | UsbConstants.USB_TYPE_CLASS | UsbConstants.USB_RECIP_INTERFACE,
    request, value, iface, data, data.length, timeout
);
```

**Data Encoding** - Use hex strings (consistent with BetaflightSerialPlugin):
```java
// JS sends: { request: 3, value: 0, iface: 0, length: 6 }
// Java returns: { data: "00000002000000", status: "ok" }
```

**Permission Handling** - Reuse the same pattern as BetaflightSerialPlugin:
- `UsbPermissionReceiver` for Android 14+ explicit broadcast receiver
- `PendingIntent` flags matching SDK version

**Device Attach/Detach Events**:
- `notifyListeners("deviceAttached", deviceInfo)` - DFU device plugged in
- `notifyListeners("deviceDetached", deviceInfo)` - DFU device removed

#### 1.3 String Descriptor Reading

The DFU protocol requires reading USB string descriptors to get chip info (flash layout).
Android's `UsbDeviceConnection` supports this via raw control transfers:

```java
// Standard USB GET_DESCRIPTOR request for string descriptor
byte[] buffer = new byte[255];
int result = connection.controlTransfer(
    UsbConstants.USB_DIR_IN | UsbConstants.USB_TYPE_STANDARD | UsbConstants.USB_RECIP_DEVICE,
    0x06,            // GET_DESCRIPTOR
    0x0300 | index,  // STRING descriptor type | index
    0,               // language ID
    buffer, 255, 1000
);
```

#### 1.4 Interface Descriptor Reading

Required for parsing flash memory layout. The chip reports its flash sectors
via DFU interface alternate setting strings (e.g., `"@Internal Flash /0x08000000/04*016Kg,01*064Kg,07*128Kg"`).

```java
// GET_DESCRIPTOR for configuration (includes interface descriptors)
byte[] buffer = new byte[255];
int result = connection.controlTransfer(
    UsbConstants.USB_DIR_IN | UsbConstants.USB_TYPE_STANDARD | UsbConstants.USB_RECIP_DEVICE,
    0x06,    // GET_DESCRIPTOR
    0x0200,  // CONFIGURATION descriptor type
    0,
    buffer, 18 + interfaceIndex * 9, 1000
);
```

**Note**: Android's `UsbInterface.getName()` (API 21+) may provide alternate setting names directly, but the raw descriptor approach from `webusbdfu.js` must be preserved because:
- Multiple alternate settings contain different memory region descriptors
- The parsing logic in JS depends on the exact descriptor string format

### Phase 2: JavaScript Adapter

#### 2.1 Create `CapacitorDfu.js`

**Location**: `src/js/protocols/CapacitorDfu.js`

This adapter mirrors the `WEBUSBDFU_protocol` interface but routes USB operations through the native plugin:

```javascript
import { Capacitor } from "@capacitor/core";

const BetaflightDfu = Capacitor?.Plugins?.BetaflightDfu;

class CapacitorDfu extends EventTarget {
    constructor() {
        super();
        this.logHead = "[CAPACITOR DFU]";
        // ... same state as WEBUSBDFU_protocol ...

        // Listen for device events from native
        BetaflightDfu.addListener("deviceAttached", (device) => { ... });
        BetaflightDfu.addListener("deviceDetached", (device) => { ... });
    }

    // Mirror the WEBUSBDFU_protocol public API
    async getDevices() { ... }
    async requestPermission() { ... }
    async connect(devicePath, hex, options, callback) { ... }
    // ... etc
}
```

**Critical**: The adapter should reuse as much of `webusbdfu.js`'s logic as possible. Two approaches:

**Option A (Recommended): Refactor `webusbdfu.js` to accept a transport backend**

Extract the USB I/O into an interface, with two implementations:
```javascript
// WebUsbTransport.js - uses navigator.usb (desktop)
// CapacitorUsbTransport.js - uses BetaflightDfu plugin (Android)

class DfuProtocol extends EventTarget {
    constructor(transport) {
        this.transport = transport;  // WebUsbTransport or CapacitorUsbTransport
    }

    controlTransfer(direction, request, value, iface, length, data, callback) {
        // Delegates to this.transport
    }
}
```

**Option B: Full parallel implementation**

Create `CapacitorDfu.js` as a standalone class that duplicates the `WEBUSBDFU_protocol` state machine but uses native plugin calls instead of WebUSB. This is simpler initially but means maintaining protocol logic in two places.

#### 2.2 Transport Interface (Option A detail)

The transport must support these operations:

```javascript
class UsbTransport extends EventTarget {
    // Device discovery
    async getDevices(filters) -> [{ path, displayName, vendorId, productId, device }]
    async requestPermission(filters) -> device | null

    // Device lifecycle
    async open(device) -> void
    async close() -> void
    async reset() -> void
    async selectConfiguration(configId) -> void
    async claimInterface(interfaceNum) -> void
    async releaseInterface(interfaceNum) -> void

    // Transfers
    async controlTransferIn(setup, length) -> { status, data }
    async controlTransferOut(setup, data) -> { status }

    // Descriptors (used for chip info)
    async getStringDescriptor(index) -> string
    async getInterfaceDescriptors(interfaceNum) -> [string]
    async getFunctionalDescriptor(interfaceNum) -> { bLength, bmAttributes, wDetachTimeOut, wTransferSize, bcdDFUVersion }

    // Events: "connect", "disconnect"
}
```

### Phase 3: Integration

#### 3.1 Register Plugin in `MainActivity.java`

```java
import betaflight.app.protocols.dfu.BetaflightDfuPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BetaflightSerialPlugin.class);
        registerPlugin(BetaflightBlePlugin.class);
        registerPlugin(BetaflightTcpPlugin.class);
        registerPlugin(BetaflightDfuPlugin.class);  // <-- Add
        super.onCreate(savedInstanceState);
    }
}
```

#### 3.2 Enable DFU Support in `checkCompatibility.js`

```javascript
export function checkUsbSupport() {
    let result = false;
    if (isAndroid()) {
        result = true;  // <-- Enable (was "Not implemented yet")
    } else if (navigator.usb) {
        result = true;
    }
    return result;
}
```

#### 3.3 Update `port_handler.js`

The port handler needs to listen to the Capacitor DFU adapter for device events on Android:

```javascript
import CapacitorDfu from "./protocols/CapacitorDfu";
import { isAndroid } from "./utils/checkCompatibility";

// In initialize():
const dfuProtocol = isAndroid() ? new CapacitorDfu() : WEBUSBDFU;
dfuProtocol.addEventListener("addedDevice", (event) => this.addedUsbDevice(event.detail));
dfuProtocol.addEventListener("removedDevice", (event) => this.removedUsbDevice(event.detail));
```

#### 3.4 Update `useFirmwareFlashing.js`

The flashing composable selects DFU protocol based on port prefix:

```javascript
import { isAndroid } from "../js/utils/checkCompatibility";

// In flashHexFirmware():
const dfu = isAndroid() ? CapacitorDfu : DFU;

if (isDFU) {
    dfu.connect(port, firmware, flashing_options);
}
```

#### 3.5 Port Naming Convention

Maintain consistency with existing patterns:
- Serial ports: `capacitor-<deviceId>` (existing)
- DFU ports: `usb_<vendorId>:<productId>:<deviceId>` (new, matches `webusbdfu.js` style)

The `isDFU` check in `useFirmwareFlashing.js` (`port.startsWith("usb")`) will work without changes.

### Phase 4: Android Manifest Updates

No additional permissions needed - the app already has `android.hardware.usb.host` and all DFU device VID/PIDs are in `device_filter.xml`.

The DFU plugin will reuse the existing `UsbPermissionReceiver` pattern for permission handling, or register its own permission action (`com.betaflight.DFU_USB_PERMISSION`) to avoid conflicts with the serial plugin.

---

## Implementation Order

### Step 1: Native Plugin Shell
- [ ] Create `android/app/src/main/java/betaflight/app/protocols/dfu/BetaflightDfuPlugin.java`
- [ ] Implement `getDevices()`, `requestPermission()`, device attach/detach events
- [ ] Implement `openDevice()`, `closeDevice()`, `resetDevice()`
- [ ] Implement `controlTransferIn()`, `controlTransferOut()`
- [ ] Implement `getStringDescriptor()`, `getInterfaceDescriptors()`, `getFunctionalDescriptor()`
- [ ] Register in `MainActivity.java`
- [ ] Test: verify DFU device appears when plugged in via USB OTG

### Step 2: JavaScript Adapter
- [ ] Create `src/js/protocols/CapacitorDfu.js`
- [ ] Implement device discovery and events matching `WEBUSBDFU_protocol` interface
- [ ] Implement `controlTransfer()` routing through native plugin
- [ ] Implement USB descriptor reading through native plugin
- [ ] Implement `connect()`, `openDevice()`, `claimInterface()` lifecycle

### Step 3: Protocol Integration (Option A - recommended)
- [ ] Extract transport interface from `webusbdfu.js`
- [ ] Create `WebUsbTransport.js` wrapping `navigator.usb`
- [ ] Create `CapacitorUsbTransport.js` wrapping `BetaflightDfu` plugin
- [ ] Refactor `webusbdfu.js` to use transport interface
- [ ] Verify desktop WebUSB still works after refactor

### Step 4: System Integration
- [ ] Update `checkCompatibility.js` to enable USB support on Android
- [ ] Update `port_handler.js` to use platform-appropriate DFU protocol
- [ ] Update `useFirmwareFlashing.js` to route to correct DFU implementation
- [ ] Test end-to-end: firmware flash on Android via USB OTG

### Step 5: Testing & Edge Cases
- [ ] Test with STM32 DFU device (most common)
- [ ] Test device attach/detach during flash
- [ ] Test permission denied flow
- [ ] Test erase chip option
- [ ] Test exit DFU mode
- [ ] Test reboot-to-DFU flow (serial -> MSP reboot -> DFU device appears -> flash)
- [ ] Test with GD32, AT32 if available
- [ ] Test Android 14+ permission handling

---

## Key Technical Considerations

### 1. USB Control Transfer Timeout
Android's `UsbDeviceConnection.controlTransfer()` requires a timeout parameter. The WebUSB API does not expose timeouts directly. Use a default of 5000ms, with longer timeouts (30s+) for erase operations that the JS layer will manage via delays.

### 2. Thread Safety
USB operations should run off the main thread. The Capacitor plugin `@PluginMethod` annotation already handles this (methods run on a background executor), but device events must be dispatched on the main thread via `getActivity().runOnUiThread()` or Capacitor's `notifyListeners()`.

### 3. Data Encoding
Use **hex strings** for binary data transfer between JS and native (consistent with `BetaflightSerialPlugin`). This avoids JSON encoding issues with raw bytes.

### 4. Device Identification
DFU devices don't go through `usb-serial-for-android` (they have no serial interface). Detection must use raw `UsbManager.getDeviceList()` with VID/PID filtering against the DFU device table.

### 5. Conflict with Serial Plugin
When a flight controller reboots from application mode to DFU mode:
1. The serial VCP device disappears (serial plugin sees detach)
2. The DFU device appears (DFU plugin sees attach)
3. These are **different USB configurations** of the same physical device

The existing `device_filter.xml` already handles both VCP and DFU VID/PIDs. The two plugins operate independently since they filter for different product IDs.

### 6. Reboot-to-DFU Flow on Android
The existing serial -> DFU reboot flow works as follows:
1. App is connected via `CapacitorSerial` (serial VCP)
2. User triggers flash, MSP sends reboot-to-bootloader command
3. FC reboots, VCP device detaches, DFU device attaches
4. `port_handler.js` detects new DFU device
5. `useFirmwareFlashing.js` triggers DFU flash

For Android, step 4 requires the DFU plugin to emit `deviceAttached` events. The JS layer logic for handling the reboot flow is already in place in `useFirmwareFlashing.js`.

### 7. Descriptor String Encoding
USB string descriptors use UTF-16LE encoding. The native plugin must decode these correctly. Android's `UsbDeviceConnection.getRawDescriptors()` provides the raw bytes, but for string descriptors the control transfer approach is more reliable.

---

## File Changes Summary

### New Files
| File | Purpose |
|------|---------|
| `android/.../protocols/dfu/BetaflightDfuPlugin.java` | Native Capacitor plugin for USB DFU |
| `src/js/protocols/CapacitorDfu.js` | JS adapter for native DFU plugin |
| `src/js/protocols/CapacitorUsbTransport.js` | Transport backend for Capacitor (Option A) |
| `src/js/protocols/WebUsbTransport.js` | Transport backend for WebUSB (Option A) |

### Modified Files
| File | Change |
|------|--------|
| `android/.../MainActivity.java` | Register `BetaflightDfuPlugin` |
| `src/js/utils/checkCompatibility.js` | Enable `checkUsbSupport()` for Android |
| `src/js/port_handler.js` | Use platform-appropriate DFU protocol |
| `src/js/protocols/webusbdfu.js` | Refactor to accept transport backend (Option A) |
| `src/composables/useFirmwareFlashing.js` | Route to correct DFU implementation |

### No Changes Needed
| File | Reason |
|------|--------|
| `android/app/build.gradle` | No new dependencies (uses Android SDK USB APIs) |
| `AndroidManifest.xml` | Already has USB host permission and device filters |
| `res/xml/device_filter.xml` | Already has all DFU VID/PIDs |
| `src/js/protocols/devices.js` | DFU device filters already defined |
