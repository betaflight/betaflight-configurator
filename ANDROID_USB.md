# Android USB Serial Support

## Problem

The Betaflight Configurator uses `tauri-plugin-serialplugin` to access serial ports. On Linux, this works without special configuration, but **Android requires explicit USB permissions** that must be declared in the `AndroidManifest.xml`.

Since the Android project in `src-tauri/gen/android/` is **regenerated at build time**, manual changes to the manifest are lost.

## Solution

We've created a patch script that automatically adds the required USB permissions and device filters to the generated Android manifest.

### Required Permissions

The script adds:
- `android.permission.USB_PERMISSION` - Required to access USB devices
- `android.hardware.usb.host` - Declares USB host mode support
- USB device intent filter - Prompts user when compatible USB device is connected
- USB device filter - Lists all Betaflight-compatible USB devices (FTDI, STM32, CP210x, etc.)

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
