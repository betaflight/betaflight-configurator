# Android USB Serial Support

## Current Status (v2.16.0)

The `tauri-plugin-serialplugin` version 2.16.0 includes Android support, but requires additional runtime permission handling to actually detect USB devices.

## What's Working

✅ **Build**: APK compiles successfully  
✅ **Manifest Permissions**: USB permissions are patched into AndroidManifest.xml  
✅ **Plugin**: Version 2.16.0 has Android Kotlin code  
✅ **Dependencies**: `usb-serial-for-android` library is added via Gradle  
✅ **Device Filter**: USB device VID/PID filter is created  
✅ **Intent Filter**: App launches when USB device is attached  

## Custom MainActivity

We've added a custom `MainActivity.kt` that handles USB permission requests properly:

### What it does:
1. **Registers USB broadcast receivers** for device attach/detach events
2. **Automatically requests permission** when a USB device is detected
3. **Checks for already connected devices** on app launch
4. **Handles the permission dialog** and logs the result
5. **Manages app lifecycle** (onCreate, onDestroy, onNewIntent)

### How it works:
```kotlin
// When USB device is attached:
1. Android broadcasts ACTION_USB_DEVICE_ATTACHED
2. MainActivity receives the broadcast
3. Checks if we have permission for the device
4. If not, shows permission dialog to user
5. User grants/denies permission
6. Result is broadcast back to MainActivity
7. Plugin can now enumerate and open the port
```

## The Problem We Solved

Even with manifest permissions, Android apps need to **request permission at runtime** for each USB device. The stock Tauri activity doesn't do this automatically, so we added:

- Custom `MainActivity.kt` that extends `TauriActivity`
- USB broadcast receivers for attach/detach events  
- Runtime permission request handling
- Logging to help debug USB issues

## Usage

### Building for Android

1. Initialize the Android project (if not already done):
   ```bash
   cd src-tauri
   cargo tauri android init
   ```

2. **Run the patch script** before building:
   ```bash
   ./scripts/patch-android-manifest.sh
   ```

3. Build the Android APK:
   ```bash
   cd src-tauri
   cargo tauri android build
   ```

### Automated Workflow

You can combine these steps:

```bash
# From the project root
cd src-tauri
cargo tauri android init
cd ..
./scripts/patch-android-manifest.sh
cd src-tauri
cargo tauri android build
```

## What the Script Does

1. Checks if the Android manifest exists at `src-tauri/gen/android/app/src/main/AndroidManifest.xml`
2. Adds USB permissions if not already present
3. Adds USB device attach intent filter
4. Creates `device_filter.xml` with all Betaflight-compatible USB device IDs
5. Creates a backup of the original manifest

## Future Improvements

Ideally, `tauri-plugin-serialplugin` should handle Android permissions automatically. If this becomes available in a future version, this workaround will no longer be necessary.

## Troubleshooting

### Script fails with "manifest not found"
Run `cargo tauri android init` first to generate the Android project.

### Permissions not working after build
Make sure you run the patch script **after** `android init` but **before** `android build`.

### Need to rebuild
If you run `cargo tauri android init` again (which regenerates the manifest), you must run the patch script again before building.
