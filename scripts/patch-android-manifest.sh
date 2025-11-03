#!/bin/bash
# Script to patch the Android manifest with USB permissions and intent filters
# This should be run after 'cargo tauri android init' or 'cargo tauri android build'

set -e

MANIFEST_PATH="src-tauri/gen/android/app/src/main/AndroidManifest.xml"

if [ ! -f "$MANIFEST_PATH" ]; then
    echo "Error: Android manifest not found at $MANIFEST_PATH"
    echo "Please run 'cargo tauri android init' first"
    exit 1
fi

echo "Patching Android manifest for USB serial support..."

# Backup original manifest
cp "$MANIFEST_PATH" "$MANIFEST_PATH.bak"

# Check if USB permissions already added
if grep -q "android.permission.USB_PERMISSION" "$MANIFEST_PATH"; then
    echo "USB permissions already present in manifest"
else
    # Add USB permissions before </manifest>
    # Using awk for portability across macOS and Linux
    awk '
        /<\/manifest>/ {
            print "    <!-- USB permissions for serial communication -->"
            print "    <uses-permission android:name=\"android.permission.USB_PERMISSION\" />"
            print "    <uses-feature android:name=\"android.hardware.usb.host\" android:required=\"false\" />"
        }
        { print }
    ' "$MANIFEST_PATH" > "$MANIFEST_PATH.tmp" && mv "$MANIFEST_PATH.tmp" "$MANIFEST_PATH"
    echo "Added USB permissions to manifest"
fi

# Check if USB intent filter already added
if grep -q "USB_DEVICE_ATTACHED" "$MANIFEST_PATH"; then
    echo "USB intent filter already present in manifest"
else
    # Add USB device intent filter and metadata before </activity>
    # Using awk for portability across macOS and Linux
    awk '
        /<\/activity>/ && !found {
            print "            <!-- Intent filter for USB device attach -->"
            print "            <intent-filter>"
            print "                <action android:name=\"android.hardware.usb.action.USB_DEVICE_ATTACHED\" />"
            print "            </intent-filter>"
            print ""
            print "            <!-- USB device filter metadata -->"
            print "            <meta-data"
            print "                android:name=\"android.hardware.usb.action.USB_DEVICE_ATTACHED\""
            print "                android:resource=\"@xml/device_filter\" />"
            found=1
        }
        { print }
    ' "$MANIFEST_PATH" > "$MANIFEST_PATH.tmp" && mv "$MANIFEST_PATH.tmp" "$MANIFEST_PATH"
    echo "Added USB intent filter to manifest"
fi

echo "✓ Android manifest patched successfully!"