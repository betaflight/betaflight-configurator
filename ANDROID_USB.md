# Android USB Serial Support

# Android USB Serial Support

## Current Status (v2.16.0)

The `tauri-plugin-serialplugin` version 2.16.0 includes Android support with Kotlin implementation for USB serial communication. However, USB devices may not be detected due to runtime permission handling.

## What's Working

✅ **Build**: APK compiles successfully  
✅ **Manifest Permissions**: USB permissions are patched into AndroidManifest.xml  
✅ **Plugin**: Version 2.16.0 has Android Kotlin code  
✅ **Dependencies**: `usb-serial-for-android` library is added via Gradle  
✅ **Device Filter**: USB device VID/PID filter is created  

## What May Not Be Working

❌ **Runtime Permission Request**: Android requires explicit permission request when USB device is attached  
❌ **Port Detection**: USB ports may not appear without proper UsbManager usage  

## The Problem

Even with manifest permissions, Android apps need to:
1. **Request permission at runtime** when a USB device is detected
2. **Use Android's UsbManager** to enumerate connected USB devices
3. **Handle USB_DEVICE_ATTACHED intent** to detect when devices are plugged in

The plugin version 2.16.0 has Kotlin code for this, but it may need:
- Proper initialization in MainActivity
- USB permission dialog handling
- Event bridging between Android and Tauri

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
