# Android Development Guide

This guide covers the complete setup and workflow for building and running the Betaflight Configurator on Android using Tauri.

## Prerequisites

### Required Software
- **Node.js**: v20.x (LTS)
- **Yarn**: v1.22.x
- **Android Studio**: Latest version (for SDK, NDK, and emulator)
- **Rust**: Latest stable version
- **Android SDK**: API Level 34+
- **Android NDK**: Version 29.0.14033849
- **Java**: JDK 17+ (bundled with Android Studio)

### Android SDK Setup
1. Install Android Studio from [developer.android.com](https://developer.android.com/studio)
2. Open Android Studio → SDK Manager
3. Install:
   - Android SDK Platform 34+
   - Android SDK Build-Tools 35.0.0
   - Android NDK 29.0.14033849
   - Android SDK Command-line Tools
   - Android Emulator

### Rust Targets
Install Android targets for Rust:
```bash
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

## Environment Configuration

### 1. Create `android-env.sh`
Create this file in the project root:

```bash
#!/bin/bash

# Android SDK path (adjust if needed)
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

# Find the latest NDK version
NDK_VERSION=$(ls -1 "$ANDROID_HOME/ndk" 2>/dev/null | sort -V | tail -n 1)

if [ -z "$NDK_VERSION" ]; then
    echo "Error: No NDK found in $ANDROID_HOME/ndk"
    exit 1
fi

export NDK_HOME="$ANDROID_HOME/ndk/$NDK_VERSION"

echo "Found NDK version: $NDK_VERSION"
echo ""
echo "Android environment variables set:"
echo "ANDROID_HOME=$ANDROID_HOME"
echo "ANDROID_SDK_ROOT=$ANDROID_SDK_ROOT"
echo "NDK_HOME=$NDK_HOME"
echo ""
echo "Setup complete! You can now run: yarn tauri:dev:android"
```

Make it executable:
```bash
chmod +x android-env.sh
```

### 2. Add Android Tools to PATH
Add these lines to your `~/.bashrc` or `~/.zshrc`:
```bash
export PATH="$PATH:$HOME/Android/Sdk/platform-tools"
export PATH="$PATH:$HOME/Android/Sdk/emulator"
```

Then reload:
```bash
source ~/.bashrc  # or source ~/.zshrc
```

### 3. Source Environment Variables
Before running any Android commands:
```bash
source ./android-env.sh
```

## Project Structure

### Key Files
- **`src-tauri/Cargo.toml`**: Rust library configuration with mobile targets
- **`src-tauri/src/lib.rs`**: Mobile entry point with `#[tauri::mobile_entry_point]`
- **`src-tauri/src/main.rs`**: Desktop entry point
- **`src-tauri/tauri.conf.json`**: Tauri configuration (devUrl, frontendDist, capabilities)
- **`src-tauri/gen/android/`**: Generated Android project files
- **`dist/`**: Built frontend assets (must exist for build to succeed)

### Important Configuration

#### `src-tauri/Cargo.toml`
```toml
[lib]
name = "betaflight_app"
path = "src/lib.rs"
crate-type = ["staticlib", "cdylib", "rlib"]
```

#### `src-tauri/src/lib.rs`
```rust
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

#### `src-tauri/tauri.conf.json`
```json
{
  "build": {
    "devUrl": "http://localhost:8000",
    "frontendDist": "../dist"
  }
}
```

#### `src-tauri/gen/android/app/build.gradle.kts`
```kotlin
rust {
    rootDirRel = "../../../../"  // Important: points to project root for Yarn
}
```

## Android Emulator

### List Available AVDs
```bash
yarn android:emu:list
```

### Check if Emulator is Running
```bash
yarn android:emu:check
```

### Start Emulator
Default emulator (Medium_Phone_API_35):
```bash
yarn android:emu:start
```

Custom AVD:
```bash
AVD=Your_Device_Name yarn android:emu:start
```

With host GPU acceleration (if supported):
```bash
yarn android:emu:start:host
```

### Emulator Troubleshooting (Linux/Wayland)

If you encounter EGL or graphics errors:

1. **Force X11 mode**: The scripts use `QT_QPA_PLATFORM=xcb` automatically
2. **SwiftShader fallback**: Default scripts use `-gpu swiftshader_indirect`
3. **Disable snapshots**: Scripts use `-no-snapshot-load` to avoid boot issues

For persistent issues:
- Update Mesa drivers: `sudo apt install mesa-vulkan-drivers`
- Use host GPU: `yarn android:emu:start:host`
- Check AVD config in Android Studio → AVD Manager

## Development Workflow

### First-Time Setup
1. Install dependencies:
   ```bash
   yarn install
   ```

2. Create dist directory placeholder:
   ```bash
   mkdir -p dist && touch dist/.gitkeep
   ```

3. Source Android environment:
   ```bash
   source ./android-env.sh
   ```

4. Start emulator:
   ```bash
   yarn android:emu:start
   ```

5. Wait for emulator to fully boot (check with `adb devices`)

### Development Mode

#### Run Android Dev Build
```bash
source ./android-env.sh
yarn tauri:dev:android
```

This will:
1. Start Vite dev server at `http://localhost:8000`
2. Build Rust library for Android (x86_64 for emulator)
3. Compile Android APK
4. Install and launch on connected device/emulator

Note: Dev mode does not rebuild the `dist/` folder. Tauri will load from `devUrl` during `tauri android dev` and falls back to `dist/` only if the dev server is unreachable. If you need a fresh fallback, build the web assets first:
```bash
yarn build
yarn tauri:dev:android
```
Alternatively, use the convenience script to build dist then run dev:
```bash
yarn tauri:dev:android:with-dist
```

#### Live Reload Setup
To enable hot module replacement on the emulator:

1. Ensure Vite dev server is accessible:
   ```bash
   adb reverse tcp:8000 tcp:8000
   ```

2. The app should automatically connect to `http://localhost:8000` (devUrl)

3. Make code changes in `src/` - Vite will hot-reload automatically

#### Verify DevUrl Connectivity
Open Chrome on the emulator and navigate to `http://localhost:8000` to verify the dev server is accessible.

### Production Build

Build release APK:
```bash
source ./android-env.sh
yarn tauri:build:android
```

The APK will be in: `src-tauri/gen/android/app/build/outputs/apk/`

## Common Issues & Solutions

### Issue: "Couldn't find a package.json file in src-tauri"

**Solution**: The Gradle `rootDirRel` is incorrect. Edit `src-tauri/gen/android/app/build.gradle.kts`:
```kotlin
rust {
    rootDirRel = "../../../../"
}
```

### Issue: "No library targets found in package"

**Solution**: Add library target to `src-tauri/Cargo.toml`:
```toml
[lib]
name = "betaflight_app"
crate-type = ["staticlib", "cdylib"]
```

And create `src-tauri/src/lib.rs` with mobile entry point.

### Issue: "frontendDist path doesn't exist"

**Solution**: Create the dist directory:
```bash
mkdir -p dist && touch dist/.gitkeep
```

### Issue: Code changes not reflected on Android

**Causes**:
1. Emulator not connected to devUrl (missing `adb reverse`)
2. App loaded from packaged dist instead of dev server

**Solutions**:
1. Run `adb reverse tcp:8000 tcp:8000`
2. Verify Vite is running at port 8000
3. Check browser console in app for devUrl connection

### Issue: Emulator hangs or EGL errors (Linux)

**Solutions**:
1. Use provided emulator scripts (includes Qt/GPU fixes)
2. Force X11: `QT_QPA_PLATFORM=xcb`
3. Use SwiftShader: `-gpu swiftshader_indirect`
4. Update graphics drivers

### Issue: "tauri android dev" waits indefinitely

**Cause**: No emulator/device detected

**Solutions**:
1. Start emulator first: `yarn android:emu:start`
2. Check devices: `adb devices`
3. Ensure emulator is fully booted (not just window open)

### Issue: "adb: command not found"

**Cause**: Android SDK platform-tools not in PATH

**Solutions**:
1. Add to your shell profile (`~/.bashrc` or `~/.zshrc`):
   ```bash
   export PATH="$PATH:$HOME/Android/Sdk/platform-tools"
   export PATH="$PATH:$HOME/Android/Sdk/emulator"
   ```
2. Reload: `source ~/.bashrc`
3. Verify: `which adb` should show the path

## Available Scripts

### Tauri Android
- `yarn tauri:dev:android` - Development build with hot reload
- `yarn tauri:build:android` - Production release build

### Capacitor Android (Alternative)
- `yarn android:dev` - Capacitor dev build
- `yarn android:run` - Capacitor production build
- `yarn android:sync` - Sync web assets to Android
- `yarn android:open` - Open in Android Studio

## Architecture Notes

### Tauri Mobile vs Desktop
- **Desktop**: Uses `src-tauri/src/main.rs` directly
- **Mobile**: Uses `src-tauri/src/lib.rs` with `#[tauri::mobile_entry_point]`
- **Shared**: Both call the same `run()` function for consistency

### Build Process
1. **BeforeDevCommand**: Runs `yarn dev` (Vite)
2. **Rust Compilation**: Builds lib for Android target (e.g., x86_64-linux-android)
3. **Gradle Build**: Invokes Yarn to run `tauri android android-studio-script`
4. **APK Assembly**: Packages Rust lib + assets into APK
5. **Installation**: ADB installs APK on device/emulator

### DevUrl vs FrontendDist
- **DevUrl** (`http://localhost:8000`): Used in dev mode for hot reload
- **FrontendDist** (`../dist`): Used in production builds (packaged assets)
- **Fallback**: If devUrl unreachable, Tauri falls back to frontendDist

## Additional Resources

- [Tauri Mobile Docs](https://v2.tauri.app/develop/mobile/)
- [Android Developer Guide](https://developer.android.com/studio)
- [Rust Android Targets](https://doc.rust-lang.org/nightly/rustc/platform-support.html)

## Contributing

When making changes to Android configuration:
1. Test on both emulator and physical device
2. Verify both debug and release builds
3. Document any new environment requirements
4. Update this guide with new troubleshooting steps

---

**Last Updated**: October 24, 2025
