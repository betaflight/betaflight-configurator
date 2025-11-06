#!/bin/bash
# Script to create USB device filter XML for Betaflight-compatible devices
# This should be run after 'cargo tauri android init' or 'cargo tauri android build'

set -e

DEVICE_FILTER_PATH="src-tauri/gen/android/app/src/main/res/xml/device_filter.xml"

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

echo "✓ USB device filter created successfully!"