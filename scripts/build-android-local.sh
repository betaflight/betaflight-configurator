#!/usr/bin/env bash
# Build Betaflight Android locally with required manifest/device filter patches
# Supports dev (debuggable) and release (signed) builds
#
# Usage:
#   scripts/build-android-local.sh validate       # fast checks, no build
#   scripts/build-android-local.sh dev            # debuggable build, auto-install
#   scripts/build-android-local.sh release        # release build, signed and install
#   scripts/build-android-local.sh release \
#       --keystore /path/to/keystore.jks \
#       --storepass <storepass> \
#       --keyalias <alias> \
#       --keypass <keypass>
#
# Notes:
# - Ensures Android project is initialized
# - Applies USB permissions + intent filter + device_filter.xml
# - Injects usb-serial-for-android dependency and JitPack repository (fallback)
# - For release: signs APK with provided keystore or auto-generated debug keystore
# - Requires: Node/Yarn, Rust, Android SDK/NDK, apksigner (from build-tools)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
GEN_ANDROID_DIR="$ROOT_DIR/src-tauri/gen/android"
MANIFEST_PATH="$GEN_ANDROID_DIR/app/src/main/AndroidManifest.xml"
MODE="${1:-dev}"
shift || true

KEYSTORE=""
STOREPASS=""
KEYALIAS=""
KEYPASS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keystore) KEYSTORE="$2"; shift 2;;
    --storepass) STOREPASS="$2"; shift 2;;
    --keyalias) KEYALIAS="$2"; shift 2;;
    --keypass) KEYPASS="$2"; shift 2;;
    *) echo "Unknown argument: $1"; exit 1;;
  esac
done

cd "$ROOT_DIR"

# Helper to run tauri via available toolchain (cargo-tauri preferred)
run_tauri() {
  local args=("$@")
  # Prefer cargo tauri if available
  if command -v cargo >/dev/null 2>&1; then
    if cargo tauri --version >/dev/null 2>&1; then
      cargo tauri "${args[@]}"
      return $?
    fi
  fi
  # Try npx @tauri-apps/cli (no permanent install required)
  if command -v npx >/dev/null 2>&1; then
    npx --yes @tauri-apps/cli "${args[@]}"
    return $?
  fi
  # Try yarn tauri if project has it
  if command -v yarn >/dev/null 2>&1; then
    yarn tauri "${args[@]}"
    return $?
  fi
  printf "Error: No Tauri CLI found. Install one of:\n  - cargo install tauri-cli   (Rust-based)\n  - npm i -g @tauri-apps/cli (Node-based)\nOr ensure 'npx' is available.\n" >&2
  return 127
}

# Ensure node modules and local vite exist
ensure_node_modules() {
  if [[ ! -d "$ROOT_DIR/node_modules" || ! -x "$ROOT_DIR/node_modules/.bin/vite" ]]; then
    echo "   Installing web dependencies (yarn install)"
    yarn install --silent || yarn install
  fi
}

# Fast validation mode (no build, no patch side-effects)
if [[ "$MODE" == "validate" ]]; then
  echo "==> VALIDATE mode: running quick checks (no build)"

  echo "- Checking prerequisites"
  command -v adb >/dev/null 2>&1 && echo "  ✓ adb found" || echo "  ✗ adb missing"
  command -v keytool >/dev/null 2>&1 && echo "  ✓ keytool found" || echo "  ⚠ keytool missing (only needed for signing)"
  command -v apksigner >/dev/null 2>&1 && echo "  ✓ apksigner found" || echo "  ⚠ apksigner not on PATH (will try ANDROID_HOME/build-tools)"
  command -v yarn >/dev/null 2>&1 && echo "  ✓ yarn found" || echo "  ✗ yarn missing"

  echo "- Checking Android manifest path"
  if [[ -f "$MANIFEST_PATH" ]]; then
    echo "  ✓ Manifest exists: $MANIFEST_PATH"
  else
    echo "  ✗ Manifest missing (will be created by 'yarn tauri android init --ci')"
  fi

  echo "- Dry syntax check for patch script"
  bash -n "$ROOT_DIR/scripts/tauri-patch-android.sh" && echo "  ✓ tauri-patch-android.sh syntax OK" || echo "  ✗ patch script has syntax errors"

  echo "- Listing connected ADB devices"
  adb devices

  echo "==> Validate finished. Use 'dev' for debuggable build or 'release' to sign/install."
  exit 0
fi

