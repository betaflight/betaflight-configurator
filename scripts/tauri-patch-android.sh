#!/bin/bash
# Main script to patch Android project for USB serial support
# This orchestrates separate scripts for different patching aspects
# Run after 'cargo tauri android init' or 'cargo tauri android build'

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MANIFEST_PATH="src-tauri/gen/android/app/src/main/AndroidManifest.xml"

if [ ! -f "$MANIFEST_PATH" ]; then
    echo "Error: Android manifest not found at $MANIFEST_PATH"
    echo "Please run 'cargo tauri android init' first"
    exit 1
fi

echo "Starting Android USB support configuration..."

# Run individual patching scripts
echo "1. Patching Android manifest..."
bash "$SCRIPT_DIR/patch-android-manifest.sh"

echo "2. Creating USB device filter..."
bash "$SCRIPT_DIR/create-device-filter.sh"

echo "3. Configuring Gradle settings repositories..."
bash "$SCRIPT_DIR/patch-gradle-settings.sh"

echo "4. Configuring app Gradle dependencies..."
bash "$SCRIPT_DIR/patch-app-gradle.sh"

echo "5. Applying custom MainActivity (if provided)..."

# If a custom MainActivity.kt exists in scripts/, copy it into the generated Android project
CUSTOM_MAIN_ACTIVITY_SRC="$SCRIPT_DIR/MainActivity.kt"
CUSTOM_MAIN_ACTIVITY_DST_DIR="src-tauri/gen/android/app/src/main/java/com/betaflight/app"
CUSTOM_MAIN_ACTIVITY_DST="$CUSTOM_MAIN_ACTIVITY_DST_DIR/MainActivity.kt"

if [ -f "$CUSTOM_MAIN_ACTIVITY_SRC" ]; then
    mkdir -p "$CUSTOM_MAIN_ACTIVITY_DST_DIR"
    cp "$CUSTOM_MAIN_ACTIVITY_SRC" "$CUSTOM_MAIN_ACTIVITY_DST"
    echo "   - Custom MainActivity applied to $CUSTOM_MAIN_ACTIVITY_DST"
else
    echo "   - No custom MainActivity found at $CUSTOM_MAIN_ACTIVITY_SRC; skipping"
fi

echo ""
echo "✓ Android USB support configuration complete!"
echo "You can now build the Android app with: cargo tauri android build"
