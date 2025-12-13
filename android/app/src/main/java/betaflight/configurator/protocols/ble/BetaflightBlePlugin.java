package betaflight.configurator.protocols.ble;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.util.Base64;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import no.nordicsemi.android.ble.BleManager;
import no.nordicsemi.android.ble.observer.ConnectionObserver;
import no.nordicsemi.android.ble.WriteRequest;
import no.nordicsemi.android.ble.data.Data;

@CapacitorPlugin(
	name = "BetaflightBle",
	permissions = {
		@Permission(
			strings = {
				Manifest.permission.BLUETOOTH_SCAN,
				Manifest.permission.BLUETOOTH_CONNECT,
				Manifest.permission.ACCESS_FINE_LOCATION
			},
			alias = "bluetooth"
		)
	}
)
public class BetaflightBlePlugin extends Plugin {
	private static final String TAG = "BetaflightBle";
	private static final long SCAN_DURATION_MS = 5_000L;

	private static final Map<String, KnownDevice> KNOWN_DEVICES = new HashMap<>();

	static {
		addDevice("CC2541", "0000ffe0-0000-1000-8000-00805f9b34fb",
			"0000ffe1-0000-1000-8000-00805f9b34fb", "0000ffe2-0000-1000-8000-00805f9b34fb");
		addDevice("HC-05", "00001101-0000-1000-8000-00805f9b34fb",
			"00001101-0000-1000-8000-00805f9b34fb", "00001101-0000-1000-8000-00805f9b34fb");
		addDevice("HM-10", "0000ffe1-0000-1000-8000-00805f9b34fb",
			"0000ffe1-0000-1000-8000-00805f9b34fb", "0000ffe1-0000-1000-8000-00805f9b34fb");
		addDevice("HM-11", "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
			"6e400003-b5a3-f393-e0a9-e50e24dcca9e", "6e400002-b5a3-f393-e0a9-e50e24dcca9e");
		addDevice("Nordic NRF", "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
			"6e400003-b5a3-f393-e0a9-e50e24dcca9e", "6e400002-b5a3-f393-e0a9-e50e24dcca9e");
		addDevice("SpeedyBee V1", "00001000-0000-1000-8000-00805f9b34fb",
			"00001001-0000-1000-8000-00805f9b34fb", "00001002-0000-1000-8000-00805f9b34fb");
		addDevice("SpeedyBee V2", "0000abf0-0000-1000-8000-00805f9b34fb",
			"0000abf1-0000-1000-8000-00805f9b34fb", "0000abf2-0000-1000-8000-00805f9b34fb");
		addDevice("DroneBridge", "0000db32-0000-1000-8000-00805f9b34fb",
			"0000db33-0000-1000-8000-00805f9b34fb", "0000db34-0000-1000-8000-00805f9b34fb");
	}

	private static void addDevice(String name, String service, String write, String notify) {
		KNOWN_DEVICES.put(service.toLowerCase(), new KnownDevice(name, service, write, notify));
	}

	private BluetoothAdapter adapter;
	private BluetoothLeScanner scanner;
	private final Handler handler = new Handler(Looper.getMainLooper());
	private final Map<String, DiscoveredDevice> discoveredDevices = new HashMap<>();
	private boolean scanning = false;

	private BleBridgeManager bleManager;
	private String connectedAddress;

	private boolean hasBlePermissions() {
		Context context = getContext();
		if (context == null) return false;

		if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
			boolean scan = ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED;
			boolean connect = ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
			return scan && connect;
		}

