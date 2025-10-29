# Android USB Serial - Current Status

## ✅ Working

1. **Build System**
   - Debug and release APK builds successfully
   - Wireless ADB deployment working
   - Local build script with validation mode
   - Robust Tauri CLI detection (cargo/npx/yarn fallbacks)

2. **Development Environment**
   - WebView debugging enabled (chrome://inspect)
   - Vite dev server accessible over WiFi (0.0.0.0 binding)
   - HMR working over network
   - Console logs visible in Chrome DevTools

3. **Serial Plugin Integration**
   - Plugin registered in mobile entry point (`lib.rs`)
   - All required permissions granted in capabilities
   - Plugin properly initialized on Android

4. **USB Detection**
   - ✅ **USB device IS BEING DETECTED!**
   - Device path: `/dev/bus/usb/002/002`
   - VID: `1155` (0x0483 - STMicroelectronics)
   - PID: `22336` (0x5740 - Betaflight)
   - Manufacturer: `Betaflight`
   - Product: `Betaflight STM32H743`
   - Serial Number: `367838603330`

## 🔧 Known Issues

### 1. USB Permission Not Granted
**Error:** `User has not given 10339/com.betaflight.app permission to access device /dev/bus/usb/002/002`

**Status:** Android detects the device but hasn't granted permission to access it.

**Possible Solutions:**
- Implement runtime permission request when device is detected
- Handle USB_DEVICE_ATTACHED intent more actively
- Check if plugin has a permission request method
- May need custom Android code to trigger permission dialog

### 2. Response Deserialization Error
**Error:** `failed to deserialize response: invalid type: string "{/dev/bus/usb/002/002={...}}", expected a map`

**Status:** The Android plugin returns a string representation instead of proper JSON.

**Possible Solutions:**
- Parse the string response in JavaScript before deserialization
- Check if newer plugin version fixes this
- Implement custom response handler

## 📋 Next Steps

### Priority 1: USB Permission Handling
1. Research tauri-plugin-serialplugin Android permission APIs
2. Implement permission request flow:
   - Detect when permission is needed
   - Request permission from Android
   - Handle permission grant/deny
3. Test with manual permission grant (Android Settings → Apps → Betaflight → Permissions)

### Priority 2: Fix Response Parsing
1. Add response preprocessing in TauriSerial.js
2. Parse string format: `{/dev/path={key=value, ...}}`
3. Convert to expected JSON structure

### Priority 3: End-to-End Testing
1. Verify port enumeration with permission granted
2. Test port opening/closing
3. Test serial communication (read/write)
4. Test device attach/detach events

## 🔍 Debugging Setup

### Connect via Wireless ADB
```bash
# Start ADB over WiFi
./scripts/setup-adb-wifi.sh

# Or manually
adb tcpip 5555
adb connect <device-ip>:5555
```

### View Console Logs
1. Open `chrome://inspect` in Chrome
2. Find "WebView in com.betaflight.app"
3. Click "inspect"
4. Console shows all debug logs including USB detection

### Build and Install Debug APK
```bash
# Build and install debuggable APK
./scripts/build-android-local.sh dev

# Or manually
source ./android-env.sh
cargo tauri android build --apk --debug
adb install -r src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

## 📁 Key Files

- `src-tauri/src/lib.rs` - Mobile entry point with serial plugin registration
- `src-tauri/capabilities/default.json` - Tauri permissions for Android
- `scripts/patch-android-manifest.sh` - Adds USB permissions and device filters
- `scripts/build-android-local.sh` - Local development build automation
- `src/js/protocols/TauriSerial.js` - Serial protocol implementation
- `vite.config.js` - Network binding for wireless development

## 🎯 Success Criteria

- [x] APK builds without errors
- [x] WebView debugging accessible
- [x] USB device detected
- [ ] USB permission granted
- [ ] Port enumeration returns valid devices
- [ ] Can open serial connection
- [ ] Can read/write to serial port
- [ ] Device attach/detach events work

## 📊 Current Progress: ~80%

The infrastructure is in place and USB detection is working. Only permission handling and response parsing remain before full functionality.
