package com.betaflight.dfu

/**
 * Static JNI facade: Rust calls these to enumerate, request permission and
 * obtain/close the device fd. Everything else (claiming, control transfers,
 * reset) happens in Rust via nusb on a duplicated fd.
 */
object DfuNative {
    @Volatile
    private var bridge: DfuFdBridge? = null

    @JvmStatic
    fun bind(b: DfuFdBridge) {
        bridge = b
        nativeInit()
    }

    @JvmStatic
    private external fun nativeInit()

    private fun usb(): DfuFdBridge =
        bridge ?: throw IllegalStateException("DfuNative not bound")

    @JvmStatic
    fun enumerateJson(): String = usb().runOnIoSync<String> { usb().enumerateJson() }

    @JvmStatic
    fun requestPermission(deviceName: String): Boolean =
        usb().runOnIoSync<Boolean> { usb().requestPermission(deviceName) }

    @JvmStatic
    fun openDeviceFd(deviceName: String): Int =
        usb().runOnIoSync<Int> { usb().openDeviceFd(deviceName) }

    @JvmStatic
    fun closeDeviceFd(deviceName: String) {
        usb().runOnIoSync<Unit> { usb().closeDeviceFd(deviceName) }
    }
}