		boolean basic = ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH) == PackageManager.PERMISSION_GRANTED;
		boolean admin = ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_ADMIN) == PackageManager.PERMISSION_GRANTED;
		boolean location = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
		return basic && admin && location;
	}

	private boolean ensurePermissions(PluginCall call) {
		if (hasBlePermissions()) {
			return true;
		}

		requestPermissionForAlias("bluetooth", call, "onBlePermissionResult");
		return false;
	}

	@PermissionCallback
	private void onBlePermissionResult(PluginCall call) {
		if (hasBlePermissions()) {
			// Continue the original request now that permission is granted
			getDevices(call);
		} else {
			call.reject("Bluetooth permission denied");
		}
	}

	@PluginMethod
	public void getDevices(PluginCall call) {
		if (!ensurePermissions(call)) {
			return;
		}

		BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
		adapter = manager.getAdapter();
		if (adapter == null || !adapter.isEnabled()) {
			call.reject("Bluetooth adapter is disabled");
			return;
		}

		scanner = adapter.getBluetoothLeScanner();
		if (scanner == null) {
			call.reject("Bluetooth LE scanner unavailable");
			return;
		}

		discoveredDevices.clear();
		scanning = true;

		List<ScanFilter> filters = new ArrayList<>();
		for (String service : KNOWN_DEVICES.keySet()) {
			filters.add(new ScanFilter.Builder().setServiceUuid(new ParcelUuid(UUID.fromString(service))).build());
		}

		ScanSettings settings = new ScanSettings.Builder()
			.setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
			.build();

		scanner.startScan(filters, settings, scanCallback);
		handler.postDelayed(() -> finishScan(call), SCAN_DURATION_MS);
	}

	private void finishScan(PluginCall call) {
		stopScan();

		JSArray devices = new JSArray();
		for (DiscoveredDevice device : discoveredDevices.values()) {
			JSObject obj = new JSObject();
			obj.put("address", device.address);
			obj.put("name", device.name);
			obj.put("rssi", device.rssi);
			obj.put("serviceUuid", device.profile.serviceUuid);
			obj.put("writeCharacteristic", device.profile.writeUuid);
			obj.put("notifyCharacteristic", device.profile.notifyUuid);
			devices.put(obj);
		}

		JSObject result = new JSObject();
		result.put("devices", devices);
		call.resolve(result);
	}

	@PluginMethod
	public void requestPermission(PluginCall call) {
		getDevices(call);
	}

	@PluginMethod
	public void connect(PluginCall call) {
		if (!ensurePermissions(call)) {
			return;
		}

		String address = call.getString("address");
		String serviceUuid = call.getString("serviceUuid");
		String writeUuid = call.getString("writeCharacteristic");
		String notifyUuid = call.getString("notifyCharacteristic");

		if (address == null || serviceUuid == null || writeUuid == null || notifyUuid == null) {
			call.reject("address, serviceUuid, writeCharacteristic, and notifyCharacteristic are required");
			return;
		}

		BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
		adapter = manager.getAdapter();
		if (adapter == null) {
			call.reject("Bluetooth adapter unavailable");
			return;
		}

		BluetoothDevice device = adapter.getRemoteDevice(address);
		if (device == null) {
			call.reject("Device not found: " + address);
			return;
		}

		KnownDevice profile = KNOWN_DEVICES.getOrDefault(serviceUuid.toLowerCase(),
			new KnownDevice("Unknown", serviceUuid, writeUuid, notifyUuid));

		bleManager = new BleBridgeManager(getContext(), this, profile);
		bleManager.setConnectionObserver(new ConnectionObserver() {
			@Override
			public void onDeviceConnecting(@NonNull BluetoothDevice device) {
				Log.d(TAG, "Connecting to " + device.getAddress());
			}

			@Override
			public void onDeviceConnected(@NonNull BluetoothDevice device) {
				Log.d(TAG, "Connected to " + device.getAddress());
				connectedAddress = device.getAddress();
				JSObject evt = new JSObject();
				evt.put("address", connectedAddress);
				notifyListeners("connected", evt);
			}

			@Override
			public void onDeviceFailedToConnect(@NonNull BluetoothDevice device, int reason) {
				connectedAddress = null;
				call.reject("Connection failed: " + reason);
			}

			@Override
			public void onDeviceReady(@NonNull BluetoothDevice device) {
				JSObject res = new JSObject();
				res.put("success", true);
				call.resolve(res);
			}

			@Override
			public void onDeviceDisconnecting(@NonNull BluetoothDevice device) {
				Log.d(TAG, "Disconnecting " + device.getAddress());
			}

			@Override
			public void onDeviceDisconnected(@NonNull BluetoothDevice device, int reason) {
				connectedAddress = null;
				JSObject evt = new JSObject();
				evt.put("address", device.getAddress());
				evt.put("reason", reason);
				notifyListeners("disconnected", evt);
			}
		});

		bleManager.connect(device)
			.useAutoConnect(false)
			.timeout(15_000)
			.fail((dev, status) -> {
				connectedAddress = null;
				call.reject("Connection failed: " + status);
			})
			.enqueue();
	}

	@PluginMethod
	public void disconnect(PluginCall call) {
		if (bleManager == null || !bleManager.isConnected()) {
			JSObject result = new JSObject();
			result.put("success", true);
			call.resolve(result);
			return;
		}

		bleManager.disconnect()
			.timeout(5_000)
			.done(device -> {
				connectedAddress = null;
				JSObject res = new JSObject();
				res.put("success", true);
				call.resolve(res);
			})
			.fail((device, status) -> {
				connectedAddress = null;
				call.reject("Disconnect failed: " + status);
			})
			.enqueue();
	}

	@PluginMethod
	public void send(PluginCall call) {
		if (bleManager == null || !bleManager.isConnected()) {
			call.reject("Not connected");
			return;
		}

		String b64 = call.getString("data");
		if (b64 == null || b64.isEmpty()) {
			call.reject("data is required");
			return;
		}

		byte[] payload = Base64.decode(b64, Base64.NO_WRAP);
		WriteRequest request = bleManager.send(payload);

		if (request == null) {
			call.reject("Not ready to send data");
			return;
		}

		request
			.done(device -> {
				JSObject res = new JSObject();
				res.put("bytesSent", payload.length);
				call.resolve(res);
			})
			.fail((device, status) -> call.reject("Send failed: " + status))
			.enqueue();
	}

	@Override
	protected void handleOnDestroy() {
		stopScan();
		try {
			if (bleManager != null) {
				bleManager.close();
			}
		} catch (Exception e) {
			Log.e(TAG, "Error closing BLE manager", e);
		}
		super.handleOnDestroy();
	}

	private void stopScan() {
		if (scanner != null && scanning) {
			try {
				scanner.stopScan(scanCallback);
			} catch (Exception ignored) {
			}
		}
		scanning = false;
	}

	private final ScanCallback scanCallback = new ScanCallback() {
		@Override
		public void onScanResult(int callbackType, ScanResult result) {
			handleResult(result);
		}

		@Override
		public void onBatchScanResults(List<ScanResult> results) {
			for (ScanResult result : results) {
				handleResult(result);
			}
		}

		@Override
		public void onScanFailed(int errorCode) {
			Log.e(TAG, "BLE scan failed: " + errorCode);
		}
	};

	private void handleResult(ScanResult result) {
		if (result == null || result.getDevice() == null || result.getScanRecord() == null) {
			return;
		}

		List<ParcelUuid> services = result.getScanRecord().getServiceUuids();
		if (services == null || services.isEmpty()) {
			return;
		}

		KnownDevice profile = null;
		for (ParcelUuid uuid : services) {
			if (uuid == null) continue;
			String key = uuid.getUuid().toString().toLowerCase();
			if (KNOWN_DEVICES.containsKey(key)) {
				profile = KNOWN_DEVICES.get(key);
				break;
			}
		}

		if (profile == null) {
			return;
		}

		BluetoothDevice device = result.getDevice();
		String address = device.getAddress();
		DiscoveredDevice cached = discoveredDevices.get(address);
		if (cached != null) {
			cached.rssi = result.getRssi();
			return;
		}

		String name = device.getName();
		if (name == null || name.isEmpty()) {
			name = profile.name;
		}

		DiscoveredDevice d = new DiscoveredDevice(address, name, result.getRssi(), profile);
		discoveredDevices.put(address, d);
	}

	void handleNotification(Data data) {
		if (data == null || data.getValue() == null) {
			return;
		}
		byte[] bytes = data.getValue();
		JSObject payload = new JSObject();
		payload.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
		notifyListeners("dataReceived", payload);
	}

	private static class DiscoveredDevice {
		final String address;
		final String name;
		int rssi;
		final KnownDevice profile;

		DiscoveredDevice(String address, String name, int rssi, KnownDevice profile) {
			this.address = address;
			this.name = name;
			this.rssi = rssi;
			this.profile = profile;
		}
	}

	private static class KnownDevice {
		final String name;
		final String serviceUuid;
		final String writeUuid;
		final String notifyUuid;

		KnownDevice(String name, String serviceUuid, String writeUuid, String notifyUuid) {
			this.name = name;
			this.serviceUuid = serviceUuid;
			this.writeUuid = writeUuid;
			this.notifyUuid = notifyUuid;
		}
	}

	private static class BleBridgeManager extends BleManager {
		private final BetaflightBlePlugin plugin;
		private final UUID serviceUuid;
		private final UUID writeUuid;
		private final UUID notifyUuid;

		private BluetoothGattCharacteristic writeCharacteristic;
		private BluetoothGattCharacteristic notifyCharacteristic;

		BleBridgeManager(@NonNull Context context, BetaflightBlePlugin plugin, KnownDevice profile) {
			super(context);
			this.plugin = plugin;
			this.serviceUuid = UUID.fromString(profile.serviceUuid);
			this.writeUuid = UUID.fromString(profile.writeUuid);
			this.notifyUuid = UUID.fromString(profile.notifyUuid);
		}

		@NonNull
		@Override
		protected BleManagerGattCallback getGattCallback() {
			return new ManagerGattCallback();
		}

		private class ManagerGattCallback extends BleManagerGattCallback {
			@Override
			protected boolean isRequiredServiceSupported(@NonNull BluetoothGatt gatt) {
				BluetoothGattService service = gatt.getService(serviceUuid);
				if (service == null) {
					return false;
				}

				writeCharacteristic = service.getCharacteristic(writeUuid);
				notifyCharacteristic = service.getCharacteristic(notifyUuid);

				if (notifyCharacteristic != null && (notifyCharacteristic.getProperties() & BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0) {
					setNotificationCallback(notifyCharacteristic).with((device, data) -> plugin.handleNotification(data));
				}

				if (writeCharacteristic != null && (writeCharacteristic.getProperties() & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0) {
					writeCharacteristic.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE);
				}

				return writeCharacteristic != null && notifyCharacteristic != null;
			}

			@Override
			protected void initialize() {
				if (notifyCharacteristic != null) {
					enableNotifications(notifyCharacteristic).enqueue();
				}
			}

			@Override
			protected void onServicesInvalidated() {
				writeCharacteristic = null;
				notifyCharacteristic = null;
			}
		}

		WriteRequest send(byte[] data) {
			if (writeCharacteristic == null) {
				return null;
			}
			return writeCharacteristic(writeCharacteristic, data).split();
		}
	}
}
