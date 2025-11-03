#!/bin/bash
set -e

echo "🔍 Scanning for Android devices..."
adb start-server >/dev/null

# Helper: filters out emulators & offline devices
get_real_device() {
  adb devices | grep -v "List" | grep -v "emulator" | grep -v "offline" | awk '{print $1}'
}

# 1️⃣ Try to find a connected Wi-Fi device (IP:PORT or name)
WIFI_DEVICE=$(get_real_device | grep -E '([0-9]{1,3}\.){3}[0-9]{1,3}:[0-9]+|^[a-zA-Z0-9_-]+$' | head -n 1)

# 2️⃣ If not found, check for paired devices advertised via mDNS
if [ -z "$WIFI_DEVICE" ]; then
  echo "📡 No active Wi-Fi device found, checking mDNS..."
  MDNS_DEVICE=$(adb mdns services 2>/dev/null | grep "_adb-tls-connect._tcp" | awk '{print $1}' | head -n 1)
  if [ -n "$MDNS_DEVICE" ]; then
    echo "🌐 Found paired device via mDNS: $MDNS_DEVICE"
    echo "🔗 Attempting to connect..."
    adb connect "$MDNS_DEVICE" >/dev/null 2>&1 || true
    sleep 2
    WIFI_DEVICE=$(get_real_device | head -n 1)
  fi
fi

# 3️⃣ If still none, check for USB device as fallback
if [ -z "$WIFI_DEVICE" ]; then
  USB_DEVICE=$(get_real_device | head -n 1)
  if [ -n "$USB_DEVICE" ]; then
    echo "🔌 Found USB device: $USB_DEVICE"
    echo "📡 Enabling TCP/IP mode for next time..."
    adb -s "$USB_DEVICE" tcpip 5555 || true
    WIFI_DEVICE="$USB_DEVICE"
  fi
fi

# 4️⃣ If we still didn’t find any valid device, exit
if [ -z "$WIFI_DEVICE" ]; then
  echo "❌ No physical Android device connected via Wi-Fi or USB."
  echo "💡 Tip: Enable 'Wireless debugging' in Developer Options and ensure it’s paired."
  echo "💡 If you actually want to use an emulator, just run:"
  echo "   cargo tauri android dev"
  exit 1
fi

# 5️⃣ Success — show the device and run Tauri
echo "✅ Using device: $WIFI_DEVICE"
echo "🚀 Running Tauri Android Dev (physical device only)..."
cargo tauri android dev -- --device "$WIFI_DEVICE"
