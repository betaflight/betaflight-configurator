package betaflight.app.protocols.dfu;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbInterface;
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

import org.json.JSONException;

import java.util.HashMap;
import java.util.Map;

/**
 * Capacitor plugin for USB DFU (Device Firmware Update) communication.
 *
 * Exposes low-level USB control transfers so the existing JavaScript DFU
 * state machine (usbdfu.js) can orchestrate the STM32/GD32/AT32/APM32/RP2040
 * DFU protocol on Android via native USB APIs.
 *
 * Features:
 * - DFU device discovery filtered by known bootloader VID/PIDs
 * - USB permission handling (Android 14+ compatible)
 * - USB control transfers (IN and OUT) for DFU commands
 * - USB descriptor reading (string, interface, functional)
 * - Device attach/detach detection
 */
@CapacitorPlugin(
    name = "BetaflightDfu",
    permissions = {
        @Permission(strings = {}, alias = "usb")
    }
)
public class BetaflightDfuPlugin extends Plugin {
    private static java.lang.ref.WeakReference<BetaflightDfuPlugin> sInstance =
        new java.lang.ref.WeakReference<>(null);

    private static final String TAG = "BetaflightDfu";
    private static final String ACTION_USB_PERMISSION = "com.betaflight.DFU_USB_PERMISSION";
    private static final int DEFAULT_TIMEOUT_MS = 5000;

    // Known DFU bootloader VID/PID pairs
    private static final int[][] DFU_DEVICE_FILTERS = {
        {0x0483, 0xDF11},  // STM32 DFU Mode
        {0x28E9, 0x0189},  // GD32 DFU Bootloader
        {0x2E3C, 0xDF11},  // AT32F435 DFU Bootloader
        {0x314B, 0x0106},  // APM32 DFU Bootloader
        {0x2E8A, 0x000F},  // Raspberry Pi Pico Bootloader
    };

    // USB recipient bits not exposed by Android's UsbConstants
    private static final int USB_RECIP_DEVICE = 0x00;
    private static final int USB_RECIP_INTERFACE = 0x01;

