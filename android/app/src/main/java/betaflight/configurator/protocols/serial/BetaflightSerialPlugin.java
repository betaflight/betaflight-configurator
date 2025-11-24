package betaflight.configurator.protocols.serial;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.hoho.android.usbserial.driver.UsbSerialDriver;
import com.hoho.android.usbserial.driver.UsbSerialPort;
import com.hoho.android.usbserial.driver.UsbSerialProber;
import com.hoho.android.usbserial.util.SerialInputOutputManager;

import org.json.JSONException;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Capacitor plugin for USB Serial communication
 * Designed specifically for Betaflight Configurator with binary protocol support (MSP)
 * 
 * Features:
 * - Automatic USB device permission handling
 * - Support for multiple USB-to-serial chipsets (FTDI, CP210x, CH34x, PL2303, etc.)
 * - Binary data transmission using hex string encoding
 * - Real-time data reception via event listeners
 * - Device attach/detach detection
 */
@CapacitorPlugin(
    name = "BetaflightSerial",
    permissions = {
        @Permission(strings = {}, alias = "usb")
    }
)
public class BetaflightSerialPlugin extends Plugin implements SerialInputOutputManager.Listener {
    // Hold a static reference for forwarding permission callbacks from an explicit BroadcastReceiver
    private static java.lang.ref.WeakReference<BetaflightSerialPlugin> sInstance = new java.lang.ref.WeakReference<>(null);
    private static final String TAG = "BetaflightSerial";
    private static final String ACTION_USB_PERMISSION = "com.betaflight.USB_PERMISSION";
    private static final int WRITE_WAIT_MILLIS = 2000;
    private static final int READ_WAIT_MILLIS = 2000;

    private UsbManager usbManager;
    private UsbSerialPort serialPort;
    private UsbSerialDriver currentDriver;
    private UsbDeviceConnection connection;
    private SerialInputOutputManager ioManager;
    
    private final Map<String, UsbDevice> permissionRequestedDevices = new HashMap<>();
    private PluginCall pendingPermissionCall;

