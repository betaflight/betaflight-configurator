#!/bin/bash
# Script to patch the Android manifest with USB permissions after generation
# This should be run after 'cargo tauri android init' or 'cargo tauri android build'

set -e

MANIFEST_PATH="src-tauri/gen/android/app/src/main/AndroidManifest.xml"
DEVICE_FILTER_PATH="src-tauri/gen/android/app/src/main/res/xml/device_filter.xml"
APP_BUILD_GRADLE="src-tauri/gen/android/app/build.gradle.kts"
MAINACTIVITY_PATH="src-tauri/gen/android/app/src/main/java/com/betaflight/configurator/MainActivity.kt"

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

# Create device filter XML
echo "Creating USB device filter..."
mkdir -p "$(dirname "$DEVICE_FILTER_PATH")"
cat > "$DEVICE_FILTER_PATH" << 'EOF'
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- USB device filters for Betaflight-compatible devices -->
    
    <!-- FT232R USB UART -->
    <usb-device vendor-id="1027" product-id="24577" />
    
    <!-- STM32 devices -->
    <usb-device vendor-id="1155" product-id="12886" />  <!-- STM32 in HID mode -->
    <usb-device vendor-id="1155" product-id="14158" />  <!-- STLink Virtual COM Port (NUCLEO boards) -->
    <usb-device vendor-id="1155" product-id="22336" />  <!-- STM Electronics Virtual COM Port -->
    <usb-device vendor-id="1155" product-id="57105" />  <!-- STM Device in DFU Mode -->
    
    <!-- CP210x devices -->
    <usb-device vendor-id="4292" product-id="60000" />
    <usb-device vendor-id="4292" product-id="60001" />
    <usb-device vendor-id="4292" product-id="60002" />
    
    <!-- GD32 devices -->
    <usb-device vendor-id="10473" product-id="394" />   <!-- GD32 VCP -->
    <usb-device vendor-id="10473" product-id="393" />   <!-- GD32 DFU Bootloader -->
    
    <!-- AT32 devices -->
    <usb-device vendor-id="11836" product-id="22336" /> <!-- AT32 VCP -->
    <usb-device vendor-id="11836" product-id="57105" /> <!-- AT32F435 DFU Bootloader -->
    
    <!-- APM32 devices -->
    <usb-device vendor-id="12619" product-id="22336" /> <!-- APM32 VCP -->
    <usb-device vendor-id="12619" product-id="262" />   <!-- APM32 DFU Bootloader -->
    
    <!-- Raspberry Pi Pico devices -->
    <usb-device vendor-id="11914" product-id="9" />     <!-- Raspberry Pi Pico VCP -->
    <usb-device vendor-id="11914" product-id="15" />    <!-- Raspberry Pi Pico in Bootloader mode -->
</resources>
EOF

echo "✓ Android manifest patched successfully!"
echo "✓ USB device filter created successfully!"

# Copy custom MainActivity with USB permission handling
if [ -f "scripts/MainActivity.kt" ]; then
    echo "Installing custom MainActivity with USB permission handling..."
    mkdir -p "$(dirname "$MAINACTIVITY_PATH")"
    cp "scripts/MainActivity.kt" "$MAINACTIVITY_PATH"
    echo "✓ MainActivity installed successfully!"
else
    echo "Warning: scripts/MainActivity.kt not found, skipping MainActivity installation"
fi

# Add USB serial library dependency to app build.gradle.kts
if [ -f "$APP_BUILD_GRADLE" ]; then
    echo "Adding USB serial library dependency..."
    if ! grep -q "usb-serial-for-android" "$APP_BUILD_GRADLE"; then
        # Check if dependencies block exists
        if grep -q "^dependencies {" "$APP_BUILD_GRADLE"; then
            echo "Inserting into existing dependencies block..."
            # Use awk to insert after the dependencies { line (portable)
            awk '/^dependencies \{/ {
                print
                print "    // USB Serial library for Android"
                print "    implementation(\"com.github.mik3y:usb-serial-for-android:3.9.0\")"
                next
            }
            { print }' "$APP_BUILD_GRADLE" > "$APP_BUILD_GRADLE.tmp" && mv "$APP_BUILD_GRADLE.tmp" "$APP_BUILD_GRADLE"
            echo "✓ USB serial library dependency added!"
        else
            echo "No dependencies block found, appending new block..."
            cat >> "$APP_BUILD_GRADLE" << 'EOF'

dependencies {
    // USB Serial library for Android
    implementation("com.github.mik3y:usb-serial-for-android:3.9.0")
}
EOF
            echo "✓ USB serial library dependency added!"
        fi
    else
        echo "USB serial library dependency already present"
    fi
else
    echo "Warning: $APP_BUILD_GRADLE not found, skipping dependency addition"
fi

echo ""
echo "✓ Android USB support configuration complete!"
echo "You can now build the Android app with: cargo tauri android build"

# Add JitPack repository to settings.gradle.kts
SETTINGS_GRADLE="src-tauri/gen/android/settings.gradle.kts"
if [ -f "$SETTINGS_GRADLE" ]; then
    echo "Adding JitPack repository to $SETTINGS_GRADLE..."
    if ! grep -q "jitpack.io" "$SETTINGS_GRADLE"; then
        # Use awk to insert maven repository into existing repositories block
        awk '
            /repositories \{/ && !found {
                print
                print "        maven { url = uri(\"https://jitpack.io\") }"
                found=1
                next
            }
            { print }
        ' "$SETTINGS_GRADLE" > "$SETTINGS_GRADLE.tmp" && mv "$SETTINGS_GRADLE.tmp" "$SETTINGS_GRADLE"
        echo "✓ JitPack repository added to settings.gradle.kts!"
    else
        echo "JitPack repository already present in settings.gradle.kts"
    fi
else
    echo "Warning: $SETTINGS_GRADLE not found, skipping JitPack repository addition"
fi
