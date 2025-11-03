# Android USB Support Scripts

This directory contains scripts to configure Android USB serial support for the Betaflight Configurator Tauri app.

## Scripts Overview

### `tauri-patch-android.sh` (Main Orchestrator)
The main script that coordinates all Android USB configuration. Run this after `cargo tauri android init`.

**What it does:**
- Calls all individual scripts in the correct order
- Provides overall progress reporting
- Ensures Android project exists before proceeding

### `patch-android-manifest.sh`
Configures the Android manifest with USB permissions and intent filters.

**What it does:**
- Adds `android.permission.USB_PERMISSION` permission
- Adds `android.hardware.usb.host` feature
- Adds USB device attach intent filter
- Adds metadata referencing the device filter XML

### `create-device-filter.sh`
Creates the USB device filter XML file that defines supported USB devices.

**What it does:**
- Creates `res/xml/device_filter.xml`
- Defines USB device filters for Betaflight-compatible devices:
  - FT232R USB UART
  - STM32 devices (various modes)
  - CP210x devices
  - GD32 devices
  - AT32 devices
  - APM32 devices
  - Raspberry Pi Pico devices

### `patch-gradle-settings.sh`
Configures project-level Gradle repositories in `settings.gradle.kts`.

**What it does:**
- Adds jitpack.io repository to `dependencyResolutionManagement`
- Adds jitpack.io repository to `pluginManagement`
- Ensures Google Maven and Maven Central are available

### `patch-app-gradle.sh`
Configures app-level Gradle dependencies and repositories.

**What it does:**
- Adds jitpack.io repository to app module
- Adds `usb-serial-for-android:3.8.0` dependency
- Ensures dependency resolution works at module level

## Usage

After running `cargo tauri android init`, execute:

```bash
bash scripts/tauri-patch-android.sh
```

This will run all configuration steps automatically.

## Individual Script Usage

You can also run individual scripts if needed:

```bash
# Only update manifest permissions
bash scripts/patch-android-manifest.sh

# Only update device filters
bash scripts/create-device-filter.sh

# Only update Gradle settings
bash scripts/patch-gradle-settings.sh

# Only update app dependencies
bash scripts/patch-app-gradle.sh
```

## Maintenance Benefits

- **Separation of Concerns**: Each script handles one specific aspect
- **Independent Testing**: Scripts can be tested and debugged individually
- **Selective Updates**: Only run the scripts that need changes
- **Clear Documentation**: Each script has a focused purpose
- **Easier Maintenance**: Changes to one aspect don't affect others