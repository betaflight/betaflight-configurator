# Next Steps for Android USB Debugging

## Current Status

✅ **Completed:**
- Android APK builds successfully
- Added extensive debug logging to `TauriSerial.js`
- Temporarily disabled device filtering (returns ALL detected USB devices)
- Set up ADB wireless debugging (`scripts/setup-adb-wifi.sh`)
- ADB connected successfully to tablet

❌ **Blocked:**
- Release builds don't expose JavaScript console logs
- Can't see our debug output in logcat or Chrome DevTools
- Chrome DevTools doesn't show WebView for Tauri app (expected for release builds)

## The Problem

Tauri Android release builds **don't enable WebView debugging** by default. This means:
- JavaScript `console.log()` doesn't appear in `adb logcat`
- The app doesn't show up in `chrome://inspect` as a debuggable WebView
- We can't see the USB enumeration debug logs we added

## Solution: Build a Dev/Debug APK

We need to build the app in **development mode** with debugging enabled.

### Option 1: Local Dev Build (Recommended)

Build a debug APK locally with WebView debugging enabled:

```bash
# 1. Set up environment
source ./android-env.sh

# 2. Make sure you have the Android emulator or tablet connected
adb devices

# 3. Build in dev mode (this enables debugging)
yarn tauri android dev
```

This will:
- Enable WebView debugging automatically
- Show console logs in logcat
- Make the app visible in chrome://inspect
- Allow you to see all our debug output!

### Option 2: Modify CI to Build Debug APK

Alternatively, modify `.github/workflows/ci.yml` to build a debug APK instead of release:

```yaml
- name: Build Tauri Android APK
  run: |
    cd src-tauri
    cargo tauri android build --debug  # Add --debug flag
```

Then download the debug APK from the GitHub Actions artifact.

## How to Use the Dev Build

Once you have a debug APK installed:

### 1. Connect via ADB (Wireless)
```bash
# Use the helper script
./scripts/setup-adb-wifi.sh

# Or manually
adb connect <TABLET_IP>:5555
adb devices  # Verify connection
```

### 2. Launch the App
```bash
adb shell am start -n com.betaflight.app/.MainActivity
```

### 3. View Console Logs
```bash
# Real-time logs with our debug output
adb logcat | grep -i "TauriSerial\|DEBUG"

# Or filter for JavaScript console messages
adb logcat | grep -i "chromium.*console"
```

###  4. Check Chrome DevTools
1. Open Chrome: `chrome://inspect`
2. Find the app under your device
3. Click "inspect"
4. Go to Console tab
5. Connect flight controller to USB
6. Watch the debug output!

## What to Look For

Once debugging is enabled, you'll see output like:

```javascript
[TauriSerial] === DEBUG: All detected ports BEFORE filtering ===
[TauriSerial] Raw portsMap from plugin: { "/dev/bus/usb/001/002": { vid: 1155, pid: 22336, ... } }
[TauriSerial] Total ports detected: 1
[TauriSerial]   [0] path: /dev/bus/usb/001/002, VID: 1155, PID: 22336, displayName: Betaflight STM Electronics
[TauriSerial] === DEBUG: After filtering ===
[TauriSerial] Found 1 serial ports (filtered from 1)
```

### Scenarios to Diagnose:

**✅ SUCCESS - Ports detected:**
```
[TauriSerial] Total ports detected: 1
[TauriSerial]   [0] path: /dev/bus/usb/001/002, VID: 1155, PID: 22336
```
→ Great! USB permissions and drivers are working. If still no ports in UI, check filtering logic.

**⚠️ PARTIAL - Ports detected but no VID/PID:**
```
[TauriSerial] Total ports detected: 1
[TauriSerial]   [0] path: /dev/ttyUSB0, VID: undefined, PID: undefined
[TauriSerial]   FILTERED OUT (no VID/PID): /dev/ttyUSB0
```
→ USB serial driver not providing device info. May need different library or permissions.

**❌ FAILURE - No ports detected:**
```
[TauriSerial] Total ports detected: 0
```
→ Android doesn't see the USB device at all. Check:
- USB device is connected
- No permission dialog appeared (need to request runtime permission)
- USB drivers loaded (`adb shell lsusb` or `adb shell ls /dev/bus/usb/*/*`)

**⚠️ Unknown device:**
```
[TauriSerial]   [0] path: /dev/bus/usb/001/002, VID: 9999, PID: 8888
[TauriSerial]   FILTERED OUT (unknown device): VID:9999 PID:8888
```
→ Flight controller uses different VID/PID. Add it to `src/js/protocols/devices.js`.

## Files Modified for Debugging

1. **`src/js/protocols/TauriSerial.js`**:
   - Added extensive logging in `loadDevices()`
   - Shows raw portsMap, all detected ports, filtering decisions
   - Temporarily returns ALL ports (bypasses filter)

2. **`scripts/patch-android-manifest.sh`**:
   - Adds USB permissions to manifest
   - Creates device_filter.xml with Betaflight VID/PIDs
   - Injects usb-serial-for-android dependency

3. **`scripts/setup-adb-wifi.sh`** (NEW):
   - Interactive setup for wireless ADB debugging
   - Supports both Wireless Debugging (Android 11+) and TCP/IP methods

4. **`DEBUGGING_ANDROID.md`** (NEW):
   - Comprehensive guide for Android USB debugging
   - ADB setup, Chrome DevTools, logcat usage
   - Troubleshooting common scenarios

## Quick Start for Next Session

```bash
# 1. Build debug APK locally
source ./android-env.sh
yarn tauri android dev

# 2. Or install debug APK from CI (after modifying workflow)
adb install -r app-debug.apk

# 3. Connect wirelessly
./scripts/setup-adb-wifi.sh

# 4. Launch app
adb shell am start -n com.betaflight.app/.MainActivity

# 5. Watch logs
adb logcat | grep -i "TauriSerial\|DEBUG"

# 6. Open Chrome DevTools
# chrome://inspect → find app → click "inspect"

# 7. Connect flight controller and observe console output!
```

## Additional Resources

- **ADB Wireless Setup**: `./scripts/setup-adb-wifi.sh`
- **Debugging Guide**: `DEBUGGING_ANDROID.md`
- **USB Setup Guide**: `ANDROID_USB.md`
- **Android Dev Guide**: `ANDROID.md`

## TL;DR

**The CI release build works fine, but we can't see the debug output.**

**Next step:** Build a **debug/dev APK** with WebView debugging enabled, then we'll be able to see why USB serial enumeration isn't working!
