package com.betaflight.dfu

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

/**
 * USB fd provider for the Rust side of the DFU plugin.
 *
 * All UsbManager work is serialised on one daemon thread ([runOnIoSync]); the
 * permission broadcast arrives on the main thread and completes the future the
 * IO thread is blocked on.
 */
class DfuFdBridge(private val context: Context) {

    companion object {
        private const val TAG = "BetaflightDfu"

        // Distinct from the serial plugin's action so the two USB permission
        // receivers never see each other's broadcasts.
        private const val ACTION_USB_PERMISSION = "com.betaflight.dfu.USB_PERMISSION"
    }

    @Volatile
    private var shutDown = false

    private val ioExecutor: ExecutorService =
        Executors.newSingleThreadExecutor { r -> Thread(r, "dfu-fd-io").apply { isDaemon = true } }
    private val usbManager = context.getSystemService(Context.USB_SERVICE) as? UsbManager
    private val connections = ConcurrentHashMap<String, UsbDeviceConnection>()
    private val permissionFutures = ConcurrentHashMap<String, CompletableFuture<Boolean>>()

    private val usbReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            when (intent.action) {
                ACTION_USB_PERMISSION -> {
                    val device = deviceFromIntent(intent)
                    val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                    device?.deviceName?.let { permissionFutures[it]?.complete(granted) }
                }
                UsbManager.ACTION_USB_DEVICE_DETACHED -> {
                    // Close on the IO thread so a detach arriving while
                    // openDeviceFd is mid-flight cannot run before the
                    // connection is cached and leave a stale entry behind.
                    deviceFromIntent(intent)?.deviceName?.let { deviceName ->
                        try {
                            ioExecutor.execute { closeDeviceFd(deviceName) }
                        } catch (_: java.util.concurrent.RejectedExecutionException) {
                            closeDeviceFd(deviceName)
                        }
                    }
                }
            }
        }
    }

    init {
        val filter = IntentFilter(ACTION_USB_PERMISSION).apply {
            addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
        }
        // Not exported: the permission result is this app's own PendingIntent
        // (attributed to our uid) and DETACHED comes from system_server, which
        // is exempt from the receiver-permission gate — both reach a
        // non-exported receiver on every supported API level, and non-export
        // keeps co-installed apps from spoofing a permission denial.
        ContextCompat.registerReceiver(
            context, usbReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED,
        )
    }

    fun shutdown() {
        shutDown = true
        try {
            ioExecutor.execute {
                try {
                    connections.keys.toList().forEach { closeDeviceFd(it) }
                } finally {
                    try {
                        context.unregisterReceiver(usbReceiver)
                    } catch (_: IllegalArgumentException) {
                        // Receiver already unregistered.
                    }
                    ioExecutor.shutdown()
                }
            }
        } catch (_: java.util.concurrent.RejectedExecutionException) {
            connections.keys.toList().forEach { closeDeviceFd(it) }
            try {
                context.unregisterReceiver(usbReceiver)
            } catch (_: IllegalArgumentException) {
                // Receiver already unregistered.
            }
        }
    }

    fun <T> runOnIoSync(block: () -> T): T {
        if (shutDown) throw IOException("DFU fd bridge shut down")
        return CompletableFuture.supplyAsync(block, ioExecutor).get()
    }

    fun enumerateJson(): String {
        val mgr = usbManager ?: run {
            Log.w(TAG, "enumerateJson: no UsbManager")
            return JSONObject().put("devices", JSONArray()).toString()
        }
        val devices = JSONArray()
        mgr.deviceList.values.forEach { device ->
            try {
                devices.put(deviceInfo(mgr, device))
            } catch (e: Exception) {
                Log.e(TAG, "enumerateJson: skip ${device.deviceName}: ${e.message}", e)
            }
        }
        return JSONObject().put("devices", devices).toString()
    }

    fun requestPermission(deviceName: String): Boolean {
        val mgr = usbManager ?: throw IOException("no UsbManager")
        val device = mgr.deviceList.values.find { it.deviceName == deviceName }
            ?: throw IOException("device not found: $deviceName")
        if (mgr.hasPermission(device)) return true
        return awaitPermission(mgr, device)
    }

    fun openDeviceFd(deviceName: String): Int {
        connections[deviceName]?.let { return it.fileDescriptor }
        val mgr = usbManager ?: throw IOException("no UsbManager")
        val device = mgr.deviceList.values.find { it.deviceName == deviceName }
            ?: throw IOException("device not found: $deviceName")
        if (!mgr.hasPermission(device) && !awaitPermission(mgr, device)) {
            throw IOException("USB permission denied for $deviceName")
        }
        // Do NOT claimInterface here — Rust's nusb detach_and_claim owns
        // claiming; a Kotlin pre-claim makes the fd report "interface busy".
        val conn = mgr.openDevice(device) ?: throw IOException("open failed: $deviceName")
        connections[deviceName] = conn
        Log.i(TAG, "openDeviceFd $deviceName fd=${conn.fileDescriptor} (unclaimed for nusb)")
        return conn.fileDescriptor
    }

    fun closeDeviceFd(deviceName: String) {
        connections.remove(deviceName)?.close()
    }

    private fun awaitPermission(mgr: UsbManager, device: UsbDevice): Boolean {
        val name = device.deviceName
        val fut = CompletableFuture<Boolean>()
        permissionFutures[name] = fut
        // Explicit package + mutable flag: the system fills in EXTRA_DEVICE /
        // EXTRA_PERMISSION_GRANTED, and Android 14 requires explicit intents
        // for mutable PendingIntents.
        val intent = Intent(ACTION_USB_PERMISSION).apply { setPackage(context.packageName) }
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            PendingIntent.FLAG_MUTABLE
        } else {
            0
        }
        val pi = PendingIntent.getBroadcast(context, name.hashCode(), intent, flags)
        mgr.requestPermission(device, pi)
        return try {
            fut.get(30, TimeUnit.SECONDS)
        } catch (_: TimeoutException) {
            false
        } finally {
            permissionFutures.remove(name)
        }
    }

    private fun deviceInfo(mgr: UsbManager, device: UsbDevice): JSONObject {
        fun safeName(block: () -> String?): String = try {
            block() ?: ""
        } catch (e: SecurityException) {
            Log.w(TAG, "deviceInfo string denied for ${device.deviceName}: ${e.message}")
            ""
        }
        val hasPermission = mgr.hasPermission(device)
        return JSONObject()
            .put("deviceName", device.deviceName)
            .put("vendorId", device.vendorId)
            .put("productId", device.productId)
            // Reading the serial without permission throws SecurityException on
            // API 29+, and enumeration runs every second from the JS monitor.
            .put("serialNumber", if (hasPermission) safeName { device.serialNumber } else "")
            .put("productName", safeName { device.productName })
            .put("manufacturerName", safeName { device.manufacturerName })
            .put("hasPermission", hasPermission)
    }

    private fun deviceFromIntent(intent: Intent): UsbDevice? =
        if (Build.VERSION.SDK_INT >= 33) {
            intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
        }
}
