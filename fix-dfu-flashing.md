# Fix DFU Flashing: Analysis & Implementation

## Issue Summary

After the Vue/Pinia migration (#4812), flashing fails when the device is **not already in DFU mode** (i.e. connected via serial and needing a reboot to DFU bootloader). The process hangs indefinitely without progress. Direct DFU flashing (device already in DFU mode) works fine.

**Error observed:** `Failed to claim USB device: NetworkError: Failed to execute 'claimInterface' on 'USBDevice': Unable to claim interface.`

**Related issues:** #4812, #4800

---

## Root Cause Analysis

There are **6 bugs** contributing to this failure. They interact to create the hang and the claimInterface error.

### Bug 1: `waitForDfu()` is defined but never called (PRIMARY)

**File:** `src/js/protocols/webusbdfu.js:146-171`

The `waitForDfu()` method was added to poll for an already-authorized DFU device to appear after reboot. It exists and works correctly, but **nothing ever calls it**.

In `webstm32.js:104-134`, `handleDisconnect()` skips `waitForDfu()` entirely and jumps straight to `DFU.requestPermission()`:

```javascript
// webstm32.js:112-130 — ORIGINAL (broken)
setTimeout(() => {
    if (this.rebootMode) {
        DFU.requestPermission()  // ← Goes straight to permission dialog
            .then(...)
            .catch(...);
    }
}, 3000);
```

**Why this matters:** `requestPermission()` calls `navigator.usb.requestDevice()` which **requires a user gesture** (a click event). When called from a `setTimeout` callback, the browser silently blocks it or shows a picker that does nothing useful. This causes the process to hang forever — the user sees "Rebooting to bootloader" but nothing happens next.

The intended flow should be:
1. Try `waitForDfu()` first (polls `navigator.usb.getDevices()` — works without user gesture)
2. If the device has cached authorization, it's found automatically
3. Only if `waitForDfu()` throws `DFUAuthRequiredError` (first-time device), fall back gracefully

### Bug 2: WebUSB authorization is separate from Web Serial

**Key insight from testing:** When a user connects via Web Serial, they authorize the **serial** device. The DFU bootloader is a completely different USB device/configuration with different product IDs. It has **never been authorized via `navigator.usb.requestDevice()`**.

`navigator.usb.getDevices()` only returns previously-authorized devices. The `navigator.usb` "connect" event also only fires for previously-authorized devices. So for a first-time serial→DFU reboot:
- `waitForDfu()` will poll for 10 seconds and find nothing
- The port handler's WEBUSBDFU listener will never fire
- The only way to access the DFU device is `navigator.usb.requestDevice()` with a user gesture

**The original code called `handleError()` when auth was required, which reset `rebootMode` to 0.** This meant the entire flash state was lost — even if the user then granted USB permission, the `detectedUsbDevice` handler would see `rebootMode=0` and skip flashing.

### Bug 3: Race condition — two paths compete to claim the device

When a device reboots to DFU (and was previously authorized), two independent paths race to handle it:

**Path A — Port Handler auto-detection (event-driven):**
```text
navigator.usb "connect" event
  → WEBUSBDFU.handleNewDevice()
  → PortHandler.addedUsbDevice()
  → EventBus "port-handler:auto-select-usb-device"
  → detectedUsbDevice() handler
  → startFlashing() → DFU.connect() → claimInterface()
```

**Path B — STM32 handleDisconnect timeout (3 seconds):**
```text
setTimeout(3000)
  → DFU.requestPermission()
  → handleNewDevice() (again!)
  → DFU.connect() → claimInterface()
```

Both paths can fire, leading to **two concurrent `DFU.connect()` calls** on the same USB device. The second call fails with `claimInterface` error because the first already claimed interface 0.

### Bug 4: `requestPermission()` in `handleDisconnect()` doesn't trigger flashing

Even when `requestPermission()` succeeds (user manually selects device in the picker), the code only logs "DFU permission granted" — it **never calls `DFU.connect()`** to actually flash:

```javascript
// webstm32.js:116-124 — only logs, doesn't flash
DFU.requestPermission()
    .then((device) => {
        if (device == null) {
            this.handleError();
            return;
        }
        console.log(`DFU request permission granted`, device);
        // ← Nothing happens after this! No DFU.connect() call.
    })
```

The expectation was that `handleNewDevice()` (called inside `requestPermission`) would emit the `addedDevice` event, which would trigger Path A's `detectedUsbDevice` handler. But by this time, `detectedUsbDevice` may have already fired and cleared `STM32.rebootMode`, so the handler ignores the second event.

### Bug 5: Event listener cleanup bug in `onBeforeUnmount`

**File:** `src/components/tabs/FirmwareFlasherTab.vue:1562-1577`

```javascript
onBeforeUnmount(() => {
    const eventListeners = setupEventBusListeners(); // ← Creates NEW listeners!
    if (eventListeners) {
        EventBus.$off("port-handler:auto-select-usb-device", eventListeners.detectedUsbDevice);
        EventBus.$off("port-handler:device-removed", eventListeners.onDeviceRemoved);
    }
});
```

`setupEventBusListeners()` is called again, which:
1. Creates **new** function instances (different references from the ones registered in `onMounted`)
2. **Registers them** on the EventBus (calling `$on` again inside)
3. Tries to `$off` the new references — which were just registered, not the originals

Result: The original listeners from `onMounted` are **never removed**, and **extra listeners are added** during unmount. If the user navigates away from the firmware flasher tab and back, listeners accumulate, causing duplicate event handling and potential double-flashing.

### Bug 6: `removeEventListener` with anonymous functions in STM32

**File:** `src/js/protocols/webstm32.js:107-108`

```javascript
handleDisconnect(disconnectionResult) {
    serial.removeEventListener("connect", (event) => this.handleConnect(event.detail));    // ← New function!
    serial.removeEventListener("disconnect", (event) => this.handleDisconnect(event.detail)); // ← New function!
```

These `removeEventListener` calls create new anonymous arrow functions that are different references from those added in `prepareSerialPort()`. They **never actually remove anything**. Same issue exists in `prepareSerialPort()` lines 137-141 where `removeEventListener` is called with new anonymous functions before `addEventListener`.

---

## Fixes Implemented

All fixes have been committed individually to the `fix-waitfordfu` branch.

### Commit 1: Fix anonymous event listener references (`725f70eb`)

**File:** `src/js/protocols/webstm32.js`
**Bug:** #6

Store bound handler references in the constructor and reuse them for both `addEventListener` and `removeEventListener`:

```javascript
constructor() {
    // ...
    this._boundHandleConnect = (event) => this.handleConnect(event.detail);
    this._boundHandleDisconnect = (event) => this.handleDisconnect(event.detail);
}

prepareSerialPort() {
    serial.removeEventListener("connect", this._boundHandleConnect);
    serial.addEventListener("connect", this._boundHandleConnect, { once: true });
    serial.removeEventListener("disconnect", this._boundHandleDisconnect);
    serial.addEventListener("disconnect", this._boundHandleDisconnect, { once: true });
}
```

All call sites (`handleDisconnect`, `prepareSerialPort`, `connect`) updated to use bound references.

### Commit 2: Fix EventBus listener cleanup on unmount (`38e49229`)

**File:** `src/components/tabs/FirmwareFlasherTab.vue`
**Bug:** #5

Store listener references in a closure variable, with a shared `teardownEventBusListeners()` helper for `$off` in both `onBeforeUnmount` and `cleanup()`:

```javascript
let eventListenerRefs = null;

const setupEventBusListeners = () => {
    // ... create listeners, $on ...
    eventListenerRefs = { detectedUsbDevice, onDeviceRemoved };
};

const teardownEventBusListeners = () => {
    if (!eventListenerRefs) { return; }
    EventBus.$off("port-handler:auto-select-usb-device", eventListenerRefs.detectedUsbDevice);
    EventBus.$off("port-handler:device-removed", eventListenerRefs.onDeviceRemoved);
    eventListenerRefs = null;
};

onBeforeUnmount(() => { teardownEventBusListeners(); /* ... */ });
const cleanup = (callback) => { teardownEventBusListeners(); /* ... */ };
```

**Note:** The `cleanup()` function (called during tab switching via `gui.js`) originally used bare `EventBus.$off(event)` which removed ALL handlers — not just ours. Fixed in commit 10, then consolidated into the shared helper in commit 13.

### Commit 3: Add DFU connection guard (`3ec14745`)

**File:** `src/js/protocols/webusbdfu.js`
**Bug:** #3

Prevent concurrent `connect()` calls with a `_connecting` flag:

```javascript
constructor() {
    // ...
    this._connecting = false;
}

async connect(devicePath, hex, options, callback) {
    if (this._connecting) {
        console.warn(`${this.logHead} Connect already in progress, ignoring duplicate call`);
        return;
    }
    this._connecting = true;
    // ...
}

cleanup() {
    this._connecting = false;
    // ...
}
```

### Commit 4: Integrate `waitForDfu()` into reboot flow (`cb9b0c6d`)

**File:** `src/js/protocols/webstm32.js`
**Bug:** #1

Replace the broken `setTimeout → requestPermission()` with `await DFU.waitForDfu()`:

```javascript
import DFU, { DFU_AUTH_REQUIRED } from "../protocols/webusbdfu";

async handleDisconnect(disconnectionResult) {
    // ... cleanup listeners ...
    if (disconnectionResult && this.rebootMode) {
        try {
            const device = await DFU.waitForDfu(4000, 500);
            console.log(`${this.logHead} DFU device found via waitForDfu:`, device);
        } catch (e) {
            // ... error handling (see commit 6) ...
        }
    } else {
        this.handleError(false);
    }
}
```

### Commit 5: Add diagnostic logging (`0e657670`)

**File:** `src/composables/useFirmwareFlashing.js`

Log `rebootMode`, `connect_lock`, and `flashOnConnect` state on USB device detection for easier debugging.

### Commit 6: Keep rebootMode on DFU auth required (`9d9e1974`)

**File:** `src/js/protocols/webstm32.js`
**Bug:** #2

When `waitForDfu()` throws `DFU_AUTH_REQUIRED`, keep `rebootMode` set and release `connect_lock` so the permission request can trigger flashing.

### Commit 7: Show USB permission dialog (`59d171ed`)

Initial dialog implementation (superseded by commit 8).

### Commit 8: Try requestPermission directly, dialog as fallback (`7f2bfb7c`)

**Files:** `src/js/protocols/webstm32.js`, `src/components/tabs/FirmwareFlasherTab.vue`, `locales/en/messages.json`
**Bug:** #2

After `waitForDfu()` times out, the permission flow is now two-stage:

**Stage 1 — Try `requestPermission()` directly in `handleDisconnect`:**
The browser may still honour the original Flash button click as a valid user gesture. If so, the USB device picker opens immediately with no intermediate dialog.

**Stage 2 — Dialog fallback (only if Stage 1 returns null):**
`DFU.requestPermission()` catches all errors internally (including SecurityError) and returns `null`. So we check the return value — if `null`, either the browser blocked it (no user gesture) or the user cancelled the picker. Either way, show a Yes/No dialog:
- **Yes** ("I can't find my DFU device") → calls `requestPermission()` with fresh user gesture
- **No** ("Close") → resets state, enables Exit DFU button

```javascript
// webstm32.js — try direct first, dialog as fallback
const device = await DFU.requestPermission();
if (device) {
    return; // handleNewDevice → event chain → flashing
}
// null return — browser blocked or user cancelled
if (TABS.firmware_flasher.requestDfuPermission) {
    TABS.firmware_flasher.requestDfuPermission();
} else {
    this.handleError();
}
```

**Key behavior:**
- `rebootMode` stays set so the event chain can resume flashing on permission grant
- `connect_lock` is released so the UI is interactive
- If user cancels: Exit DFU button is force-enabled so user can leave DFU mode
- `handleNewDevice` → `addedDevice` → `detectedUsbDevice` sees `rebootMode` → `startFlashing()`

### Commit 9: Handle requestPermission returning null (`4e62c6c3`)

**File:** `src/js/protocols/webstm32.js`
**Bug:** #4 (fix for commit 8)

`DFU.requestPermission()` catches all errors internally (including `SecurityError` from missing user gesture) and returns `null` — it does NOT re-throw. The `catch` block in `handleDisconnect` never ran. Changed to check the return value: if `null`, show the dialog fallback.

### Commit 10: Use reference-based `$off` in `cleanup()` (`b2d2de8a`)

**File:** `src/components/tabs/FirmwareFlasherTab.vue`
**Bug:** #5 (hardening)

`cleanup()` (called during tab switching via `gui.js`) used bare `EventBus.$off(event)` which removes ALL handlers for those events — not just ours. This could strip listeners registered by other components. Updated to use the same stored-reference pattern as `onBeforeUnmount`.

### Commit 11: Harden `_connecting` flag reset on early failures (`4df612a1`)

**File:** `src/js/protocols/webusbdfu.js`
**Bug:** #3 (hardening)

The `_connecting` guard added in commit 3 had a gap: if `getDevices()` threw or `devices.find()` returned `undefined`, the code would crash before reaching `openDevice()` (whose error handler calls `cleanup()` which resets the flag). The flag would stay `true` forever, blocking all future connections.

Fix: wrap the device lookup in try-catch and add an explicit `undefined` check:

```javascript
let deviceFound;
try {
    const devices = await this.getDevices();
    deviceFound = devices.find((device) => device.path === devicePath);
} catch (error) {
    console.error(`${this.logHead} Failed to enumerate USB devices:`, error);
    this._connecting = false;
    return;
}

if (!deviceFound) {
    console.error(`${this.logHead} Device not found: ${devicePath}`);
    this._connecting = false;
    return;
}

this.usbDevice = deviceFound.port;
return this.openDevice();
```

Both early-return paths reset `_connecting = false`. Once `openDevice()` is reached, its existing `.catch()` handler calls `cleanup()` which also resets the flag.

### Commit 12: Fix `handleConnect` parameter double-unwrap

**File:** `src/js/protocols/webstm32.js`
**Bug:** #6 (regression from commit 1)

The bound handler `_boundHandleConnect` unwraps `event.detail` before passing to `handleConnect()`, but `handleConnect(event)` still accessed `event.detail` in its log statement — logging `undefined`. Renamed the parameter to `connectionResult` and fixed the log.

### Commit 13: Extract EventBus teardown helper, reuse `handleError` (`2aee7047`)

**File:** `src/components/tabs/FirmwareFlasherTab.vue`
**Bug:** #5 (DRY refactor)

The duplicated `$off` block in `onBeforeUnmount` and `cleanup()` could drift apart again. Extracted into a single `teardownEventBusListeners()` helper called from both sites.

Also replaced the manual reset sequence in `requestDfuPermission`'s `onCancel` (`rebootMode = 0`, `resetFlashingState()`) with `STM32.handleError()` — the canonical protocol-side error handler — followed by `enableDfuExitButton(true)`. This keeps the dialog cancel path aligned with protocol error handling.

### Commit 14: Reduce waitForDfu timeout to preserve user gesture

**File:** `src/js/protocols/webstm32.js`
**Bug:** #2 (improvement)

The 10-second `waitForDfu` timeout meant the Flash button's transient user activation always expired before the `requestPermission()` fallback ran. This forced the dialog workaround for first-time devices.

Reduced to 4 seconds: authorized devices typically appear in 1-3s (reboot time), so they're still caught. For unauthorized devices, the fallback fires at ~4s with the gesture still valid (~5s Chrome limit), so `requestPermission()` opens the browser picker directly — matching pre-migration behavior. The dialog fallback is now a safety net that rarely triggers.

### Commit 15: Retry claimInterface on transient "busy" errors

**File:** `src/js/protocols/webusbdfu.js`

On Linux, ModemManager auto-probes new USB DFU devices, temporarily claiming the interface. With the old 10s `waitForDfu` timeout, ModemManager usually finished before the configurator attempted to claim. With the shorter 4s timeout, the claim can hit a still-busy interface.

Fix: `claimInterface()` now retries up to 6 times with 1-second delays when the error indicates "busy" or "Unable to claim interface". This handles transient contention from ModemManager or other USB managers without requiring udev rules (though udev rules remain recommended).

---

## Testing Plan

### Test 1: Serial → DFU reboot (previously authorized device)
1. Ensure DFU device was previously authorized in browser USB settings
2. Connect FC via serial, load firmware, click Flash
3. **Expected:** Device reboots, `waitForDfu()` finds it within ~3s, flashing proceeds automatically

### Test 2: Serial → DFU reboot (first-time / never authorized)
1. Clear USB permissions in browser (chrome://settings/content/usbDevices)
2. Connect FC via serial, load firmware, click Flash
3. **Expected:** `waitForDfu()` times out (4s), browser USB picker opens directly (or dialog appears if browser blocks it)
4. Select DFU device in picker
5. **Expected:** Flashing starts automatically (rebootMode was preserved)

### Test 2b: Cancel permission flow, then Exit DFU
1. Same as Test 2 steps 1-3
2. Cancel/dismiss the USB picker (or dialog)
3. **Expected:** State resets, Exit DFU button becomes enabled
4. Click Exit DFU → grant USB permission → device exits DFU mode

### Test 3: Direct DFU flashing (should still work)
1. Put device in DFU mode manually (boot button)
2. Select USB/DFU port, load firmware, click Flash
3. **Expected:** Flashing proceeds normally

### Test 4: Tab navigation during flash
1. Start flash from serial
2. Navigate away from firmware flasher tab before DFU appears
3. Navigate back
4. **Expected:** No duplicate event handlers, no console errors

### Test 5: Double-click protection
1. Click Flash rapidly or trigger multiple flash attempts
2. **Expected:** Only one connection attempt; second is rejected with "Connect already in progress"

### Test 6: Flash-on-connect
1. Enable "Flash on connect"
2. Load firmware
3. Plug in device in DFU mode
4. **Expected:** Flashing starts automatically

---

## File Change Summary

| File | Changes | Commits |
|------|---------|---------|
| `src/js/protocols/webstm32.js` | Bound event listeners, `waitForDfu()` integration, direct `requestPermission` + dialog fallback, null-return handling, `handleConnect` parameter fix | 1, 4, 6, 8, 9, 12 |
| `src/js/protocols/webusbdfu.js` | `_connecting` guard on `connect()`/`cleanup()`, hardened early-failure reset, `claimInterface` retry on busy | 3, 11, 15 |
| `src/components/tabs/FirmwareFlasherTab.vue` | `onBeforeUnmount` listener cleanup, `teardownEventBusListeners` helper, `requestDfuPermission` dialog, Exit DFU enable on cancel, `onCancel` uses `handleError()` | 2, 8, 10, 13 |
| `src/composables/useFirmwareFlashing.js` | Diagnostic logging in `detectedUsbDevice` | 5 |
| `locales/en/messages.json` | `stm32DfuPermissionRequired` i18n key | 7 |

---

## Architecture Notes

### Event Flow After Fix — Previously Authorized Device (Happy Path)

```text
User clicks Flash
  → STM32.connect(serialPort, ...)
  → MSP connect → get board info → reboot(mode=1|4)
  → MSP disconnect → serial "disconnect" event
  → handleDisconnect()
  → await DFU.waitForDfu(4000, 500)  — polls getDevices()
  → Device appears in DFU (~2-5 seconds)
  → waitForDfu returns device port object
  → handleNewDevice() fires addedDevice event
  → PortHandler.addedUsbDevice() → selectActivePort()
  → EventBus "port-handler:auto-select-usb-device"
  → detectedUsbDevice() checks STM32.rebootMode (truthy)
  → STM32.rebootMode cleared, connect_lock released
  → startFlashing() → flashHexFirmware()
  → DFU.connect(usbPort, firmware, options)
  → openDevice() → claimInterface(0) → upload_procedure(0)
  → Flash → Verify → Leave DFU → cleanup()
```

### Event Flow After Fix — First-Time Device (Auth Required)

```text
User clicks Flash
  → STM32.connect(serialPort, ...)
  → MSP connect → get board info → reboot(mode=1|4)
  → MSP disconnect → serial "disconnect" event
  → handleDisconnect()
  → await DFU.waitForDfu(4000, 500)  — polls getDevices()
  → 4 seconds pass, device never appears (not authorized)
  → DFUAuthRequiredError thrown
  → connect_lock released, rebootMode PRESERVED
  → DFU.requestPermission() called directly (~4s after click, gesture still valid)
  → Browser USB picker opens immediately
  ┌─ If browser blocks (rare, gesture expired):
  └─ → requestDfuPermission() dialog as safety net
  → User selects DFU device in picker
  → handleNewDevice() fires addedDevice event
  → PortHandler.addedUsbDevice() → selectActivePort()
  → EventBus "port-handler:auto-select-usb-device"
  → detectedUsbDevice() checks STM32.rebootMode (still truthy!)
  → STM32.rebootMode cleared, startFlashing() called
  → flashHexFirmware() → DFU.connect() → flash proceeds

If user cancels at any point:
  → STM32.rebootMode cleared, state reset
  → Exit DFU button enabled (device still in DFU mode)
  → User can click Exit DFU → requestPermission (has click gesture)
  → Device exits DFU mode
```

### Why the timeout matters for user gesture preservation

WebUSB's `navigator.usb.requestDevice()` requires [transient user activation](https://developer.mozilla.org/en-US/docs/Web/Security/User_activation) — a recent click event. Chrome's activation window is ~5 seconds. The original code used `setTimeout(3000)` which kept the Flash button's gesture alive. The initial fix used a 10-second `waitForDfu` timeout, which always expired the gesture. Reducing to 4 seconds keeps the gesture valid for the `requestPermission()` fallback, matching pre-migration behavior.

`waitForDfu()` uses `navigator.usb.getDevices()` which does NOT require a user gesture — only the `requestPermission()` fallback needs it.

### Why Web Serial authorization doesn't carry over to WebUSB

Web Serial (`navigator.serial`) and WebUSB (`navigator.usb`) are separate browser APIs with independent permission stores. Authorizing a device's serial port via `navigator.serial.requestPort()` does NOT grant access to the same device via `navigator.usb.getDevices()`. When the device reboots from serial mode (vendorId:11836, productId:22336 for AT32) to DFU mode (vendorId:11836, productId:57105), it becomes a different USB configuration that requires separate WebUSB authorization.
