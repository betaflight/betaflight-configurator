# Debugging Android USB Serial Issues

## The Challenge
Android tablets typically have only one USB port, which creates a problem:
- We need USB for the **flight controller** (to test serial communication)
- We need USB for **ADB debugging** (to see console logs)

## Solution: ADB over WiFi

Use **wireless ADB** so the USB port is free for the flight controller!

### Quick Start

Run the helper script:
```bash
./scripts/setup-adb-wifi.sh
```

Or follow the manual steps below:

---

## Method 1: Wireless Debugging (Android 11+) ⭐ Recommended

### Setup (One-time):

**On Android Tablet:**
1. Settings → Developer Options
2. Enable **Wireless debugging**
3. Tap **Wireless debugging**
4. Tap **Pair device with pairing code**
5. Note down:
   - IP address (e.g., `192.168.1.100`)
   - Pairing port (e.g., `:37891`)
   - Pairing code (e.g., `123456`)

**On Your PC:**
```bash
# Pair the device (one-time, use the pairing port)
adb pair 192.168.1.100:37891
# Enter pairing code: 123456

# Connect using the wireless debugging port (different from pairing port!)
adb connect 192.168.1.100:38281

# Verify
adb devices
```

### Reconnecting Later:
```bash
adb connect 192.168.1.100:38281
```

---

## Method 2: ADB over TCP/IP (Any Android)

### Setup (Requires USB initially):

1. **Connect tablet via USB** temporarily
2. Enable TCP/IP mode:
   ```bash
   adb tcpip 5555
   ```

3. Get tablet's WiFi IP:
   ```bash
   adb shell ip addr show wlan0 | grep inet
   # Or check on tablet: Settings → About → Status → IP address
   ```

4. **Disconnect USB cable**
5. Connect over network:
   ```bash
   adb connect <TABLET_IP>:5555
   # Example: adb connect 192.168.1.100:5555
   ```

6. Verify connection:
   ```bash
   adb devices
   ```

### Reconnecting After Reboot:
You'll need to repeat steps 1-3 with USB cable, then disconnect.

---

## Viewing Console Logs

Once ADB is connected wirelessly:

### Chrome DevTools (Best for debugging web/Tauri apps):
1. Open Chrome on your PC
2. Navigate to: `chrome://inspect`
3. Your tablet should appear under "Remote Target"
4. Find **Betaflight Configurator** app
5. Click **inspect**
6. You'll see the full Chrome DevTools with console logs!

### Logcat (For system-level debugging):
```bash
# All logs
adb logcat

# Filter for USB and serial events
adb logcat | grep -i "usb\|serial"

# Filter for Betaflight app
adb logcat | grep -i betaflight

# Clear logs and start fresh
adb logcat -c
adb logcat
```

---

## Debugging USB Serial Enumeration

### Expected Console Logs

When you connect a flight controller, you should see:

```javascript
[TauriSerial] === DEBUG: All detected ports BEFORE filtering ===
[TauriSerial] Raw portsMap from plugin: {...}
[TauriSerial] Total ports detected: 1
[TauriSerial]   [0] path: /dev/bus/usb/001/002, VID: 1155, PID: 22336, displayName: Betaflight STM Electronics
[TauriSerial] === DEBUG: After filtering ===
[TauriSerial] Found 1 serial ports (filtered from 1)
```

### Common Scenarios

**Scenario A: No ports detected** (`Total ports detected: 0`)
```
[TauriSerial] Total ports detected: 0
```
**Cause:** Android doesn't have USB permission or driver not loaded  
**Fix:** Check if permission dialog appeared; may need to add runtime permission request

**Scenario B: Ports detected but no VID/PID**
```
[TauriSerial]   [0] path: /dev/ttyUSB0, VID: undefined, PID: undefined
[TauriSerial]   FILTERED OUT (no VID/PID): /dev/ttyUSB0
```
**Cause:** USB serial driver not providing device info  
**Fix:** May need different Android serial library or permissions

**Scenario C: Unknown VID/PID**
```
[TauriSerial]   [0] path: /dev/bus/usb/001/002, VID: 9999, PID: 8888
[TauriSerial]   FILTERED OUT (unknown device): /dev/bus/usb/001/002 VID:9999 PID:8888
```
**Cause:** Flight controller uses VID/PID not in our known devices list  
**Fix:** Add the VID/PID to `src/js/protocols/devices.js`

---

## Checking Android USB Permissions

### Verify USB permissions in manifest:
```bash
# On PC, check what's in the installed APK
adb shell dumpsys package com.betaflight.configurator | grep permission
```

### Check USB device info:
```bash
# List USB devices Android can see
adb shell ls -l /dev/bus/usb/*/*

# Get USB device details (requires root or USB debugging)
adb shell lsusb
```

### Monitor USB attach/detach:
```bash
# Watch for USB events in real-time
adb logcat -s UsbDeviceManager UsbHostManager UsbService
```

---

## Troubleshooting

### ADB connection drops
```bash
# Reconnect
adb connect <IP>:5555

# Kill and restart ADB server
adb kill-server
adb start-server
adb connect <IP>:5555
```

### Can't find device in chrome://inspect
1. Ensure ADB is connected: `adb devices`
2. Enable **USB debugging** on tablet (even for WiFi debugging)
3. Restart Chrome
4. Check Chrome flags: `chrome://flags` → Enable "Discover USB devices"

### Different networks issue
If your PC and tablet are on different networks, you need:
1. **VPN** connecting both networks, OR
2. **Port forwarding** on router, OR
3. **Mobile hotspot** from tablet, connect PC to it

---

## After Setup

Once ADB is working wirelessly:

1. ✅ **Connect flight controller** to tablet's USB port
2. ✅ **Open Betaflight app** on tablet
3. ✅ **Open Chrome DevTools** on PC (`chrome://inspect`)
4. ✅ **Check console logs** for USB enumeration debug output
5. ✅ **Report findings** so we can fix the root cause!

---

## Quick Commands Reference

```bash
# Check connection status
adb devices

# Reconnect
adb connect <IP>:5555

# View live logs
adb logcat

# Clear logs
adb logcat -c

# USB-specific logs
adb logcat | grep -i usb

# Install APK
adb install -r path/to/app.apk

# Chrome DevTools
# Open: chrome://inspect
```
