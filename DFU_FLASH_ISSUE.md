# DFU Flash Issue — Online Browser Regression

## Summary

After migrating the Firmware Flasher tab to Vue / Pinia ([89a3efc9](https://github.com/betaflight/betaflight-configurator/commit/89a3efc9a13ae8a7e45faa46f5f07a0283e5f74d)), flashing via serial port no longer completes on the **online browser**. The device reboots into DFU mode but the configurator waits forever — never requesting USB permissions. [PR #4884](https://github.com/betaflight/betaflight-configurator/pull/4884) (commit 12d261e5) was an attempt to fix this but the issue persists. Local development builds are unaffected.

## Why It Worked Before the Vue Migration

The pre-migration jQuery code in `firmware_flasher.js` had a simple `detectedUsbDevice` handler:

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

This called `startFlashing()` **directly**, bypassing any intermediate logic. It was wired up on the global `firmware_flasher` object which was available immediately.

## What Changed in the Vue Migration (89a3efc9)

The `detectedUsbDevice` handler was moved into the `useFirmwareFlashing` composable. Two key differences:

1. **Calls `initiateFlashing()` instead of `startFlashing()`** — adds an unstable-firmware dialog check that can block the flow:

    ```js
    // New Vue code — useFirmwareFlashing.js:500-511
    if (wasReboot) {
        GUI.connect_lock = false;
        if (initiateFlashing) {
            initiateFlashing(); // wraps startFlashing with dialog check
        }
    }
    ```

    `initiateFlashing()` (FirmwareFlasherTab.vue:1737) checks `isUnstableFirmware` and may show an acknowledgement dialog before calling `startFlashing()`. The old code never did this on the DFU reconnect path.

2. **`startFlashing()` only called when `wasReboot` is true** — the old code called `startFlashing()` for both reboot and flash-on-connect cases. The new code only calls it inside the `if (wasReboot)` block, breaking flash-on-connect DFU detection.

3. **`flashOnConnect` captured as a static value at setup time** — the old jQuery code read the checkbox state dynamically (`$("input.flash_on_connect").is(":checked")`). The new code captures `state.flashOnConnect` once during `setupFlashingEventListeners`, so toggling the checkbox after setup has no effect.

## What PR #4884 Changed

`webstm32.js` `handleDisconnect` was updated from:

```js
// Before #4884 — called from setTimeout (no user gesture)
setTimeout(() => {
    if (this.rebootMode) {
        DFU.requestPermission()  // navigator.usb.requestDevice() — REQUIRES user gesture in browsers
            .then(device => { ... })
            .catch(e => { this.handleError(); });
    }
}, 3000);
```

To:

```js
// After #4884 — polls for pre-authorized device, falls back to UI button
DFU.waitForDfu(5000)
    .then(device => {
        // Device found among already-authorized USB devices — just logs
        console.log("DFU device found and authorized", device);
    })
    .catch(e => {
        if (e instanceof DFUAuthRequiredError) {
            TABS.firmware_flasher.showDfuPermission(); // sets state.dfuAuthRequired = true
        }
    });
```

A "Click to connect DFU" button was added to the Vue template, shown when `state.dfuAuthRequired` is true. Clicking it calls `DFU.requestPermission()` from a valid user gesture context.

## Why It Works Locally but Not on the Online Browser

The core difference is **WebUSB permission persistence**.

### Local development (works)

When developing locally, DFU devices are typically authorized during testing. The browser remembers this authorization. On subsequent flashes:

- `navigator.usb.connect` event fires when the DFU device appears (it is already authorized)
- `handleNewDevice()` → `PortHandler.addedUsbDevice()` → `detectedUsbDevice()` → `initiateFlashing()`
- No permission dialog needed — the event chain handles everything

### Online browser (broken)

On a fresh online session or when the DFU device has **never been authorized via WebUSB** in this browser profile:

- `navigator.usb.connect` does **not** fire for unauthorized devices
- `waitForDfu(5000)` polls `navigator.usb.getDevices()` which only returns previously authorized devices — finds nothing
- After 5 seconds, `DFUAuthRequiredError` is thrown
- `showDfuPermission()` sets `state.dfuAuthRequired = true`
- A "Click to connect DFU" button appears **below the loading spinner**

**The button is easy to miss.** The spinner (`data-loading flashing-wait`) takes up 50% of the tab height with a spinning animation and "Please wait" text. The DFU permission button appears below it with minimal styling. Users expect the browser's USB permission dialog to appear automatically (as it did in the desktop app) and may not realize they need to click a button.

### The fundamental problem

The pre-Vue code called `navigator.usb.requestDevice()` from a `setTimeout` in `handleDisconnect`. This worked in the desktop app (NW.js/Electron doesn't enforce the user-gesture requirement) but **never worked in a real browser** — `requestDevice()` requires a user gesture (click/tap). The online browser simply never had a working serial-to-DFU flow for first-time DFU authorization.

PR #4884 correctly identified this and added the button approach, but:

1. **The button is not prominent enough** — it appears below a large loading spinner and is easy to overlook
2. **`waitForDfu` success path does nothing explicit** — when a pre-authorized device IS found, the `.then()` handler only logs. It relies entirely on the `navigator.usb.connect` → `handleNewDevice` → event chain to trigger `detectedUsbDevice`. If that event chain breaks (timing, browser quirks), the flash silently stalls.
3. **`requestDfuPermission` doesn't connect after granting permission** — after the user clicks the button and selects a device, the handler only sets `state.dfuAuthRequired = false`. It relies on `handleNewDevice` firing the event chain to trigger `detectedUsbDevice` → `initiateFlashing`. There is no explicit `DFU.connect()` fallback.

## Applied Fixes

### 1. DFU permission button replaces spinner text (not hidden below it)

**File:** `src/components/tabs/FirmwareFlasherTab.vue` (template)

When `state.dfuAuthRequired` is true during flashing, the button and message now appear **inside** the spinner area, replacing the "Please wait" text. The button uses larger styling to make it unmissable. A fallback outside the spinner handles the edge case where `dfuAuthRequired` is true but `flashingInProgress` is false.

### 2. `waitForDfu` success path explicitly connects to DFU

**File:** `src/js/protocols/webstm32.js` (`handleDisconnect`)

When `waitForDfu` finds a pre-authorized DFU device, it now calls `DFU.connect(device.path, this.hex, this.serialOptions)` directly instead of just logging. Clears `rebootMode` first so the event chain (`detectedUsbDevice`) doesn't trigger a duplicate flash.

### 3. `detectedUsbDevice` calls `startFlashing()` directly (not `initiateFlashing()`)

**File:** `src/composables/useFirmwareFlashing.js` (`setupFlashingEventListeners`)

After a DFU reboot, calls `startFlashing()` directly — the unstable firmware dialog was already shown on the initial flash trigger. `initiateFlashing()` is still used for flash-on-connect (which does need the dialog check). Also fixes flash-on-connect which was broken by being inside the `if (wasReboot)` block.

### 4. `flashOnConnect` read dynamically via getter

**File:** `src/composables/useFirmwareFlashing.js` (`setupFlashingEventListeners`)

Changed from capturing `state.flashOnConnect` as a static value at setup time to accepting a `getFlashOnConnect` getter function, so toggling the checkbox after setup takes effect.

### 5. `requestDfuPermission` relies on event chain (no direct `startFlashing`)

**File:** `src/components/tabs/FirmwareFlasherTab.vue` (`requestDfuPermission`)

After the user grants permission, `requestPermission()` internally calls `handleNewDevice()` which fires the event chain: `addedDevice` → `PortHandler.addedUsbDevice` → `selectActivePort` → `detectedUsbDevice` → `startFlashing()`. We must NOT call `startFlashing()` directly here because `PortHandler.portPicker.selectedPort` hasn't been updated yet — it would fall into the "no valid port" branch of `flashHexFirmware` and call `DFU.requestPermission()` a second time.

## Event Chain Reference

```text
Serial reboot to DFU mode
    │
    ├── Pre-authorized device path:
    │   handleDisconnect → waitForDfu(5000) finds device
    │   → DFU.connect() directly [Fix 2]
    │   → rebootMode cleared, event chain skips duplicate
    │
    └── Unauthorized device path (online browser):
        handleDisconnect → waitForDfu(5000) fails → DFUAuthRequiredError
        → showDfuPermission() → button appears inside spinner [Fix 1]
        → user clicks → requestDfuPermission() → DFU.requestPermission()
        → browser shows USB picker → user selects device
        → handleNewDevice() fires addedDevice event
        → PortHandler.addedUsbDevice() → updateDeviceList("usb")
        → selectActivePort(device) → port updated to USB
        → EventBus emit "auto-select-usb-device"
        → detectedUsbDevice() → startFlashing() [Fix 3]
        → flashHexFirmware() → DFU.connect()
```
