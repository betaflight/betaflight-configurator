# capacitor-plugin-betaflight-serial

Custom Capacitor USB Serial plugin for Betaflight Configurator

## Features

- ✅ **Native USB Serial Support** - Direct USB communication on Android devices
- ✅ **Binary Protocol Support** - Hex string encoding/decoding for MSP protocol
- ✅ **Automatic Permission Handling** - Streamlined USB device permission workflow
- ✅ **Multiple Chipset Support** - FTDI, CP210x, CH34x, PL2303, CDC-ACM, and more
- ✅ **Real-time Data Events** - Event listeners for received data
- ✅ **Device Detection** - Automatic USB device attach/detach events
- ✅ **Zero Patches Required** - No need for patch-package workarounds

## Installation

```bash
npm install ../capacitor-plugin-betaflight-serial
npx cap sync
```

## Android Setup

### 1. Add the plugin to your app's build.gradle

The plugin should be automatically included when you run `npx cap sync`.

### 2. Update AndroidManifest.xml

Add USB permissions and intent filters to your `android/app/src/main/AndroidManifest.xml`:

```xml
<manifest>
    <application>
        <activity>
            <!-- Add intent filter for USB device attached -->
            <intent-filter>
                <action android:name="android.hardware.usb.action.USB_DEVICE_ATTACHED" />
            </intent-filter>

            <!-- Add device filter resource -->
            <meta-data
                android:name="android.hardware.usb.action.USB_DEVICE_ATTACHED"
                android:resource="@xml/device_filter" />
        </activity>
    </application>

    <!-- USB Host feature -->
    <uses-feature android:name="android.hardware.usb.host" android:required="true" />
</manifest>
```

### 3. Create device filter XML

Create `android/app/src/main/res/xml/device_filter.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- USB device filters for Betaflight-compatible devices -->
    
    <!-- FT232R USB UART -->
    <usb-device vendor-id="1027" product-id="24577" />
    
    <!-- STM32 devices -->
    <usb-device vendor-id="1155" product-id="12886" />
    <usb-device vendor-id="1155" product-id="14158" />
    <usb-device vendor-id="1155" product-id="22336" />
    <usb-device vendor-id="1155" product-id="57105" />
    
    <!-- CP210x devices -->
    <usb-device vendor-id="4292" product-id="60000" />
    <usb-device vendor-id="4292" product-id="60001" />
    <usb-device vendor-id="4292" product-id="60002" />
    
    <!-- GD32 devices -->
    <usb-device vendor-id="10473" product-id="394" />
    <usb-device vendor-id="10473" product-id="393" />
    
    <!-- AT32 devices -->
    <usb-device vendor-id="11836" product-id="22336" />
    <usb-device vendor-id="11836" product-id="57105" />
    
    <!-- APM32 devices -->
    <usb-device vendor-id="12619" product-id="22336" />
    <usb-device vendor-id="12619" product-id="262" />
    
    <!-- Raspberry Pi Pico devices -->
    <usb-device vendor-id="11914" product-id="9" />
    <usb-device vendor-id="11914" product-id="15" />
</resources>
```

## API Usage

```typescript
import { BetaflightSerial } from 'capacitor-plugin-betaflight-serial';

// Request permission and get available devices
const { devices } = await BetaflightSerial.requestPermission();
console.log('Available devices:', devices);

// Connect to a device
await BetaflightSerial.connect({
  deviceId: devices[0].deviceId,
  baudRate: 115200
});

// Listen for received data
BetaflightSerial.addListener('dataReceived', (event) => {
  console.log('Received hex data:', event.data);
  // Convert hex string to bytes for processing
  const bytes = hexStringToBytes(event.data);
});

// Write data (as hex string)
const hexData = '24580000fb'; // MSP request example
await BetaflightSerial.write({ data: hexData });

// Disconnect
await BetaflightSerial.disconnect();
```

## API Reference

### requestPermission()

Request USB permission and get list of available devices.

**Returns:** `Promise<{ devices: SerialDevice[] }>`

### getDevices()

Get list of devices that have been granted permission.

**Returns:** `Promise<{ devices: SerialDevice[] }>`

### connect(options)

Connect to a serial device.

**Parameters:**
- `deviceId: string` - Device ID from getDevices()
- `baudRate?: number` - Baud rate (default: 115200)
- `dataBits?: number` - Data bits: 5, 6, 7, or 8 (default: 8)
- `stopBits?: number` - Stop bits: 1 or 2 (default: 1)
- `parity?: string` - Parity: 'none', 'even', 'odd', 'mark', 'space' (default: 'none')

**Returns:** `Promise<{ success: boolean, error?: string }>`

### disconnect()

Disconnect from the current device.

**Returns:** `Promise<{ success: boolean }>`

### write(options)

Write data to the serial port.

**Parameters:**
- `data: string` - Hex string to write (e.g., "24580000fb")

**Returns:** `Promise<{ bytesSent: number }>`

### read()

Read available data from the serial port.

**Returns:** `Promise<{ data: string }>` - Hex string of received data

### Events

#### dataReceived

Emitted when data is received from the serial port.

```typescript
BetaflightSerial.addListener('dataReceived', (event: { data: string }) => {
  console.log('Received:', event.data);
});
```

#### deviceAttached

Emitted when a USB device is attached.

```typescript
BetaflightSerial.addListener('deviceAttached', (device: SerialDevice) => {
  console.log('Device attached:', device);
});
```

#### deviceDetached

Emitted when a USB device is detached.

```typescript
BetaflightSerial.addListener('deviceDetached', (device: SerialDevice) => {
  console.log('Device detached:', device);
});
```

## SerialDevice Interface

```typescript
interface SerialDevice {
  deviceId: string;           // Unique device identifier
  vendorId: number;           // USB Vendor ID
  productId: number;          // USB Product ID
  deviceName?: string;        // Device name
  manufacturer?: string;      // Manufacturer name
  product?: string;           // Product name
  deviceClass?: number;       // Device class code
  deviceSubclass?: number;    // Device subclass code
}
```

## Supported USB Chipsets

The plugin uses [usb-serial-for-android](https://github.com/mik3y/usb-serial-for-android) library and supports:

- **CDC-ACM** - Communication Device Class Abstract Control Model
- **CP210x** - Silicon Labs CP2102, CP2105, etc.
- **FTDI** - FT232, FT2232, FT4232, etc.
- **PL2303** - Prolific PL2303
- **CH34x** - WCH CH340, CH341
- **STM32** - ST Microelectronics VCP
- And many more...

## Differences from capacitor-plugin-usb-serial

This custom plugin was created specifically for Betaflight to address several issues:

1. **Proper Permission Handling** - Native Android permission dialogs work correctly
2. **Binary Protocol Support** - Built-in hex string encoding/decoding for MSP
3. **No Patches Required** - Clean implementation without patch-package
4. **Better Device Detection** - Automatic attach/detach events
5. **Simplified API** - Designed specifically for Betaflight's use case

## License

GPL-3.0 - Same as Betaflight Configurator

## Credits

- Uses [usb-serial-for-android](https://github.com/mik3y/usb-serial-for-android) by Mike Wakerly
- Created for the Betaflight project
