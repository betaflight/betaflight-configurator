package betaflight.configurator.protocols.bluetooth;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanRecord;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.text.TextUtils;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Queue;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicReference;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import android.content.pm.PackageManager;
import android.content.Intent;

/**
 * Custom Capacitor plugin that provides BLE scanning, connection management, and
 * MSP-friendly binary transport for Betaflight Configurator.
 */
@CapacitorPlugin(
	name = "BetaflightBluetooth",
	permissions = {
		@Permission(
			alias = "bluetooth",
			strings = {}
		)
	}
)
public class BetaflightBluetoothPlugin extends Plugin {
	private static final String TAG = "BetaflightBluetooth";
	private static final long DEFAULT_SCAN_TIMEOUT_MS = 15_000L;
	private static final long DEFAULT_CONNECT_TIMEOUT_MS = 12_000L;
	private static final UUID CLIENT_CONFIG_DESCRIPTOR = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

	private enum ConnectionState {
		DISCONNECTED,
		CONNECTING,
		CONNECTED,
		DISCONNECTING
	}

	private static final class DiscoveredDevice {
		final BluetoothDevice device;
		final ScanResult scanResult;

		DiscoveredDevice(BluetoothDevice device, ScanResult scanResult) {
			this.device = device;
			this.scanResult = scanResult;
		}
	}

	private final Handler mainHandler = new Handler(Looper.getMainLooper());
	private final AtomicReference<ConnectionState> connectionState = new AtomicReference<>(ConnectionState.DISCONNECTED);
	private final Map<String, DiscoveredDevice> discoveredDevices = new ConcurrentHashMap<>();
	private final Map<String, BluetoothGattCharacteristic> activeNotifications = new ConcurrentHashMap<>();

	private BluetoothAdapter bluetoothAdapter;
	private BluetoothLeScanner bluetoothLeScanner;
	private ScanCallback activeScanCallback;
	private Runnable scanTimeoutRunnable;
	private PluginCall pendingScanCall;

	private BluetoothGatt bluetoothGatt;
	private Runnable connectTimeoutRunnable;
	private PluginCall pendingConnectCall;
	private String connectedDeviceId;
	private BluetoothGattCharacteristic writeCharacteristic = null;
	private final Queue<PluginCall> pendingStartNotificationCalls = new ConcurrentLinkedQueue<>();
	private volatile boolean servicesDiscovered = false;

	@Override
	public void load() {
		super.load();
		BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
		if (manager != null) {
			bluetoothAdapter = manager.getAdapter();
			if (bluetoothAdapter != null) {
				bluetoothLeScanner = bluetoothAdapter.getBluetoothLeScanner();
			}
		}
		Log.d(TAG, "BetaflightBluetooth plugin loaded");
	}

	@Override
	protected void handleOnDestroy() {
		stopScanInternal();
		disconnectInternal(true);
		super.handleOnDestroy();
	}

	@PluginMethod
	public void checkStatus(PluginCall call) {
		JSObject result = new JSObject();
		result.put("available", bluetoothAdapter != null);
		result.put("enabled", bluetoothAdapter != null && bluetoothAdapter.isEnabled());
		result.put("connected", connectionState.get() == ConnectionState.CONNECTED);
		result.put("deviceId", connectedDeviceId);
		call.resolve(result);
	}

	@PluginMethod
	public void requestPermissions(PluginCall call) {
		// Determine required permissions based on Android version
		String[] requiredPermissions = getRequiredPermissions();
		
		// Check if all required permissions are already granted
		boolean allGranted = true;
		for (String permission : requiredPermissions) {
			if (ContextCompat.checkSelfPermission(getContext(), permission) 
					!= PackageManager.PERMISSION_GRANTED) {
				allGranted = false;
				break;
			}
		}
		
		if (allGranted) {
			JSObject result = new JSObject();
			result.put("granted", true);
			call.resolve(result);
			return;
		}
		
		// Store the call for later resolution
		pendingPermissionCall = call;
		
		// Request permissions using Activity's native method
		ActivityCompat.requestPermissions(
			getActivity(),
			requiredPermissions,
			BLUETOOTH_PERMISSION_REQUEST_CODE
		);
	}