# Helper to select Android device for dev builds
select_android_device() {
  if ! command -v adb >/dev/null 2>&1; then
    echo "adb not found. Please install Android SDK and ensure adb is in PATH."
    exit 1
  fi
  
  echo "==> Checking for connected Android devices..."
  local devices
  devices=$(adb devices | grep -v "List of devices" | grep -v "^$" | awk '{print $1}')
  
  if [[ -z "$devices" ]]; then
    echo "No devices connected. Please connect your tablet via wireless ADB."
    echo "Run: adb connect <tablet_ip>:<port>"
    exit 1
  fi
  
  local device_count
  device_count=$(echo "$devices" | wc -l)
  
  if [[ $device_count -eq 1 ]]; then
    local device_id
    device_id=$(echo "$devices" | head -1)
    echo "Using device: $device_id"
    export ANDROID_SERIAL="$device_id"
  else
    echo "Multiple devices found. Select one:"
    select device_id in $devices; do
      if [[ -n "$device_id" ]]; then
        echo "Selected: $device_id"
        export ANDROID_SERIAL="$device_id"
        break
      fi
    done
  fi
}

echo "==> Checking Android project generation"
if [[ ! -f "$MANIFEST_PATH" ]]; then
  echo "   Android project not found, initializing..."
  run_tauri android init --ci
fi

# Always patch after init (init may regenerate files)
echo "==> Patching Android manifest and Gradle for USB serial support"
bash "$ROOT_DIR/scripts/tauri-patch-android.sh"

if [[ "$MODE" == "dev" || "$MODE" == "debug" ]]; then
  echo "==> Building debuggable APK (dev)"
  echo "   This enables WebView debugging so console logs are visible"
  # Optional: build web assets so dev fallback exists
  if [[ ! -d "$ROOT_DIR/dist" ]]; then
    ensure_node_modules
    echo "   Building web assets (vite)"
    yarn build
  fi
  select_android_device
  run_tauri android dev
  echo "==> Dev build complete and should be installed on the device."
  exit 0
fi

if [[ "$MODE" != "release" ]]; then
  echo "Error: unknown build mode '$MODE' (use 'dev' or 'release')" >&2
  exit 1
fi

echo "==> Building release APK"
run_tauri android build

# Locate the unsigned universal APK produced by Gradle
UNSIGNED_APK=$(find "$GEN_ANDROID_DIR/app/build/outputs/apk" -type f -name "*-unsigned.apk" | head -1 || true)
if [[ -z "${UNSIGNED_APK}" ]]; then
  echo "Error: Could not find unsigned APK under $GEN_ANDROID_DIR/app/build/outputs/apk" >&2
  exit 1
fi

echo "   Found unsigned APK: $UNSIGNED_APK"
SIGNED_APK="${UNSIGNED_APK/-unsigned/-signed}"

# Prepare signing
if [[ -z "$KEYSTORE" ]]; then
  # Fallback to Android debug keystore (auto-generate if missing)
  KEYSTORE="$HOME/.android/debug.keystore"
  KEYALIAS="androiddebugkey"
  STOREPASS="android"
  KEYPASS="android"

  if [[ ! -f "$KEYSTORE" ]]; then
    echo "==> Generating debug keystore at $KEYSTORE"
    keytool -genkeypair -v \
      -keystore "$KEYSTORE" \
      -storepass "$STOREPASS" \
      -alias "$KEYALIAS" \
      -keypass "$KEYPASS" \
      -keyalg RSA \
      -keysize 2048 \
      -validity 10000 \
      -dname "CN=Android Debug,O=Android,C=US"
  fi
else
  # Validate custom keystore args
  if [[ -z "$STOREPASS" || -z "$KEYALIAS" || -z "$KEYPASS" ]]; then
    echo "Error: When using --keystore, you must also specify --storepass, --keyalias and --keypass" >&2
    exit 1
  fi
fi

# Find apksigner
if command -v apksigner >/dev/null 2>&1; then
  APK_SIGNER="apksigner"
else
  # Try Android SDK build-tools
  if [[ -n "${ANDROID_HOME:-}" ]]; then
    APK_SIGNER=$(find "$ANDROID_HOME/build-tools" -type f -name apksigner | sort -V | tail -1 || true)
  fi
fi

if [[ -z "${APK_SIGNER:-}" ]]; then
  echo "Error: apksigner not found. Install Android build-tools and ensure it's on PATH." >&2
  exit 1
fi

echo "==> Signing APK"
"$APK_SIGNER" sign \
  --ks "$KEYSTORE" \
  --ks-key-alias "$KEYALIAS" \
  --ks-pass pass:"$STOREPASS" \
  --key-pass pass:"$KEYPASS" \
  --out "$SIGNED_APK" \
  "$UNSIGNED_APK"

echo "==> Verifying signature"
"$APK_SIGNER" verify -v "$SIGNED_APK"

echo "==> Installing signed APK"
adb install -r "$SIGNED_APK" || true

echo "==> Done. Installed: $SIGNED_APK"