    private final BroadcastReceiver usbReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            
            if (ACTION_USB_PERMISSION.equals(action)) {
                handlePermissionResult(intent);
            } else if (UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(action)) {
                handleDeviceAttached(intent);
            } else if (UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)) {
                handleDeviceDetached(intent);
            }
        }
    };

    @Override
    public void load() {
        super.load();
        sInstance = new java.lang.ref.WeakReference<>(this);
        usbManager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
        
        // Register USB broadcast receivers
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_USB_PERMISSION);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(usbReceiver, filter);
        }
        
        Log.d(TAG, "BetaflightSerial plugin loaded");
    }

    @Override
    protected void handleOnDestroy() {
        try {
            closeSerialPort();
            getContext().unregisterReceiver(usbReceiver);
        } catch (Exception e) {
            Log.e(TAG, "Error in handleOnDestroy", e);
        }
        super.handleOnDestroy();
    }

    /**
     * Request permission to access USB devices
     * Shows permission dialog for each device that needs permission
     */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        try {
            if (pendingPermissionCall != null) {
                call.reject("Another permission request is already in progress");
                return;
            }

            List<UsbSerialDriver> availableDrivers = UsbSerialProber.getDefaultProber().findAllDrivers(usbManager);
            
            if (availableDrivers.isEmpty()) {
                JSObject result = new JSObject();
                result.put("devices", new JSArray());
                call.resolve(result);
                return;
            }

            List<UsbDevice> devicesNeedingPermission = new ArrayList<>();
            for (UsbSerialDriver driver : availableDrivers) {
                UsbDevice device = driver.getDevice();
                if (!usbManager.hasPermission(device)) {
                    devicesNeedingPermission.add(device);
                }
            }

            if (devicesNeedingPermission.isEmpty()) {
                resolveWithDeviceList(call);
                return;
            }

            pendingPermissionCall = call;
            permissionRequestedDevices.clear();

            for (UsbDevice device : devicesNeedingPermission) {
                String deviceKey = getDeviceKey(device);
                permissionRequestedDevices.put(deviceKey, device);

                // Create fully explicit broadcast intent with component
                Intent permissionAction = new Intent(ACTION_USB_PERMISSION);
                permissionAction.setComponent(new android.content.ComponentName(
                    getContext(),
                    UsbPermissionReceiver.class
                ));
                permissionAction.putExtra(UsbManager.EXTRA_DEVICE, device);

                int requestCode = device.getDeviceId();
                int flags;

                if (Build.VERSION.SDK_INT >= 34) { // Android 14+ (U / API 34)
                    // Android 14+ requires IMMUTABLE for explicit intents
                    flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    // Android 12-13 requires MUTABLE for UsbManager
                    flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE;
                } else {
                    flags = PendingIntent.FLAG_UPDATE_CURRENT;
                }

                PendingIntent permissionIntent = PendingIntent.getBroadcast(
                    getContext(),
                    requestCode,
                    permissionAction,
                    flags
                );

                usbManager.requestPermission(device, permissionIntent);
                Log.d(TAG, "Requested permission for device: " + deviceKey);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error requesting permission", e);
            pendingPermissionCall = null;
            permissionRequestedDevices.clear();
            call.reject("Failed to request permission: " + e.getMessage());
        }
    }

    /**
     * Get list of USB devices that have been granted permission
     */
    @PluginMethod
    public void getDevices(PluginCall call) {
        resolveWithDeviceList(call);
    }

    /**
     * Connect to a USB serial device
     */
    @PluginMethod
    public void connect(PluginCall call) {
        try {
            String deviceId = call.getString("deviceId");
            if (deviceId == null) {
                call.reject("deviceId is required");
                return;
            }

            int baudRate = call.getInt("baudRate", 115200);
            int dataBits = call.getInt("dataBits", 8);
            int stopBits = call.getInt("stopBits", UsbSerialPort.STOPBITS_1);
            int parity = parseParity(call.getString("parity", "none"));

            // Close existing connection if any
            closeSerialPort();

            // Find the device
            List<UsbSerialDriver> availableDrivers = UsbSerialProber.getDefaultProber().findAllDrivers(usbManager);
            UsbSerialDriver targetDriver = null;

            for (UsbSerialDriver driver : availableDrivers) {
                UsbDevice device = driver.getDevice();
                if (getDeviceKey(device).equals(deviceId)) {
                    if (!usbManager.hasPermission(device)) {
                        call.reject("Permission not granted for device: " + deviceId);
                        return;
                    }
                    targetDriver = driver;
                    break;
                }
            }

            if (targetDriver == null) {
                call.reject("Device not found: " + deviceId);
                return;
            }

            // Open connection
            connection = usbManager.openDevice(targetDriver.getDevice());
            if (connection == null) {
                call.reject("Failed to open device connection");
                return;
            }

            // Get the first port (most devices have only one port)
            List<UsbSerialPort> ports = targetDriver.getPorts();
            if (ports.isEmpty()) {
                call.reject("No serial ports available on device: " + deviceId);
                return;
            }
            serialPort = ports.get(0);
            serialPort.open(connection);
            serialPort.setParameters(baudRate, dataBits, stopBits, parity);

            // Start I/O manager for reading data
            ioManager = new SerialInputOutputManager(serialPort, this);
            ioManager.start();

            currentDriver = targetDriver;

            Log.d(TAG, "Connected to device: " + deviceId + " at " + baudRate + " baud");

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);

        } catch (IOException e) {
            Log.e(TAG, "Error connecting to device", e);
            closeSerialPort();
            JSObject result = new JSObject();
            result.put("success", false);
            result.put("error", e.getMessage());
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Unexpected error connecting", e);
            call.reject("Failed to connect: " + e.getMessage());
        }
    }

    /**
     * Disconnect from the current serial device
     */
    @PluginMethod
    public void disconnect(PluginCall call) {
        closeSerialPort();
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    /**
     * Write data to the serial port
     * Data is provided as a hex string and converted to bytes
     */
    @PluginMethod
    public void write(PluginCall call) {
        try {
            String hexData = call.getString("data");
            if (hexData == null || hexData.isEmpty()) {
                // Treat empty payload as no-op for robustness
                JSObject result = new JSObject();
                result.put("bytesSent", 0);
                call.resolve(result);
                return;
            }

            if (serialPort == null || !serialPort.isOpen()) {
                call.reject("Serial port is not open");
                return;
            }

            // Convert hex string to bytes
            byte[] data = hexStringToByteArray(hexData);
            
            // Write data to serial port
            serialPort.write(data, WRITE_WAIT_MILLIS);

            JSObject result = new JSObject();
            result.put("bytesSent", data.length);
            call.resolve(result);

        } catch (IOException e) {
            Log.e(TAG, "Error writing to serial port", e);
            call.reject("Failed to write data: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Unexpected error writing", e);
            call.reject("Failed to write data: " + e.getMessage());
        }
    }

    /**
     * Read available data from the serial port
     * Returns data as a hex string
     */
    @PluginMethod
    public void read(PluginCall call) {
        try {
            if (serialPort == null || !serialPort.isOpen()) {
                call.reject("Serial port is not open");
                return;
            }

            byte[] buffer = new byte[8192];
            int numBytes = serialPort.read(buffer, READ_WAIT_MILLIS);
            
            String hexData = "";
            if (numBytes > 0) {
                byte[] data = new byte[numBytes];
                System.arraycopy(buffer, 0, data, 0, numBytes);
                hexData = byteArrayToHexString(data);
            }

            JSObject result = new JSObject();
            result.put("data", hexData);
            call.resolve(result);

        } catch (IOException e) {
            Log.e(TAG, "Error reading from serial port", e);
            call.reject("Failed to read data: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Unexpected error reading", e);
            call.reject("Failed to read data: " + e.getMessage());
        }
    }

    // ===== SerialInputOutputManager.Listener implementation =====

    @Override
    public void onNewData(byte[] data) {
        // Convert received data to hex string and notify listeners
        String hexData = byteArrayToHexString(data);
        
        JSObject eventData = new JSObject();
        eventData.put("data", hexData);
        notifyListeners("dataReceived", eventData);
    }

    @Override
    public void onRunError(Exception e) {
        Log.e(TAG, "Serial communication error", e);
        closeSerialPort();
    }

    // ===== Private helper methods =====

    public void handlePermissionResult(Intent intent) {
        UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
        if (device == null) return;

        String deviceKey = getDeviceKey(device);
        boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);

        Log.d(TAG, "Permission " + (granted ? "granted" : "denied") + " for device: " + deviceKey);

        permissionRequestedDevices.remove(deviceKey);

        // If all permissions have been processed, resolve the call
        if (permissionRequestedDevices.isEmpty() && pendingPermissionCall != null) {
            resolveWithDeviceList(pendingPermissionCall);
            pendingPermissionCall = null;
        }
    }

    // Static entry point for the explicit BroadcastReceiver to forward the permission result
    public static void onUsbPermissionResult(Context context, Intent intent) {
        BetaflightSerialPlugin instance = sInstance.get();
        if (instance != null) {
            instance.handlePermissionResult(intent);
        }
    }

    private void handleDeviceAttached(Intent intent) {
        UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
        if (device == null) return;

        Log.d(TAG, "USB device attached: " + getDeviceKey(device));

        // Only notify about devices that have permission
        // This prevents auto-selection of unpermitted devices that show the "Open with" dialog
        if (!usbManager.hasPermission(device)) {
            Log.d(TAG, "Device attached but no permission yet, skipping notification");
            return;
        }

        try {
            JSObject deviceInfo = createDeviceInfo(device);
            notifyListeners("deviceAttached", deviceInfo);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating device info", e);
        }
    }

    private void handleDeviceDetached(Intent intent) {
        UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
        if (device == null) return;

        Log.d(TAG, "USB device detached: " + getDeviceKey(device));

        // Close connection if it's the current device
        if (currentDriver != null && currentDriver.getDevice().equals(device)) {
            closeSerialPort();
        }

        try {
            JSObject deviceInfo = createDeviceInfo(device);
            notifyListeners("deviceDetached", deviceInfo);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating device info", e);
        }
    }

    private void resolveWithDeviceList(PluginCall call) {
        try {
            List<UsbSerialDriver> availableDrivers = UsbSerialProber.getDefaultProber().findAllDrivers(usbManager);
            JSArray devices = new JSArray();

            for (UsbSerialDriver driver : availableDrivers) {
                UsbDevice device = driver.getDevice();
                if (usbManager.hasPermission(device)) {
                    devices.put(createDeviceInfo(device));
                }
            }

            JSObject result = new JSObject();
            result.put("devices", devices);
            call.resolve(result);

        } catch (Exception e) {
            Log.e(TAG, "Error getting device list", e);
            call.reject("Failed to get devices: " + e.getMessage());
        }
    }

    private JSObject createDeviceInfo(UsbDevice device) throws JSONException {
        JSObject info = new JSObject();
        info.put("deviceId", getDeviceKey(device));
        info.put("vendorId", device.getVendorId());
        info.put("productId", device.getProductId());
        info.put("deviceName", device.getDeviceName());
        info.put("deviceClass", device.getDeviceClass());
        info.put("deviceSubclass", device.getDeviceSubclass());
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            info.put("manufacturer", device.getManufacturerName());
            info.put("product", device.getProductName());
        }
        
        return info;
    }

    private String getDeviceKey(UsbDevice device) {
        return device.getVendorId() + ":" + device.getProductId() + ":" + device.getDeviceId();
    }

    private void closeSerialPort() {
        if (ioManager != null) {
            ioManager.stop();
            ioManager = null;
        }

        if (serialPort != null) {
            try {
                serialPort.close();
            } catch (IOException e) {
                Log.e(TAG, "Error closing serial port", e);
            }
            serialPort = null;
        }

        if (connection != null) {
            connection.close();
            connection = null;
        }

        currentDriver = null;
        Log.d(TAG, "Serial port closed");
    }

    private int parseParity(String parity) {
        if (parity == null) return UsbSerialPort.PARITY_NONE;
        
        switch (parity.toLowerCase()) {
            case "even":
                return UsbSerialPort.PARITY_EVEN;
            case "odd":
                return UsbSerialPort.PARITY_ODD;
            case "mark":
                return UsbSerialPort.PARITY_MARK;
            case "space":
                return UsbSerialPort.PARITY_SPACE;
            default:
                return UsbSerialPort.PARITY_NONE;
        }
    }

    /**
     * Convert hex string to byte array
     * Example: "24580000fb" -> [0x24, 0x58, 0x00, 0x00, 0xfb]
     */
    private byte[] hexStringToByteArray(String hexString) {
        int len = hexString.length();
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            data[i / 2] = (byte) ((Character.digit(hexString.charAt(i), 16) << 4)
                    + Character.digit(hexString.charAt(i + 1), 16));
        }
        return data;
    }

    /**
     * Convert byte array to hex string
     * Example: [0x24, 0x58, 0x00, 0x00, 0xfb] -> "24580000fb"
     */
    private String byteArrayToHexString(byte[] bytes) {
        StringBuilder hexString = new StringBuilder();
        for (byte b : bytes) {
            String hex = Integer.toHexString(0xFF & b);
            if (hex.length() == 1) {
                hexString.append('0');
            }
            hexString.append(hex);
        }
        return hexString.toString();
    }
}