	private static final int BLUETOOTH_PERMISSION_REQUEST_CODE = 9002;
	private PluginCall pendingPermissionCall;

	private String[] getRequiredPermissions() {
		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) { // Android 12+
			return new String[]{
				Manifest.permission.BLUETOOTH_SCAN,
				Manifest.permission.BLUETOOTH_CONNECT
			};
		} else { // Android 8-11
			return new String[]{
				Manifest.permission.BLUETOOTH,
				Manifest.permission.BLUETOOTH_ADMIN,
				Manifest.permission.ACCESS_COARSE_LOCATION
			};
		}
	}

	// Handle the permission result from the Activity
	@Override
	protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
		super.handleOnActivityResult(requestCode, resultCode, data);
	}

	// This is called by the Activity when permissions are granted/denied
	@Override
	protected void handleRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
		super.handleRequestPermissionsResult(requestCode, permissions, grantResults);
		
		if (requestCode == BLUETOOTH_PERMISSION_REQUEST_CODE && pendingPermissionCall != null) {
			boolean allGranted = true;
			for (int result : grantResults) {
				if (result != PackageManager.PERMISSION_GRANTED) {
					allGranted = false;
					break;
				}
			}
			
			if (allGranted) {
				JSObject result = new JSObject();
				result.put("granted", true);
				pendingPermissionCall.resolve(result);
			} else {
				pendingPermissionCall.reject("Bluetooth permissions denied");
			}
			
			pendingPermissionCall = null;
		}
	}

	@PermissionCallback
	private void onPermissionResult(PluginCall call) {
		boolean granted = getPermissionState("bluetooth") == PermissionState.GRANTED;
		if (granted) {
			JSObject result = new JSObject();
			result.put("granted", true);
			call.resolve(result);
		} else {
			call.reject("Bluetooth permissions denied");
		}
	}

	@PluginMethod
	public void getDevices(PluginCall call) {
		JSArray devices = new JSArray();
		for (DiscoveredDevice entry : discoveredDevices.values()) {
			devices.put(createDevicePayload(entry));
		}
		JSObject result = new JSObject();
		result.put("devices", devices);
		call.resolve(result);
	}

	@PluginMethod
	public void requestDevice(PluginCall call) {
		if (!ensureBluetoothReady(call)) {
			return;
		}
		if (pendingScanCall != null) {
			call.reject("Another scan is already running");
			return;
		}

		List<UUID> serviceFilter = parseUuidArray(call.getArray("services"));
		List<UUID> optionalServices = parseUuidArray(call.getArray("optionalServices"));
		boolean acceptAll = call.getBoolean("acceptAllDevices", false);
		String nameFilter = call.getString("name");
		String prefixFilter = call.getString("namePrefix");
		long timeout = call.getLong("timeout", DEFAULT_SCAN_TIMEOUT_MS);

		List<UUID> combinedFilter = new ArrayList<>(serviceFilter);
		if (!optionalServices.isEmpty()) {
			combinedFilter.addAll(optionalServices);
		}

		pendingScanCall = call;
		call.setKeepAlive(true);

		startLeScan(new ScanCriteria(acceptAll, nameFilter, prefixFilter, combinedFilter), timeout);
	}

	@PluginMethod
	public void stopScan(PluginCall call) {
		stopScanInternal();
		JSObject result = new JSObject();
		result.put("stopped", true);
		call.resolve(result);
	}

	@PluginMethod
	public void connect(PluginCall call) {
		if (!ensureBluetoothReady(call)) {
			return;
		}

		String deviceId = call.getString("deviceId");
		if (TextUtils.isEmpty(deviceId)) {
			call.reject("deviceId is required");
			return;
		}

		if (!connectionState.compareAndSet(ConnectionState.DISCONNECTED, ConnectionState.CONNECTING)) {
			call.reject("Another connection is active");
			return;
		}

		BluetoothDevice device = resolveDevice(deviceId);
		if (device == null) {
			connectionState.set(ConnectionState.DISCONNECTED);
			call.reject("Device not found: " + deviceId);
			return;
		}

		rejectPendingStartNotifications("Connection reset");
		pendingStartNotificationCalls.clear();
		servicesDiscovered = false;

		pendingConnectCall = call;
		call.setKeepAlive(true);
		connectedDeviceId = deviceId;

		runOnMainThread(() -> openGatt(device));
	}

	@PluginMethod
	public void disconnect(PluginCall call) {
		disconnectInternal(false);
		JSObject result = new JSObject();
		result.put("success", true);
		call.resolve(result);
	}

	@PluginMethod
	public void write(PluginCall call) {
		if (!ensureConnected(call)) return;

		final BluetoothGatt gatt = bluetoothGatt;
		if (gatt == null || !servicesDiscovered) {
			call.reject("Not connected");
			return;
		}

		final BluetoothGattCharacteristic target = writeCharacteristic;
		if (target == null) {
			call.reject("Write characteristic not available");
			return;
		}

		// Fetch payload params from call (they were previously undefined in this method)
		final String value = call.getString("value", call.getString("data"));
		final String encoding = call.getString("encoding", "base64");
		final boolean withoutResponse = call.getBoolean("withoutResponse", false);

		// Decode payload using your existing helper
		final byte[] payload;
		try {
			payload = decodePayload(value, encoding);
		} catch (IllegalArgumentException ex) {
			call.reject("Failed to decode payload: " + ex.getMessage());
			return;
		}

		// Choose write type: prefer NO_RESPONSE when supported or requested
		final int props = target.getProperties();
		final boolean canNoRsp = (props & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0;
		final int writeType = (withoutResponse || canNoRsp)
				? BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
				: BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT;

		final boolean ok = submitWrite(gatt, target, payload, writeType);
		if (ok) {
			JSObject result = new JSObject();
			result.put("bytesSent", payload.length);
			call.resolve(result);
		} else {
			call.reject("Unable to write characteristic");
		}
	}

	@PluginMethod
	public void startNotifications(PluginCall call) {
		if (!ensureConnected(call)) {
			return;
		}

		if (!servicesDiscovered) {
			queueStartNotificationCall(call);
			return;
		}

		startNotificationsInternal(call);
	}

	private void startNotificationsInternal(PluginCall call) {
		String serviceId = call.getString("service");
		String characteristicId = call.getString("characteristic");
		if (TextUtils.isEmpty(serviceId) || TextUtils.isEmpty(characteristicId)) {
			call.setKeepAlive(false);
			call.reject("service and characteristic are required");
			return;
		}

		UUID serviceUuid = parseUuid(serviceId);
		UUID characteristicUuid = parseUuid(characteristicId);
		if (serviceUuid == null || characteristicUuid == null) {
			call.setKeepAlive(false);
			call.reject("Invalid UUID format");
			return;
		}

		BluetoothGatt gatt = bluetoothGatt;
		if (gatt == null) {
			call.setKeepAlive(false);
			call.reject("Not connected");
			return;
		}

		BluetoothGattService service = gatt.getService(serviceUuid);
		BluetoothGattCharacteristic characteristic = service != null ? service.getCharacteristic(characteristicUuid) : null;
		if (characteristic == null) {
			BluetoothGattService fallback = findServiceContainingCharacteristic(gatt, characteristicUuid);
			if (fallback != null) {
				service = fallback;
				characteristic = fallback.getCharacteristic(characteristicUuid);
				Log.w(TAG, "Requested service " + serviceId + " not found, using " + service.getUuid());
			}
		}
		if (characteristic == null) {
			logGattLayout("Characteristic lookup failure", gatt);
			call.setKeepAlive(false);
			call.reject("Characteristic not found");
			return;
		}

		if (!enableNotifications(gatt, characteristic, true)) {
			call.setKeepAlive(false);
			call.reject("Failed to enable notifications");
			return;
		}

		activeNotifications.put(notificationKey(serviceUuid, characteristicUuid), characteristic);

		JSObject result = new JSObject();
		result.put("started", true);
		call.setKeepAlive(false);
		call.resolve(result);
	}

	@PluginMethod
	public void stopNotifications(PluginCall call) {
		if (!ensureConnected(call)) {
			return;
		}

		UUID serviceUuid = parseUuid(call.getString("service"));
		UUID characteristicUuid = parseUuid(call.getString("characteristic"));
		if (serviceUuid == null || characteristicUuid == null) {
			call.reject("Invalid UUID format");
			return;
		}

		BluetoothGattCharacteristic characteristic = activeNotifications.remove(notificationKey(serviceUuid, characteristicUuid));
		if (characteristic == null) {
			characteristic = removeNotificationByCharacteristic(characteristicUuid);
		}
		if (characteristic == null) {
			JSObject result = new JSObject();
			result.put("stopped", true);
			call.resolve(result);
			return;
		}

		BluetoothGatt gatt = bluetoothGatt;
		if (gatt != null) {
			enableNotifications(gatt, characteristic, false);
		}

		JSObject result = new JSObject();
		result.put("stopped", true);
		call.resolve(result);
	}

	private void startLeScan(ScanCriteria criteria, long timeoutMs) {
		if (bluetoothAdapter == null) {
			rejectPendingScan("Bluetooth adapter unavailable");
			return;
		}
		bluetoothLeScanner = bluetoothAdapter.getBluetoothLeScanner();
		if (bluetoothLeScanner == null) {
			rejectPendingScan("Bluetooth LE scanner unavailable");
			return;
		}

		List<ScanFilter> filters = buildScanFilters(criteria.serviceUuids);
		ScanSettings settings = new ScanSettings.Builder()
			.setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
			.build();

		activeScanCallback = new ScanCallback() {
			@Override
			public void onScanResult(int callbackType, ScanResult result) {
				handleScanResult(result, criteria);
			}

			@Override
			public void onBatchScanResults(List<ScanResult> results) {
				for (ScanResult result : results) {
					handleScanResult(result, criteria);
				}
			}

			@Override
			public void onScanFailed(int errorCode) {
				rejectPendingScan("Scan failed: " + errorCode);
			}
		};

		bluetoothLeScanner.startScan(filters.isEmpty() ? null : filters, settings, activeScanCallback);

		scanTimeoutRunnable = () -> rejectPendingScan("Scan timed out");
		mainHandler.postDelayed(scanTimeoutRunnable, timeoutMs);
	}

	private void handleScanResult(ScanResult result, ScanCriteria criteria) {
		if (result == null || result.getDevice() == null) {
			return;
		}

		if (!criteria.matches(result)) {
			return;
		}

		BluetoothDevice device = result.getDevice();
		String deviceId = safeDeviceId(device);

		if (!TextUtils.isEmpty(deviceId)) {
			discoveredDevices.put(deviceId, new DiscoveredDevice(device, result));
		}

		JSObject payload = createDevicePayload(new DiscoveredDevice(device, result));
		notifyListeners("deviceDiscovered", payload);

		PluginCall call = pendingScanCall;
		if (call != null) {
			stopScanInternal();
			JSObject resultPayload = new JSObject();
			resultPayload.put("device", payload);
			call.setKeepAlive(false);
			call.resolve(resultPayload);
		}
	}

	private void stopScanInternal() {
		if (bluetoothLeScanner != null && activeScanCallback != null) {
			bluetoothLeScanner.stopScan(activeScanCallback);
		}
		activeScanCallback = null;
		if (scanTimeoutRunnable != null) {
			mainHandler.removeCallbacks(scanTimeoutRunnable);
			scanTimeoutRunnable = null;
		}
		if (pendingScanCall != null) {
			pendingScanCall.setKeepAlive(false);
			pendingScanCall = null;
		}
	}

	@SuppressLint("MissingPermission")
	private void openGatt(BluetoothDevice device) {
		if (device == null) {
			failConnect("Device is null");
			return;
		}

		try {
			if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
				bluetoothGatt = device.connectGatt(getContext(), false, gattCallback, BluetoothDevice.TRANSPORT_LE);
			} else {
				bluetoothGatt = device.connectGatt(getContext(), false, gattCallback);
			}
		} catch (SecurityException ex) {
			failConnect("Missing BLUETOOTH_CONNECT permission");
			return;
		}

		if (bluetoothGatt == null) {
			failConnect("Unable to open GATT connection");
			return;
		}

		connectTimeoutRunnable = () -> failConnect("Connection timed out");
		mainHandler.postDelayed(connectTimeoutRunnable, DEFAULT_CONNECT_TIMEOUT_MS);
	}

	private void failConnect(String reason) {
		Log.e(TAG, "Connection failed: " + reason);
		connectionState.set(ConnectionState.DISCONNECTED);
		String failingDeviceId = connectedDeviceId;
		if (connectTimeoutRunnable != null) {
			mainHandler.removeCallbacks(connectTimeoutRunnable);
			connectTimeoutRunnable = null;
		}
		cleanupGatt();

		PluginCall call = pendingConnectCall;
		if (call != null) {
			pendingConnectCall = null;
			call.setKeepAlive(false);
			call.reject(reason);
		}

		notifyConnectionState(false, reason, failingDeviceId);
		rejectPendingStartNotifications(reason);
	}

	private void connectedSuccessfully() {
		if (connectTimeoutRunnable != null) {
			mainHandler.removeCallbacks(connectTimeoutRunnable);
			connectTimeoutRunnable = null;
		}

		PluginCall call = pendingConnectCall;
		if (call != null) {
			pendingConnectCall = null;
			JSObject result = new JSObject();
			result.put("connected", true);
			call.setKeepAlive(false);
			call.resolve(result);
		}

		notifyConnectionState(true, "connected", connectedDeviceId);
	}

	private void disconnectInternal(boolean fromDestroy) {
		ConnectionState current = connectionState.getAndSet(fromDestroy ? ConnectionState.DISCONNECTED : ConnectionState.DISCONNECTING);
		if (current == ConnectionState.DISCONNECTED && !fromDestroy) {
			cleanupGatt();
			return;
		}

		if (connectTimeoutRunnable != null) {
			mainHandler.removeCallbacks(connectTimeoutRunnable);
			connectTimeoutRunnable = null;
		}

		String lastDeviceId = connectedDeviceId;
		cleanupGatt();
		activeNotifications.clear();
		connectionState.set(ConnectionState.DISCONNECTED);
		notifyConnectionState(false, "disconnected", lastDeviceId);
		rejectPendingStartNotifications("Device disconnected");
	}

	@SuppressLint("MissingPermission")
	private void cleanupGatt() {
		if (bluetoothGatt != null) {
			try { bluetoothGatt.disconnect(); } catch (Exception ignored) {}
			try { bluetoothGatt.close(); } catch (Exception ignored) {}
		}
		bluetoothGatt = null;
		writeCharacteristic = null; // reset for next connection
		connectedDeviceId = null;
		servicesDiscovered = false;
	}

	private void notifyConnectionState(boolean connected, String reason, String deviceId) {
		JSObject payload = new JSObject();
		payload.put("connected", connected);
		payload.put("deviceId", deviceId);
		payload.put("state", connectionState.get().name());
		payload.put("reason", reason);
		notifyListeners("connectionState", payload);
	}

	private boolean ensureBluetoothReady(PluginCall call) {
		if (getPermissionState("bluetooth") != PermissionState.GRANTED) {
			call.reject("Bluetooth permission not granted");
			return false;
		}
		if (bluetoothAdapter == null) {
			call.reject("Bluetooth adapter unavailable");
			return false;
		}
		if (!bluetoothAdapter.isEnabled()) {
			call.reject("Bluetooth adapter disabled");
			return false;
		}
		return true;
	}

	private boolean ensureConnected(PluginCall call) {
		if (!ensureBluetoothReady(call)) {
			return false;
		}
		if (connectionState.get() != ConnectionState.CONNECTED || bluetoothGatt == null) {
			call.reject("Not connected to any device");
			return false;
		}
		return true;
	}

	private BluetoothDevice resolveDevice(String deviceId) {
		if (TextUtils.isEmpty(deviceId)) {
			return null;
		}
		DiscoveredDevice cached = discoveredDevices.get(deviceId);
		if (cached != null) {
			return cached.device;
		}
		if (bluetoothAdapter == null) {
			return null;
		}
		try {
			return bluetoothAdapter.getRemoteDevice(deviceId);
		} catch (IllegalArgumentException ex) {
			Log.e(TAG, "Invalid device address", ex);
			return null;
		}
	}

	private JSObject createDevicePayload(DiscoveredDevice entry) {
		JSObject device = new JSObject();
		BluetoothDevice btDevice = entry.device;
		device.put("deviceId", safeDeviceId(btDevice));
		device.put("name", btDevice != null ? btDevice.getName() : null);
		device.put("bondState", btDevice != null ? btDevice.getBondState() : BluetoothDevice.BOND_NONE);

		ScanResult scanResult = entry.scanResult;
		if (scanResult != null) {
			device.put("rssi", scanResult.getRssi());
			JSArray uuids = new JSArray();
			ScanRecord record = scanResult.getScanRecord();
			if (record != null && record.getServiceUuids() != null) {
				for (ParcelUuid uuid : record.getServiceUuids()) {
					uuids.put(uuid.getUuid().toString());
				}
			}
			device.put("uuids", uuids);
		}

		return device;
	}

	private void rejectPendingScan(String message) {
		Log.w(TAG, message);
		PluginCall call = pendingScanCall;
		if (call != null) {
			pendingScanCall = null;
			call.setKeepAlive(false);
			call.reject(message);
		}
		stopScanInternal();
	}

	private void runOnMainThread(Runnable runnable) {
		if (Looper.myLooper() == Looper.getMainLooper()) {
			runnable.run();
		} else {
			mainHandler.post(runnable);
		}
	}

	private boolean enableNotifications(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, boolean enable) {
		try {
			if (!gatt.setCharacteristicNotification(characteristic, enable)) {
				return false;
			}

			BluetoothGattDescriptor descriptor = characteristic.getDescriptor(CLIENT_CONFIG_DESCRIPTOR);
			if (descriptor != null) {
				byte[] value = enable
					? ((characteristic.getProperties() & BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0
						? BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
						: BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
					: BluetoothGattDescriptor.DISABLE_NOTIFICATION_VALUE;

				descriptor.setValue(value);
				gatt.writeDescriptor(descriptor);
			}
			return true;
		} catch (SecurityException ex) {
			Log.e(TAG, "Notification permission issue", ex);
			return false;
		}
	}

	private boolean submitWrite(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] payload, int writeType) {
		try {
			if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
				return gatt.writeCharacteristic(characteristic, payload, writeType) == BluetoothGatt.GATT_SUCCESS;
			}
			characteristic.setWriteType(writeType);
			characteristic.setValue(payload);
			return gatt.writeCharacteristic(characteristic);
		} catch (SecurityException ex) {
			Log.e(TAG, "Write failed due to permissions", ex);
			return false;
		}
	}

	private byte[] decodePayload(String value, String encoding) {
		if ("hex".equalsIgnoreCase(encoding)) {
			return hexToBytes(value);
		}
		if ("utf8".equalsIgnoreCase(encoding) || "utf-8".equalsIgnoreCase(encoding)) {
			return value.getBytes(StandardCharsets.UTF_8);
		}
		return Base64.decode(value, Base64.DEFAULT);
	}

	private BluetoothGattService findServiceContainingCharacteristic(BluetoothGatt gatt, UUID characteristicUuid) {
		if (gatt == null || characteristicUuid == null) {
			return null;
		}
		for (BluetoothGattService candidate : gatt.getServices()) {
			if (candidate.getCharacteristic(characteristicUuid) != null) {
				return candidate;
			}
		}
		return null;
	}

	private void logGattLayout(String reason, BluetoothGatt gatt) {
		if (gatt == null) {
			return;
		}
		StringBuilder builder = new StringBuilder()
			.append(reason == null ? "GATT layout" : reason)
			.append(" (device=")
			.append(connectedDeviceId)
			.append(")\n");
		for (BluetoothGattService service : gatt.getServices()) {
			builder.append("  Service ").append(service.getUuid()).append('\n');
			for (BluetoothGattCharacteristic characteristic : service.getCharacteristics()) {
				builder
					.append("    Characteristic ")
					.append(characteristic.getUuid())
					.append(" props=0x")
					.append(Integer.toHexString(characteristic.getProperties()))
					.append('\n');
			}
		}
		Log.i(TAG, builder.toString());
	}

	private BluetoothGattCharacteristic removeNotificationByCharacteristic(UUID characteristicUuid) {
		if (characteristicUuid == null) {
			return null;
		}
		Iterator<Map.Entry<String, BluetoothGattCharacteristic>> iterator = activeNotifications.entrySet().iterator();
		while (iterator.hasNext()) {
			Map.Entry<String, BluetoothGattCharacteristic> entry = iterator.next();
			BluetoothGattCharacteristic candidate = entry.getValue();
			if (candidate != null && characteristicUuid.equals(candidate.getUuid())) {
				iterator.remove();
				return candidate;
			}
		}
		return null;
	}

	private void queueStartNotificationCall(PluginCall call) {
		call.setKeepAlive(true);
		pendingStartNotificationCalls.add(call);
		Log.d(TAG, "Queued startNotifications until services are discovered");
	}

	private void flushPendingStartNotificationCalls() {
		if (!servicesDiscovered || pendingStartNotificationCalls.isEmpty()) {
			return;
		}
		PluginCall pendingCall;
		while ((pendingCall = pendingStartNotificationCalls.poll()) != null) {
			startNotificationsInternal(pendingCall);
		}
	}

	private void rejectPendingStartNotifications(String reason) {
		if (pendingStartNotificationCalls.isEmpty()) {
			return;
		}
		PluginCall pendingCall;
		while ((pendingCall = pendingStartNotificationCalls.poll()) != null) {
			pendingCall.setKeepAlive(false);
			pendingCall.reject(reason);
		}
	}

	private byte[] hexToBytes(String hex) {
		String cleaned = hex.replace(" ", "");
		if ((cleaned.length() & 1) != 0) {
			throw new IllegalArgumentException("Hex payload must have even length");
		}
		byte[] data = new byte[cleaned.length() / 2];
		for (int i = 0; i < cleaned.length(); i += 2) {
			int hi = Character.digit(cleaned.charAt(i), 16);
			int lo = Character.digit(cleaned.charAt(i + 1), 16);
			if (hi < 0 || lo < 0) {
				throw new IllegalArgumentException("Invalid hex digit");
			}
			data[i / 2] = (byte) ((hi << 4) + lo);
		}
		return data;
	}

	private List<UUID> parseUuidArray(JSArray array) {
		if (array == null) {
			return Collections.emptyList();
		}
		List<UUID> result = new ArrayList<>();
		for (int i = 0; i < array.length(); i++) {
			try {
				String value = array.getString(i);
				UUID uuid = parseUuid(value);
				if (uuid != null) {
					result.add(uuid);
				}
			} catch (Exception ignored) {}
		}
		return result;
	}

	private UUID parseUuid(String value) {
		if (TextUtils.isEmpty(value)) {
			return null;
		}
		try {
			return UUID.fromString(value.toLowerCase(Locale.US));
		} catch (IllegalArgumentException ex) {
			Log.e(TAG, "Invalid UUID: " + value, ex);
			return null;
		}
	}

	private String notificationKey(UUID service, UUID characteristic) {
		return service.toString() + "#" + characteristic.toString();
	}

	private List<ScanFilter> buildScanFilters(List<UUID> uuids) {
		if (uuids == null || uuids.isEmpty()) {
			return Collections.emptyList();
		}
		List<ScanFilter> filters = new ArrayList<>();
		for (UUID uuid : uuids) {
			filters.add(new ScanFilter.Builder().setServiceUuid(new ParcelUuid(uuid)).build());
		}
		return filters;
	}

	private String safeDeviceId(BluetoothDevice device) {
		return device != null ? device.getAddress() : null;
	}

	private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
		@Override
		public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
			if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
				connectionState.set(ConnectionState.CONNECTED);
				gatt.discoverServices();
				// connectedSuccessfully() now called after service discovery
			} else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
				connectionState.set(ConnectionState.DISCONNECTED);
				cleanupGatt();
				failConnect(status == BluetoothGatt.GATT_SUCCESS ? "Disconnected" : "Connect status: " + status);
			}
		}

		@Override
		public void onServicesDiscovered(BluetoothGatt gatt, int status) {
			if (status != BluetoothGatt.GATT_SUCCESS) {
				return;
			}
			servicesDiscovered = true;
			// Resolve and cache a write characteristic once per connection
			writeCharacteristic = null;
			try {
				for (BluetoothGattService svc : gatt.getServices()) {
					BluetoothGattCharacteristic preferred = null;
					BluetoothGattCharacteristic fallback = null;
					for (BluetoothGattCharacteristic ch : svc.getCharacteristics()) {
						final int props = ch.getProperties();
						if ((props & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0) {
							preferred = ch; // best option for MSP
							break;
						}
						if (fallback == null && (props & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0) {
							fallback = ch;
						}
					}
					final BluetoothGattCharacteristic chosen = (preferred != null) ? preferred : fallback;
					if (chosen != null) {
						writeCharacteristic = chosen;
						break;
					}
				}
			} catch (Exception ignored) {
				// leave writeCharacteristic null; write() will report unavailable
			}

			flushPendingStartNotificationCalls();
			logGattLayout("Services discovered", gatt);
			JSArray services = new JSArray();
			for (BluetoothGattService service : gatt.getServices()) {
				JSObject servicePayload = new JSObject();
				servicePayload.put("uuid", service.getUuid().toString());
				JSArray characteristics = new JSArray();
				for (BluetoothGattCharacteristic characteristic : service.getCharacteristics()) {
					JSObject characteristicPayload = new JSObject();
					characteristicPayload.put("uuid", characteristic.getUuid().toString());
					characteristicPayload.put("properties", characteristic.getProperties());
					characteristics.put(characteristicPayload);
				}
				servicePayload.put("characteristics", characteristics);
				services.put(servicePayload);
			}
			JSObject payload = new JSObject();
			payload.put("deviceId", connectedDeviceId);
			payload.put("services", services);
			notifyListeners("services", payload);
			// Now resolve the connect call after services are discovered
			connectedSuccessfully();
		}

		/**
		 * Deprecated 2-arg callback for backward compatibility (API < 33).
		 * Forwards to the 3-arg version.
		 */
		@Deprecated
		@SuppressWarnings("deprecation")
		@Override
		public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
			byte[] value = (characteristic != null) ? characteristic.getValue() : null;
			if (characteristic == null || value == null) {
				Log.w(TAG, "Received notification with null characteristic or value (2-arg)");
				return;
			}
			onCharacteristicChanged(gatt, characteristic, value);
		}

		@Override
		public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] value) {
			if (characteristic == null || value == null) {
                Log.w(TAG, "Received notification with null characteristic or value");
                return;
			}
			JSObject payload = new JSObject();
			payload.put("deviceId", connectedDeviceId);
			payload.put("service", characteristic.getService().getUuid().toString());
			payload.put("characteristic", characteristic.getUuid().toString());
			payload.put("value", Base64.encodeToString(value, Base64.NO_WRAP));
			notifyListeners("notification", payload);
		}
	};

	private static final class ScanCriteria {
		final boolean acceptAll;
		final String name;
		final String prefix;
		final List<UUID> serviceUuids;

		ScanCriteria(boolean acceptAll, String name, String prefix, List<UUID> serviceUuids) {
			this.acceptAll = acceptAll;
			this.name = name;
			this.prefix = prefix;
			this.serviceUuids = serviceUuids != null ? serviceUuids : Collections.emptyList();
		}

		boolean matches(ScanResult result) {
			if (acceptAll) {
				return true;
			}

			BluetoothDevice device = result.getDevice();
			String deviceName = device != null ? device.getName() : null;

			if (!TextUtils.isEmpty(name) && !name.equals(deviceName)) {
				return false;
			}

			if (!TextUtils.isEmpty(prefix)) {
				if (TextUtils.isEmpty(deviceName) || !deviceName.toLowerCase(Locale.US).startsWith(prefix.toLowerCase(Locale.US))) {
					return false;
				}
			}

			if (serviceUuids.isEmpty()) {
				return true;
			}

			ScanRecord record = result.getScanRecord();
			List<ParcelUuid> advertised = record != null ? record.getServiceUuids() : null;
			if (advertised == null) {
				return false;
			}

			for (ParcelUuid parcelUuid : advertised) {
				if (serviceUuids.contains(parcelUuid.getUuid())) {
					return true;
				}
			}

			return false;
		}
	}
}
