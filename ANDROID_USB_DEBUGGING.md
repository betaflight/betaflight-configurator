# Android USB Debugging Guide

## Current Situation

**Status**: APK builds and installs, but app doesn't prompt for USB permission when device is attached

**Critical Finding**: The app not prompting for USB permission means the **intent filter is likely not being added** to the manifest. This could be due to:
1. The `sed -i` command failing on different platforms (macOS vs Linux)
2. The intent filter not being inserted in the right place
3. The patch script running but failing silently

**What We Know**:
- ✅ Build succeeds without errors  
- ✅ Plugin v2.16.0 has Android Kotlin code
- ✅ Manifest patch script is called in CI
- ❌ App doesn't prompt for USB device handling when device attached
- ❌ No ports show in the UI

## Investigation Steps

### 1. Build and Install New APK

The latest changes include a custom MainActivity that will:
- ✅ Request USB permission when device is attached
- ✅ Show permission dialog to the user
- ✅ Log all USB events to Android logcat

Build and install:
```bash
# The CI will build automatically, or run locally:
cd src-tauri
cargo tauri android build

# Install on your tablet
adb install -r gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk
```

### 2. Monitor Logs While Testing

**CRITICAL**: Keep logcat running to see what's happening:

```bash
# Clear old logs and start monitoring
adb logcat -c
adb logcat BetaflightUSB:* TauriActivity:* *:E

# What you should see:
# - "Checking connected USB devices: X found"
# - "Device: /dev/bus/usb/XXX/YYY, VID: 1155, PID: 22336"
# - "Requesting USB permission for..."
# - "Permission granted for device..." OR "Permission denied..."
```

### 3. Test Scenarios

**Test A: Device Already Connected**
1. Connect flight controller to tablet
2. Launch Betaflight Configurator
3. Watch logcat for "Checking connected USB devices"
4. You should see a permission dialog pop up
5. Grant permission
6. Check if ports appear in the app

**Test B: Hot Plug**
1. Launch Betaflight Configurator first
2. Then plug in flight controller
3. Watch logcat for "USB device attached"
4. You should see permission dialog
5. Grant permission
6. Check if ports appear

**Test C: App Selector**
1. Close Betaflight Configurator
2. Plug in flight controller
3. Android should show "Open with Betaflight Configurator?"
4. Select the app
5. Watch logcat for permission request
6. Grant permission
7. Check if ports appear

### 4. Check Your USB Device VID/PID

On your Linux machine with the flight controller connected:
```bash
lsusb
```

Look for output like:
```
Bus 001 Device 005: ID 0483:5740 STMicroelectronics Virtual COM Port
                      ^^^^ ^^^^
                      VID  PID
```

Verify this VID/PID combination is in `device_filter.xml`:
```xml
<usb-device vendor-id="0x0483" product-id="0x5740"/>
```

If your device isn't listed, we need to add it to the patch script.

### 5. Debug Logging

The custom MainActivity logs everything. Here's what to look for:

**Good signs** ✅:
```
BetaflightUSB: Checking connected USB devices: 1 found
BetaflightUSB: Device: /dev/bus/usb/001/005, VID: 1155, PID: 22336
BetaflightUSB: Requesting USB permission for /dev/bus/usb/001/005
BetaflightUSB: Permission granted for device /dev/bus/usb/001/005
```

**Bad signs** ❌:
```
BetaflightUSB: Checking connected USB devices: 0 found
# ^ Device not detected by Android at all

BetaflightUSB: Permission denied for device /dev/bus/usb/001/005
# ^ User denied permission or dialog didn't work

# No logs at all
# ^ MainActivity not installed or crashed
```

### 6. Verify MainActivity Installation

Run the test workflow to confirm MainActivity.kt was installed:
```bash
# Go to GitHub Actions → "Test Android Patch" → Run workflow
```

Look for:
```
=== MainActivity.kt ===
package com.betaflight.configurator
...
```

If it shows "MainActivity.kt not found!" then the patch script didn't run correctly.

### 7. Common Issues and Fixes

#### Issue: "Permission denied" in logs
**Problem**: User denied permission or dialog crashed  
**Fix**: Uninstall app, reinstall, try again. Or go to Android Settings → Apps → Betaflight → Permissions and manually grant USB access

#### Issue: "0 devices found" even when plugged in
**Problem**: Device VID/PID not in filter, or USB cable is charge-only  
**Fix**: 
- Check `lsusb` output on Linux to get VID/PID
- Try a different USB cable (must support data)
- Add your VID/PID to device_filter.xml in the patch script

#### Issue: No logs from BetaflightUSB
**Problem**: MainActivity didn't get installed or app crashed on launch  
**Fix**: 
- Check `adb logcat *:E` for crash logs
- Verify patch script ran successfully in CI
- Run test workflow to confirm files were patched

#### Issue: Permission granted but no ports show
**Problem**: Plugin not reading from USB manager after permission granted  
**Fix**: This is a plugin integration issue. The plugin needs to:
1. Wait for permission to be granted
2. Then enumerate USB devices via UsbManager
3. Open the device via usb-serial-for-android

This may require patching the plugin itself or adding more bridge code between MainActivity and the plugin.

### 8. Next Steps After Testing

Once you have the new APK installed and can see the logs:

**If you see the permission dialog** ✅:
- MainActivity is working!
- Grant permission and check if ports appear
- Share the logcat output

**If you DON'T see the permission dialog** ❌:
- Check logcat for crashes
- Verify MainActivity.kt was installed (run test workflow)
- Check if plugin is preventing MainActivity from working

**If permission granted but no ports** ⚠️:
- The plugin may not be checking UsbManager after permission is granted
- May need to add a bridge between MainActivity and the plugin
- Or the plugin needs to be notified when permission changes

## Key Files

- `scripts/MainActivity.kt` - Custom activity with USB permission handling
- `scripts/patch-android-manifest.sh` - Patches manifest and installs MainActivity
- `src-tauri/gen/android/app/src/main/AndroidManifest.xml` - Generated manifest (patched at build time)
- `src-tauri/gen/android/app/src/main/res/xml/device_filter.xml` - USB VID/PID filter
- `src-tauri/gen/android/app/build.gradle.kts` - Should have usb-serial-for-android dependency

## Supported USB Chips (Currently in device_filter.xml)

- FTDI (VID: 0x0403 / 1027)
- STM32 Virtual COM (VID: 0x0483 / 1155)
- Silicon Labs CP210x (VID: 0x10c4 / 4292)
- GD32 (VID: 0x28e9 / 10473)
- AT32 (VID: 0x2e3c / 11836)
- APM32 (VID: 0x314b / 12619)
- Raspberry Pi Pico (VID: 0x2e8a / 11914)

If your device isn't listed, add it to `patch-android-manifest.sh` in the device_filter.xml section.