    private UsbManager usbManager;
    private UsbDevice currentDevice;
    private UsbDeviceConnection connection;
    private UsbInterface claimedInterface;

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

        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_USB_PERMISSION);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);
        filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(usbReceiver, filter);
        }

        Log.d(TAG, "BetaflightDfu plugin loaded");
    }

    @Override
    protected void handleOnDestroy() {
        try {
            closeDeviceInternal();
            getContext().unregisterReceiver(usbReceiver);
        } catch (Exception e) {
            Log.e(TAG, "Error in handleOnDestroy", e);
        }
        super.handleOnDestroy();
    }

    // ===== Device Discovery =====

    /**
     * Get list of DFU-mode USB devices that have been granted permission.
     */
    @PluginMethod
    public void getDevices(PluginCall call) {
        try {
            JSArray devices = new JSArray();
            Map<String, UsbDevice> deviceList = usbManager.getDeviceList();

            for (UsbDevice device : deviceList.values()) {
                if (isDfuDevice(device) && usbManager.hasPermission(device)) {
                    devices.put(createDeviceInfo(device));
                }
            }

            JSObject result = new JSObject();
            result.put("devices", devices);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error getting devices", e);
            call.reject("Failed to get devices: " + e.getMessage());
        }
    }

    /**
     * Request permission to access DFU USB devices.
     */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        try {
            if (pendingPermissionCall != null) {
                call.reject("Another permission request is already in progress");
                return;
            }

            Map<String, UsbDevice> deviceList = usbManager.getDeviceList();
            java.util.List<UsbDevice> dfuDevices = new java.util.ArrayList<>();

            for (UsbDevice device : deviceList.values()) {
                if (isDfuDevice(device)) {
                    dfuDevices.add(device);
                }
            }

            if (dfuDevices.isEmpty()) {
                JSObject result = new JSObject();
                result.put("devices", new JSArray());
                call.resolve(result);
                return;
            }

            java.util.List<UsbDevice> needPermission = new java.util.ArrayList<>();
            for (UsbDevice device : dfuDevices) {
                if (!usbManager.hasPermission(device)) {
                    needPermission.add(device);
                }
            }

            if (needPermission.isEmpty()) {
                resolveWithDeviceList(call);
                return;
            }

            pendingPermissionCall = call;
            permissionRequestedDevices.clear();

            for (UsbDevice device : needPermission) {
                String deviceKey = getDeviceKey(device);
                permissionRequestedDevices.put(deviceKey, device);

                Intent permissionAction = new Intent(ACTION_USB_PERMISSION);
                permissionAction.setComponent(new android.content.ComponentName(
                    getContext(),
                    DfuUsbPermissionReceiver.class
                ));
                permissionAction.putExtra(UsbManager.EXTRA_DEVICE, device);

                int requestCode = device.getDeviceId();
                int flags;

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
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
                Log.d(TAG, "Requested permission for DFU device: " + deviceKey);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error requesting permission", e);
            pendingPermissionCall = null;
            permissionRequestedDevices.clear();
            call.reject("Failed to request permission: " + e.getMessage());
        }
    }

    // ===== Device Lifecycle =====

    /**
     * Open a DFU USB device and optionally select configuration.
     */
    @PluginMethod
    public void openDevice(PluginCall call) {
        String deviceId = call.getString("deviceId");
        if (deviceId == null) {
            call.reject("deviceId is required");
            return;
        }

        try {
            closeDeviceInternal();

            UsbDevice device = findDfuDevice(deviceId);
            if (device == null) {
                call.reject("DFU device not found: " + deviceId);
                return;
            }

            if (!usbManager.hasPermission(device)) {
                call.reject("Permission not granted for device: " + deviceId);
                return;
            }

            connection = usbManager.openDevice(device);
            if (connection == null) {
                call.reject("Failed to open device connection");
                return;
            }

            currentDevice = device;

            // Report configuration and interface count
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("productName", device.getProductName());
            result.put("manufacturerName", device.getManufacturerName());
            result.put("serialNumber", device.getSerialNumber());
            result.put("deviceVersionMajor", (device.getVersion() != null) ? device.getVersion() : "");
            result.put("interfaceCount", device.getInterfaceCount());

            // Report configuration info
            if (device.getConfigurationCount() > 0) {
                result.put("configurationCount", device.getConfigurationCount());
                result.put("configurationValue", device.getConfiguration(0).getId());
            }

            Log.d(TAG, "Opened DFU device: " + deviceId);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error opening device", e);
            closeDeviceInternal();
            call.reject("Failed to open device: " + e.getMessage());
        }
    }

    /**
     * Claim a USB interface.
     */
    @PluginMethod
    public void claimInterface(PluginCall call) {
        if (connection == null || currentDevice == null) {
            call.reject("No device is open");
            return;
        }

        int interfaceNum = call.getInt("interfaceNumber", 0);

        try {
            if (interfaceNum < 0 || interfaceNum >= currentDevice.getInterfaceCount()) {
                call.reject("Interface number out of range: " + interfaceNum);
                return;
            }

            UsbInterface iface = currentDevice.getInterface(interfaceNum);
            boolean claimed = connection.claimInterface(iface, true);

            if (claimed) {
                claimedInterface = iface;
                Log.d(TAG, "Claimed interface: " + interfaceNum);

                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
            } else {
                call.reject("Failed to claim interface: " + interfaceNum);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error claiming interface", e);
            call.reject("Failed to claim interface: " + e.getMessage());
        }
    }

    /**
     * Release a USB interface.
     */
    @PluginMethod
    public void releaseInterface(PluginCall call) {
        if (connection == null || currentDevice == null) {
            call.reject("No device is open");
            return;
        }

        int interfaceNum = call.getInt("interfaceNumber", 0);

        try {
            if (interfaceNum < 0 || interfaceNum >= currentDevice.getInterfaceCount()) {
                call.reject("Interface number out of range: " + interfaceNum);
                return;
            }

            UsbInterface iface = currentDevice.getInterface(interfaceNum);
            connection.releaseInterface(iface);
            if (claimedInterface == iface) {
                claimedInterface = null;
            }

            Log.d(TAG, "Released interface: " + interfaceNum);
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Error releasing interface", e);
            call.reject("Failed to release interface: " + e.getMessage());
        }
    }

    /**
     * Close the current USB device connection.
     */
    @PluginMethod
    public void closeDevice(PluginCall call) {
        closeDeviceInternal();
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    /**
     * Reset the USB device.
     */
    @PluginMethod
    public void resetDevice(PluginCall call) {
        // Android UsbDeviceConnection does not expose a reset method.
        // Closing and reopening is the closest equivalent.
        closeDeviceInternal();
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    // ===== USB Control Transfers =====

    /**
     * Perform a USB control transfer IN (device -> host).
     * Used for DFU GETSTATUS, GETSTATE, UPLOAD requests.
     */
    @PluginMethod
    public void controlTransferIn(PluginCall call) {
        if (connection == null) {
            call.reject("No device is open");
            return;
        }

        int requestType = call.getInt("requestType",
            UsbConstants.USB_DIR_IN | UsbConstants.USB_TYPE_CLASS | USB_RECIP_INTERFACE);
        int request = call.getInt("request", 0);
        int value = call.getInt("value", 0);
        int index = call.getInt("index", 0);
        int length = call.getInt("length", 0);
        int timeout = call.getInt("timeout", DEFAULT_TIMEOUT_MS);

        try {
            byte[] buffer = new byte[length];
            int result = connection.controlTransfer(requestType, request, value, index,
                buffer, length, timeout);

            JSObject response = new JSObject();
            if (result >= 0) {
                response.put("status", "ok");
                // Return only the bytes actually received
                byte[] received = new byte[result];
                System.arraycopy(buffer, 0, received, 0, result);
                response.put("data", byteArrayToHexString(received));
                response.put("length", result);
            } else {
                response.put("status", "error");
                response.put("data", "");
                response.put("length", result);
            }
            call.resolve(response);
        } catch (Exception e) {
            Log.e(TAG, "controlTransferIn failed", e);
            call.reject("Control transfer IN failed: " + e.getMessage());
        }
    }

    /**
     * Perform a USB control transfer OUT (host -> device).
     * Used for DFU DNLOAD, CLRSTATUS, ABORT, DETACH requests.
     */
    @PluginMethod
    public void controlTransferOut(PluginCall call) {
        if (connection == null) {
            call.reject("No device is open");
            return;
        }

        int requestType = call.getInt("requestType",
            UsbConstants.USB_DIR_OUT | UsbConstants.USB_TYPE_CLASS | USB_RECIP_INTERFACE);
        int request = call.getInt("request", 0);
        int value = call.getInt("value", 0);
        int index = call.getInt("index", 0);
        String hexData = call.getString("data", "");
        int timeout = call.getInt("timeout", DEFAULT_TIMEOUT_MS);

        try {
            byte[] data = (hexData != null && !hexData.isEmpty())
                ? hexStringToByteArray(hexData)
                : new byte[0];

            int result = connection.controlTransfer(requestType, request, value, index,
                data, data.length, timeout);

            JSObject response = new JSObject();
            if (result >= 0) {
                response.put("status", "ok");
                response.put("length", result);
            } else {
                response.put("status", "error");
                response.put("length", result);
            }
            call.resolve(response);
        } catch (Exception e) {
            Log.e(TAG, "controlTransferOut failed", e);
            call.reject("Control transfer OUT failed: " + e.getMessage());
        }
    }

    // ===== USB Descriptor Reading =====

    /**
     * Read a USB string descriptor by index.
     * Returns the decoded UTF-16LE string.
     */
    @PluginMethod
    public void getStringDescriptor(PluginCall call) {
        if (connection == null) {
            call.reject("No device is open");
            return;
        }

        int index = call.getInt("index", 0);

        try {
            // Standard USB GET_DESCRIPTOR for string
            int requestType = UsbConstants.USB_DIR_IN | UsbConstants.USB_TYPE_STANDARD | USB_RECIP_DEVICE;
            byte[] buffer = new byte[255];
            int result = connection.controlTransfer(
                requestType,
                0x06,              // GET_DESCRIPTOR
                0x0300 | index,    // STRING descriptor type | index
                0,                 // language ID
                buffer, 255, DEFAULT_TIMEOUT_MS
            );

            JSObject response = new JSObject();
            if (result > 2) {
                int length = buffer[0] & 0xFF;
                StringBuilder sb = new StringBuilder();
                for (int i = 2; i + 1 < length && i + 1 < result; i += 2) {
                    int charCode = (buffer[i] & 0xFF) | ((buffer[i + 1] & 0xFF) << 8);
                    sb.append((char) charCode);
                }
                response.put("status", "ok");
                response.put("descriptor", sb.toString());
            } else {
                response.put("status", "error");
                response.put("descriptor", "");
            }
            call.resolve(response);
        } catch (Exception e) {
            Log.e(TAG, "getStringDescriptor failed", e);
            call.reject("Failed to read string descriptor: " + e.getMessage());
        }
    }

    /**
     * Read the configuration descriptor to extract interface descriptor info.
     * Returns the raw descriptor bytes as hex for JS-side parsing.
     */
    @PluginMethod
    public void getInterfaceDescriptor(PluginCall call) {
        if (connection == null) {
            call.reject("No device is open");
            return;
        }

        int interfaceIndex = call.getInt("interfaceIndex", 0);

        try {
            if (interfaceIndex < 0) {
                call.reject("Interface index out of range: " + interfaceIndex);
                return;
            }

            // Note: assumes interface descriptors are contiguous at fixed 9-byte intervals
            // starting at offset 9 (after the config descriptor). This matches the original
            // webusbdfu.js implementation and is reliable for simple DFU-only configurations.
            int requestType = UsbConstants.USB_DIR_IN | UsbConstants.USB_TYPE_STANDARD | USB_RECIP_DEVICE;
            int requestedLength = 18 + (interfaceIndex + 1) * 9;
            byte[] buffer = new byte[requestedLength];
            int result = connection.controlTransfer(
                requestType,
                0x06,    // GET_DESCRIPTOR
                0x0200,  // CONFIGURATION descriptor type
                0,
                buffer, requestedLength, DEFAULT_TIMEOUT_MS
            );

            JSObject response = new JSObject();
            if (result >= 18 + interfaceIndex * 9 + 9) {
                int offset = 9 + interfaceIndex * 9;
                JSObject descriptor = new JSObject();
                descriptor.put("bLength", buffer[offset] & 0xFF);
                descriptor.put("bDescriptorType", buffer[offset + 1] & 0xFF);
                descriptor.put("bInterfaceNumber", buffer[offset + 2] & 0xFF);
                descriptor.put("bAlternateSetting", buffer[offset + 3] & 0xFF);
                descriptor.put("bNumEndpoints", buffer[offset + 4] & 0xFF);
                descriptor.put("bInterfaceClass", buffer[offset + 5] & 0xFF);
                descriptor.put("bInterfaceSubclass", buffer[offset + 6] & 0xFF);
                descriptor.put("bInterfaceProtocol", buffer[offset + 7] & 0xFF);
                descriptor.put("iInterface", buffer[offset + 8] & 0xFF);

                response.put("status", "ok");
                response.put("descriptor", descriptor);
            } else {
                response.put("status", "error");
            }
            call.resolve(response);
        } catch (Exception e) {
            Log.e(TAG, "getInterfaceDescriptor failed", e);
            call.reject("Failed to read interface descriptor: " + e.getMessage());
        }
    }

    /**
     * Read all interface descriptors and their string descriptors for a given interface number.
     * Returns an array of descriptor strings (used for chip info / flash layout parsing).
     */
    @PluginMethod
    public void getInterfaceDescriptors(PluginCall call) {
        if (connection == null || currentDevice == null) {
            call.reject("No device is open");
            return;
        }

        int interfaceNum = call.getInt("interfaceNumber", 0);

        try {
            // First, get the full configuration descriptor to know the total length
            int requestType = UsbConstants.USB_DIR_IN | UsbConstants.USB_TYPE_STANDARD | USB_RECIP_DEVICE;

            // Read the first 4 bytes to get wTotalLength
            byte[] header = new byte[4];
            int headerResult = connection.controlTransfer(
                requestType, 0x06, 0x0200, 0,
                header, 4, DEFAULT_TIMEOUT_MS
            );

            if (headerResult < 4) {
                call.reject("Failed to read configuration descriptor header");
                return;
            }

            int totalLength = (header[2] & 0xFF) | ((header[3] & 0xFF) << 8);

            // Now read the full configuration descriptor
            byte[] configDesc = new byte[totalLength];
            int result = connection.controlTransfer(
                requestType, 0x06, 0x0200, 0,
                configDesc, totalLength, DEFAULT_TIMEOUT_MS
            );

            if (result < totalLength) {
                Log.w(TAG, "Configuration descriptor truncated: got " + result + " of " + totalLength);
            }

            // Parse through the descriptor to find interface descriptors
            JSArray descriptorStrings = new JSArray();
            int pos = 0;
            while (pos < result) {
                if (pos + 1 >= result) break;
                int bLength = configDesc[pos] & 0xFF;
                if (bLength < 2) break;
                if (pos + bLength > result) break;

                int bDescriptorType = configDesc[pos + 1] & 0xFF;

                // Interface descriptor type = 4
                if (bDescriptorType == 4 && pos + 9 <= result) {
                    int bInterfaceNumber = configDesc[pos + 2] & 0xFF;
                    int iInterface = configDesc[pos + 8] & 0xFF;

                    if (bInterfaceNumber == interfaceNum && iInterface != 0) {
                        // Read the string descriptor
                        String descStr = readStringDescriptor(iInterface);
                        if (descStr != null) {
                            descriptorStrings.put(descStr);
                        }
                    }
                }

                pos += bLength;
            }

            JSObject response = new JSObject();
            response.put("status", "ok");
            response.put("descriptors", descriptorStrings);
            call.resolve(response);
        } catch (Exception e) {
            Log.e(TAG, "getInterfaceDescriptors failed", e);
            call.reject("Failed to read interface descriptors: " + e.getMessage());
        }
    }

    /**
     * Read the DFU functional descriptor.
     * Returns bmAttributes, wDetachTimeOut, wTransferSize, bcdDFUVersion.
     */
    @PluginMethod
    public void getFunctionalDescriptor(PluginCall call) {
        if (connection == null) {
            call.reject("No device is open");
            return;
        }

        try {
            JSObject descriptor = parseFunctionalDescriptorFromConfig();

            // Fallback: direct GET_DESCRIPTOR request (works on STM32)
            if (descriptor == null) {
                descriptor = requestFunctionalDescriptorDirect();
            }

            JSObject response = new JSObject();
            if (descriptor != null) {
                response.put("status", "ok");
                response.put("descriptor", descriptor);
            } else {
                response.put("status", "error");
            }
            call.resolve(response);
        } catch (Exception e) {
            Log.e(TAG, "getFunctionalDescriptor failed", e);
            call.reject("Failed to read functional descriptor: " + e.getMessage());
        }
    }

    /**
     * Parse DFU functional descriptor (type 0x21) from the configuration descriptor.
     * Per USB DFU spec, the functional descriptor follows the DFU interface descriptor
     * within the configuration descriptor. This works on all DFU-compliant devices.
     */
    private JSObject parseFunctionalDescriptorFromConfig() {
        try {
            int requestType = UsbConstants.USB_DIR_IN | UsbConstants.USB_TYPE_STANDARD | USB_RECIP_DEVICE;

            // Read header to get wTotalLength
            byte[] header = new byte[4];
            int headerResult = connection.controlTransfer(
                requestType, 0x06, 0x0200, 0,
                header, 4, DEFAULT_TIMEOUT_MS
            );
            if (headerResult < 4) return null;

            int totalLength = (header[2] & 0xFF) | ((header[3] & 0xFF) << 8);
            byte[] configDesc = new byte[totalLength];
            int result = connection.controlTransfer(
                requestType, 0x06, 0x0200, 0,
                configDesc, totalLength, DEFAULT_TIMEOUT_MS
            );

            // Walk the descriptor chain looking for DFU functional descriptor (0x21)
            // scoped to a DFU interface (class 0xFE, subclass 0x01).
            int pos = 0;
            boolean inDfuInterface = false;
            while (pos < result) {
                if (pos + 1 >= result) break;
                int bLength = configDesc[pos] & 0xFF;
                if (bLength < 2) break;
                if (pos + bLength > result) break;

                int bDescriptorType = configDesc[pos + 1] & 0xFF;
                if (bDescriptorType == 0x04 && bLength >= 9) {
                    int bInterfaceClass = configDesc[pos + 5] & 0xFF;
                    int bInterfaceSubClass = configDesc[pos + 6] & 0xFF;
                    inDfuInterface = (bInterfaceClass == 0xFE && bInterfaceSubClass == 0x01);
                } else if (inDfuInterface && bDescriptorType == 0x21 && bLength >= 7) {
                    JSObject descriptor = new JSObject();
                    descriptor.put("bLength", bLength);
                    descriptor.put("bDescriptorType", bDescriptorType);
                    descriptor.put("bmAttributes", configDesc[pos + 2] & 0xFF);
                    descriptor.put("wDetachTimeOut", (configDesc[pos + 3] & 0xFF) | ((configDesc[pos + 4] & 0xFF) << 8));
                    descriptor.put("wTransferSize", (configDesc[pos + 5] & 0xFF) | ((configDesc[pos + 6] & 0xFF) << 8));
                    if (bLength >= 9) {
                        descriptor.put("bcdDFUVersion", (configDesc[pos + 7] & 0xFF) | ((configDesc[pos + 8] & 0xFF) << 8));
                    }
                    return descriptor;
                }

                pos += bLength;
            }
        } catch (Exception e) {
            Log.w(TAG, "Config descriptor parse failed, will try direct request", e);
        }
        return null;
    }

    /**
     * Fallback: request DFU functional descriptor directly via GET_DESCRIPTOR.
     * Works on STM32 but may not work on all DFU implementations.
     */
    private JSObject requestFunctionalDescriptorDirect() {
        try {
            int requestType = UsbConstants.USB_DIR_IN | UsbConstants.USB_TYPE_STANDARD | USB_RECIP_INTERFACE;
            byte[] buffer = new byte[255];
            int result = connection.controlTransfer(
                requestType, 0x06, 0x2100, 0,
                buffer, 255, DEFAULT_TIMEOUT_MS
            );

            if (result >= 7) {
                JSObject descriptor = new JSObject();
                descriptor.put("bLength", buffer[0] & 0xFF);
                descriptor.put("bDescriptorType", buffer[1] & 0xFF);
                descriptor.put("bmAttributes", buffer[2] & 0xFF);
                descriptor.put("wDetachTimeOut", (buffer[3] & 0xFF) | ((buffer[4] & 0xFF) << 8));
                descriptor.put("wTransferSize", (buffer[5] & 0xFF) | ((buffer[6] & 0xFF) << 8));
                if (result >= 9) {
                    descriptor.put("bcdDFUVersion", (buffer[7] & 0xFF) | ((buffer[8] & 0xFF) << 8));
                }
                return descriptor;
            }
        } catch (Exception e) {
            Log.w(TAG, "Direct functional descriptor request failed", e);
        }
        return null;
    }

    // ===== Permission Handling =====

    public void handlePermissionResult(Intent intent) {
        UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
        if (device == null) return;

        String deviceKey = getDeviceKey(device);
        boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);

        Log.d(TAG, "Permission " + (granted ? "granted" : "denied") + " for DFU device: " + deviceKey);

        permissionRequestedDevices.remove(deviceKey);

        if (permissionRequestedDevices.isEmpty() && pendingPermissionCall != null) {
            resolveWithDeviceList(pendingPermissionCall);
            pendingPermissionCall = null;
        }
    }

    /**
     * Static entry point for the explicit BroadcastReceiver.
     */
    public static void onUsbPermissionResult(Context context, Intent intent) {
        BetaflightDfuPlugin instance = sInstance.get();
        if (instance != null) {
            instance.handlePermissionResult(intent);
        }
    }

    // ===== Private Helpers =====

    private boolean isDfuDevice(UsbDevice device) {
        int vid = device.getVendorId();
        int pid = device.getProductId();
        for (int[] filter : DFU_DEVICE_FILTERS) {
            if (filter[0] == vid && filter[1] == pid) {
                return true;
            }
        }
        return false;
    }

    private UsbDevice findDfuDevice(String deviceId) {
        Map<String, UsbDevice> deviceList = usbManager.getDeviceList();
        for (UsbDevice device : deviceList.values()) {
            if (isDfuDevice(device) && getDeviceKey(device).equals(deviceId)) {
                return device;
            }
        }
        return null;
    }

    private String getDeviceKey(UsbDevice device) {
        return device.getVendorId() + ":" + device.getProductId() + ":" + device.getDeviceId();
    }

    private JSObject createDeviceInfo(UsbDevice device) throws JSONException {
        JSObject info = new JSObject();
        info.put("deviceId", getDeviceKey(device));
        info.put("vendorId", device.getVendorId());
        info.put("productId", device.getProductId());
        info.put("deviceName", device.getDeviceName());
        info.put("serialNumber", device.getSerialNumber());
        info.put("productName", device.getProductName());
        info.put("manufacturerName", device.getManufacturerName());
        return info;
    }

    private void resolveWithDeviceList(PluginCall call) {
        try {
            JSArray devices = new JSArray();
            Map<String, UsbDevice> deviceList = usbManager.getDeviceList();

            for (UsbDevice device : deviceList.values()) {
                if (isDfuDevice(device) && usbManager.hasPermission(device)) {
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

    private void handleDeviceAttached(Intent intent) {
        UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
        if (device == null || !isDfuDevice(device)) return;

        Log.d(TAG, "DFU device attached: " + getDeviceKey(device));

        if (!usbManager.hasPermission(device)) {
            Log.d(TAG, "DFU device attached but no permission yet, skipping notification");
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
        if (device == null || !isDfuDevice(device)) return;

        Log.d(TAG, "DFU device detached: " + getDeviceKey(device));

        // Close connection if it's the current device
        if (currentDevice != null && currentDevice.equals(device)) {
            closeDeviceInternal();
        }

        try {
            JSObject deviceInfo = createDeviceInfo(device);
            notifyListeners("deviceDetached", deviceInfo);
        } catch (JSONException e) {
            Log.e(TAG, "Error creating device info", e);
        }
    }

    private void closeDeviceInternal() {
        if (claimedInterface != null && connection != null) {
            try {
                connection.releaseInterface(claimedInterface);
            } catch (Exception e) {
                Log.e(TAG, "Error releasing interface", e);
            }
            claimedInterface = null;
        }

        if (connection != null) {
            connection.close();
            connection = null;
        }

        currentDevice = null;
        Log.d(TAG, "DFU device closed");
    }

    private String readStringDescriptor(int index) {
        if (connection == null || index == 0) return null;

        int requestType = UsbConstants.USB_DIR_IN | UsbConstants.USB_TYPE_STANDARD | USB_RECIP_DEVICE;
        byte[] buffer = new byte[255];
        int result = connection.controlTransfer(
            requestType,
            0x06,
            0x0300 | index,
            0,
            buffer, 255, DEFAULT_TIMEOUT_MS
        );

        if (result > 2) {
            int length = buffer[0] & 0xFF;
            StringBuilder sb = new StringBuilder();
            for (int i = 2; i + 1 < length && i + 1 < result; i += 2) {
                int charCode = (buffer[i] & 0xFF) | ((buffer[i + 1] & 0xFF) << 8);
                sb.append((char) charCode);
            }
            return sb.toString();
        }

        return null;
    }

    private byte[] hexStringToByteArray(String hexString) {
        if (hexString == null || hexString.isEmpty()) {
            return new byte[0];
        }
        int len = hexString.length();
        if (len % 2 != 0) {
            throw new IllegalArgumentException("Hex string must have even length");
        }
        byte[] data = new byte[len / 2];
        for (int i = 0; i < len; i += 2) {
            int high = Character.digit(hexString.charAt(i), 16);
            int low = Character.digit(hexString.charAt(i + 1), 16);
            if (high == -1 || low == -1) {
                throw new IllegalArgumentException("Invalid hex character at position " + i);
            }
            data[i / 2] = (byte) ((high << 4) + low);
        }
        return data;
    }

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
