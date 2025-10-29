# Android USB Debugging Guide

## Current Situation

**Status**: APK builds and installs, but USB ports not detected on Android tablet

**What We Know**:
- ✅ Build succeeds without errors
- ✅ Plugin v2.16.0 has Android Kotlin code
- ✅ Manifest patch script runs in CI
- ✅ App prompts for USB device handling when device attached
- ❌ No ports show in the UI after permission granted

## Investigation Steps

### 1. Verify Manifest Patching (FIRST PRIORITY)

Run the test workflow:
```bash
# Push the test workflow
git add .github/workflows/test-android-patch.yml
git commit -m "Add manifest patching test workflow"
git push

# Then go to GitHub Actions and run "Test Android Patch" manually
```

Check the workflow output for:
- `BEFORE patch:` section should show unpatched manifest
- `AFTER patch:` section should show USB permissions
- `device_filter.xml` should exist with VID/PID entries
- `build.gradle.kts` should have usb-serial-for-android dependency

### 2. Check Your USB Device VID/PID

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

### 3. Check Plugin Initialization

The plugin should auto-initialize on Android, but we can verify by checking the Rust code:

**Current initialization** (src-tauri/src/main.rs):
```rust
.plugin(tauri_plugin_serialplugin::init())
```

This should work, but the plugin may need the Android UsbManager to be explicitly initialized.

### 4. Potential Issues

#### Issue A: Runtime Permission Not Requested
Android requires apps to request USB permission at runtime, not just declare it in the manifest. The plugin's Kotlin code should handle this, but it may need:

```kotlin
// In MainActivity.kt or plugin initialization
val usbManager = getSystemService(Context.USB_SERVICE) as UsbManager
val permissionIntent = PendingIntent.getBroadcast(this, 0, Intent(ACTION_USB_PERMISSION), 0)
usbManager.requestPermission(device, permissionIntent)
```

#### Issue B: Plugin Not Using usb-serial-for-android
The plugin may have its own USB implementation that conflicts with usb-serial-for-android. We need to verify the plugin actually uses this library.

#### Issue C: Port Enumeration Timing
Ports may need to be enumerated AFTER USB permission is granted. The app may need to:
1. Wait for USB_DEVICE_ATTACHED broadcast
2. Request permission via dialog
3. THEN enumerate ports after permission granted

### 5. Next Steps

1. **Run test workflow** to verify patches are applied
2. **Check device VID/PID** matches filter
3. **Review plugin source code** at https://github.com/s00d/tauri-plugin-serialplugin/tree/main/android
4. **Add logging** to see what the plugin sees:
   - Is UsbManager finding devices?
   - Is permission actually granted?
   - Does the plugin call port enumeration after permission?

### 6. Workaround: Custom Android Code

If the plugin doesn't properly handle USB, we may need to add custom Android code:

**Option 1**: Fork and patch the plugin  
**Option 2**: Add custom Kotlin code to MainActivity  
**Option 3**: Use a different approach (WebUSB, custom serial implementation)

## Key Files

- `scripts/patch-android-manifest.sh` - Adds USB permissions and filters
- `src-tauri/gen/android/app/src/main/AndroidManifest.xml` - Generated manifest (check after patch)
- `src-tauri/gen/android/app/src/main/res/xml/device_filter.xml` - USB VID/PID filter
- `src-tauri/gen/android/app/build.gradle.kts` - Should have usb-serial-for-android dependency

## Supported USB Chips (Currently in device_filter.xml)

- FTDI (VID: 0x0403)
- STM32 Virtual COM (VID: 0x0483)
- Silicon Labs CP210x (VID: 0x10c4)
- GD32 (VID: 0x28e9)
- AT32 (VID: 0x2e3c)
- APM32 (VID: 0x314b)
- Raspberry Pi Pico (VID: 0x2e8a)

If your device isn't listed, add it to `patch-android-manifest.sh` in the device_filter.xml section.
