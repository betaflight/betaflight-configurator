#!/usr/bin/env bash
# Build Betaflight Android locally with required manifest/device filter patches
# Supports dev (debuggable) and release (signed) builds
#
# Usage:
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

echo "==> Checking Android project generation"
if [[ ! -f "$MANIFEST_PATH" ]]; then
  echo "   Android project not found, initializing..."
  yarn tauri android init --ci
else
  echo "   Android project already initialized"
fi

# Always patch after init (init may regenerate files)
echo "==> Patching Android manifest and Gradle for USB serial support"
bash "$ROOT_DIR/scripts/patch-android-manifest.sh"

if [[ "$MODE" == "dev" || "$MODE" == "debug" ]]; then
  echo "==> Building debuggable APK (dev)"
  echo "   This enables WebView debugging so console logs are visible"
  # Optional: build web assets so dev fallback exists
  if [[ ! -d "$ROOT_DIR/dist" ]]; then
    echo "   Building web assets (vite)"
    yarn build
  fi
  yarn tauri android dev
  echo "==> Dev build complete and should be installed on the device."
  exit 0
fi

if [[ "$MODE" != "release" ]]; then
  echo "Error: unknown build mode '$MODE' (use 'dev' or 'release')" >&2
  exit 1
fi

echo "==> Building release APK"
yarn tauri android build

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
