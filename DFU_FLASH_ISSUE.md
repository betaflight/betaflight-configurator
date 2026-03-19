# DFU Flash Issue — Online Browser Regression

## Summary

After migrating the Firmware Flasher tab to Vue / Pinia ([89a3efc9](https://github.com/betaflight/betaflight-configurator/commit/89a3efc9a13ae8a7e45faa46f5f07a0283e5f74d)), flashing via serial port no longer completes on the **online browser**. The device reboots into DFU mode but the configurator stalls — never proceeding to flash. [PR #4884](https://github.com/betaflight/betaflight-configurator/pull/4884) (commit 12d261e5) was an attempt to fix this but introduced unnecessary UI complexity. Local development builds are unaffected.

## Why It Worked Before the Vue Migration

The pre-migration jQuery code had two cooperating pieces:

### 1. `handleDisconnect` in webstm32.js — the fallback

```js
// webstm32.js — original pre-Vue code (unchanged until PR #4884)
setTimeout(() => {
    if (this.rebootMode) {
        DFU.requestPermission()  // navigator.usb.requestDevice()
            .then(device => { ... })
            .catch(e => { this.handleError(); });
    }
}, 3000);
```

After serial disconnect, this waits 3 seconds then calls `DFU.requestPermission()` — but **only if `rebootMode` is still set**. If the event chain (below) already handled the device and cleared `rebootMode`, this is a no-op.

### 2. `detectedUsbDevice` in firmware_flasher.js — the event chain

```js
// Old jQuery code
detectedUsbDevice: function (device) {
    if (STM32.rebootMode || isFlashOnConnect) {
        const wasReboot = !!STM32.rebootMode;
        STM32.rebootMode = 0;
        if (wasReboot) {
            GUI.connect_lock = false;
        }
        firmware_flasher.startFlashing?.(); // called directly — no extra checks
    }
}
```

When a DFU device is detected via `navigator.usb.connect` (pre-authorized devices), this fires immediately: clears `rebootMode`, releases the lock, and calls `startFlashing()` directly.

### How they work together

- **Pre-authorized device**: `navigator.usb.connect` fires → `detectedUsbDevice` → `startFlashing()` → `rebootMode` cleared. The 3-second timeout fires but `rebootMode` is 0, so `requestPermission()` is never called.
- **Unauthorized device**: `navigator.usb.connect` does not fire. After 3 seconds, `rebootMode` is still set → `requestPermission()` → browser shows USB picker → user selects device → `handleNewDevice()` fires the event chain → `detectedUsbDevice` → `startFlashing()`.

## What the Vue Migration (#4815) Broke

The `detectedUsbDevice` handler was moved into the `useFirmwareFlashing` composable. Three regressions:

1. **Calls `initiateFlashing()` instead of `startFlashing()`** — wraps the call with an unstable-firmware dialog check that can block or re-prompt the user on the DFU reconnect path. The old code never did this.

2. **`startFlashing()` only called when `wasReboot` is true** — the old code called `startFlashing()` for both reboot and flash-on-connect cases. The new code only calls it inside the `if (wasReboot)` block, breaking flash-on-connect DFU detection.

3. **`flashOnConnect` captured as a static value at setup time** — the old jQuery code read the checkbox state dynamically. The new code captures `state.flashOnConnect` once during `setupFlashingEventListeners`, so toggling the checkbox after setup has no effect.

These regressions meant the event chain no longer completed. `rebootMode` was never cleared, `startFlashing()` was never called, and the flash stalled.

## Why PR #4884 Was Unnecessary

PR #4884 assumed the problem was in `handleDisconnect` (webstm32.js) and replaced the original `setTimeout` + `requestPermission()` approach with `waitForDfu(5000)` polling + a custom UI button. This was based on the premise that `requestDevice()` requires a user gesture and cannot work from a timer.

**That premise was wrong.** The original `handleDisconnect` code was never the problem — it was working correctly as a fallback. The actual bug was in the composable's `detectedUsbDevice` handler where the event chain was broken by the three regressions above.

The `setTimeout(3000)` + `requestPermission()` approach works because:

- `DFU.requestPermission()` calls `navigator.usb.requestDevice()` which shows the browser's native USB device picker
- This is the standard WebUSB flow and works in both the desktop app (NW.js) and the online browser
- No custom UI button is needed — the browser handles the permission dialog natively

PR #4884's changes introduced unnecessary complexity:
- A `waitForDfu(5000)` polling mechanism with `DFUAuthRequiredError`
- A custom "Click to connect DFU" button with `dfuAuthRequired` state
- A `<template v-if="!state.dfuAuthRequired">` wrapper that hid the entire page when the button was shown
- `showDfuPermission` / `hideDfuPermission` methods on the TABS object

## Applied Fixes

### 1. Revert `handleDisconnect` to the original pre-#4884 approach

**File:** `src/js/protocols/webstm32.js`

Restored the original `setTimeout(3000)` + `DFU.requestPermission()` fallback. Removed the `waitForDfu` polling, `DFUAuthRequiredError` handling, and all references to `showDfuPermission`. No custom UI needed — the browser shows its native USB picker when `requestPermission()` is called.

### 2. Remove DFU button UI

**File:** `src/components/tabs/FirmwareFlasherTab.vue`

Removed all DFU button infrastructure added by PR #4884: `dfuAuthRequired` state, `requestDfuPermission` method, `showDfuPermission` / `hideDfuPermission` on TABS, the button template, the `<template v-if="!state.dfuAuthRequired">` wrapper, and all related CSS. The flashing spinner is back to its original simple form.

### 3. `detectedUsbDevice` calls `startFlashing()` directly (not `initiateFlashing()`)

**File:** `src/composables/useFirmwareFlashing.js`

After a DFU reboot, calls `startFlashing()` directly — the unstable firmware dialog was already shown on the initial flash trigger. `initiateFlashing()` is still used for flash-on-connect (which does need the dialog check). Also fixes flash-on-connect which was broken by being inside the `if (wasReboot)` block.

### 4. `flashOnConnect` read dynamically via getter

**File:** `src/composables/useFirmwareFlashing.js`

Changed from capturing `state.flashOnConnect` as a static value at setup time to accepting a `getFlashOnConnect` getter function, so toggling the checkbox after setup takes effect.

## Event Chain Reference

```text
Serial reboot to DFU mode
    │
    ├── Pre-authorized device:
    │   navigator.usb.connect fires → handleNewDevice() → PortHandler.addedUsbDevice()
    │   → selectActivePort(device) → EventBus "auto-select-usb-device"
    │   → detectedUsbDevice() → rebootMode cleared → startFlashing() [Fix 3]
    │   → flashHexFirmware() → DFU.connect()
    │   (3s timeout fires, rebootMode is 0, requestPermission() skipped)
    │
    └── Unauthorized device:
        navigator.usb.connect does NOT fire → 3s timeout → rebootMode still set
        → DFU.requestPermission() → browser shows native USB picker [Fix 1]
        → user selects device → handleNewDevice() fires event chain
        → detectedUsbDevice() → rebootMode cleared → startFlashing() [Fix 3]
        → flashHexFirmware() → DFU.connect()
```
