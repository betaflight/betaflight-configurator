# Quick Start Guide - Custom Betaflight Serial Plugin

## Installation & Setup

### 1. Install Dependencies

```bash
# Navigate to your configurator directory
cd betaflight-configurator

# Install the custom plugin (local package)
yarn install

# Sync Capacitor configuration
npx cap sync android
```

### 2. Build Android App

```bash
# Development build with live reload
yarn android:dev

# Standard build
yarn android:run

# Release build
yarn android:release
```

## File Changes Summary

### New Files Created

```
android/app/src/main/java/betaflight/configurator/protocols/serial/
├── BetaflightSerialPlugin.java                     # Native implementation
└── UsbPermissionReceiver.java                      # Permission callback bridge

src/js/protocols/CapacitorSerial.js                 # Protocol adapter

android/app/src/main/res/xml/device_filter.xml      # USB device filters

CAPACITOR_SERIAL_IMPLEMENTATION.md                  # Full documentation
QUICK_START.md                                      # This file
```

### Modified Files

```
package.json                                        # Added Android build scripts & deps
src/js/serial.js                                    # Added CapacitorSerial protocol
src/js/port_handler.js                              # Added Capacitor support
src/js/utils/checkBrowserCompatibility.js           # Added Capacitor check
android/app/src/main/AndroidManifest.xml            # Added USB permissions
android/app/src/main/java/betaflight/configurator/MainActivity.java  # Registers plugin
```

## Testing on Android Device

### Prerequisites

- Android device with USB OTG support
- USB OTG cable/adapter
- Betaflight flight controller
- USB cable to connect FC to OTG adapter

### Setup

1. Enable Developer Options on Android:
   - Go to Settings → About Phone
   - Tap "Build Number" 7 times

2. Enable USB Debugging:
   - Settings → Developer Options → USB Debugging

3. Connect device to computer via USB

### Run the App

```bash
# This will build and deploy to connected device
yarn android:run
```

### Test Connection

1. Launch Betaflight Configurator on Android device
2. Connect USB OTG adapter with flight controller
3. You should see a notification about USB device
4. Tap the notification or open the app
5. Grant USB permission when prompted
6. Select the Capacitor Serial device from the port list
7. Click Connect

### Expected Behavior

- ✅ USB device appears automatically when connected
- ✅ Permission dialog shows when accessing device
- ✅ Device appears in port dropdown with "Betaflight" prefix
- ✅ Connection establishes at 115200 baud
- ✅ MSP communication works (configuration loads, etc.)
- ✅ Can read/write settings
- ✅ Real-time sensor data displays

### Debug Logging

View logs with adb:

```bash
# All logs
adb logcat

# Filter for our plugin
adb logcat | grep BetaflightSerial

# Filter for Capacitor
adb logcat | grep Capacitor

# Filter for USB
adb logcat | grep -i usb
```

## Common Issues & Solutions

### Issue: "Plugin not registered"

**Solution**: Run `npx cap sync android` again

### Issue: Device not detected

**Solution**: 
1. Check `device_filter.xml` includes your device's VID/PID
2. Physically disconnect/reconnect USB device
3. Check logs: `adb logcat | grep USB`

### Issue: Permission dialog doesn't appear

**Solution**:
1. Go to Android Settings → Apps → Betaflight
2. Clear data and cache
3. Uninstall and reinstall app
4. Try again

### Issue: Connection fails

**Solution**:
1. Check USB cable is data cable (not just power)
2. Try different baud rate
3. Check flight controller is powered
4. Look for errors in logcat

### Issue: Build errors

**Solution**:
```bash
# Clean everything
cd android
./gradlew clean
cd ..

# Remove and re-sync
rm -rf node_modules
rm -rf android/app/build
yarn install
npx cap sync android
```

## Project Structure

```
betaflight-configurator/
├── android/
│   └── app/
│       └── src/main/
│           ├── AndroidManifest.xml        # Modified
│           ├── java/
│           │   ├── betaflight/configurator/MainActivity.java
│           │   └── betaflight/configurator/protocols/serial/
│           │       ├── BetaflightSerialPlugin.java
│           │       └── UsbPermissionReceiver.java
│           └── res/xml/device_filter.xml  # NEW
│
├── src/js/
│   ├── serial.js                          # Serial system (modified)
│   ├── port_handler.js                    # Port management (modified)
│   └── protocols/
│       ├── WebSerial.js                   # Desktop Chrome
│       ├── WebBluetooth.js                # Bluetooth
│       ├── CapacitorSerial.js             # Android USB (NEW)
│       └── ...
│
└── documentation/
   ├── CAPACITOR_SERIAL_IMPLEMENTATION.md
   └── QUICK_START.md
```

## Development Workflow

### Making Changes to Native Code

1. Edit files under `android/app/src/main/java/betaflight/configurator/protocols/serial/`
2. Run `npx cap sync android`
3. Rebuild app: `yarn android:run`

### Making Changes to Protocol Adapter

1. Edit `src/js/protocols/CapacitorSerial.js`
2. Build configurator: `yarn build`
3. Sync: `npx cap sync android`
4. Run: `yarn android:run`

## Comparison with PR #4698

### What's Different

| Aspect | PR #4698 | This Implementation |
|--------|----------|---------------------|
| Plugin | capacitor-plugin-usb-serial (external) | Embedded BetaflightSerial plugin (app module) |
| Patches | Required (patch-package) | None needed |
| Permissions | Problematic | Native Android handling |
| Protocol | NMEA (text lines) | Binary (hex strings) |
| Maintenance | Depends on external package | Full control |

### What's the Same

- Uses Capacitor framework
- Android USB OTG support
- Integrates with existing protocol system
- Same user experience
- Compatible with desktop Web Serial

## Next Steps

1. **Test thoroughly** - Try different devices, cables, flight controllers
2. **Gather feedback** - Android user testing
3. **Optimize** - Performance tuning if needed
4. **Document** - User guide for Android version
5. **Release** - Beta release for wider testing

## Support

For issues or questions:

1. Check logs: `adb logcat | grep BetaflightSerial`
2. Review documentation: `CAPACITOR_SERIAL_IMPLEMENTATION.md`
3. Review native source: `android/app/src/main/java/betaflight/configurator/protocols/serial`
4. Create GitHub issue with:
   - Android version
   - Device model
   - USB device VID/PID
   - Relevant logs

---

**Ready to test!** 🚀

Connect your Android device and run:
```bash
yarn android:run
```
