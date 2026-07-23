const VIRTUAL = "virtual";

/**
 * Stripped down version of previous nwjs based serial port implementation
 * which is required to still have virtual serial port support in the
 * browser.
 *
 * VirtualSerial now extends EventTarget and emits synthetic connect/disconnect
 * events, so the connection state can treat it like any other transport instead
 * of special-casing "virtual" everywhere.
 */
class VirtualSerial extends EventTarget {
    constructor() {
        super();
        this.connected = false;
        this.connectionId = false;
        this.bitrate = 0;
        this.bytesReceived = 0;
        this.bytesSent = 0;
        this.failed = 0;
        this.connectionType = VIRTUAL;
        this.transmitting = false;
        this.outputBuffer = [];
    }
    connect(_port, _options) {
        this.connected = true;
        this.connectionId = VIRTUAL;
        this.bitrate = 115200;
        // Synthetic connect: virtual has no underlying device, but emitting the
        // same events as a real transport lets the connection state drive it uniformly.
        this.dispatchEvent(new CustomEvent("connect", { detail: { connectionId: VIRTUAL } }));
        return true;
    }
    disconnect() {
        this.connected = false;
        this.outputBuffer = [];
        this.transmitting = false;
        if (this.connectionId) {
            this.connectionId = false;
            this.bitrate = 0;
            // Virtual disconnect is always intentional (no link to lose) -> CLOSED.
            this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
            return true;
        }
        return false;
    }
    getConnectedDevice() {
        return this.connectionId;
    }
    getDevices() {
        return new Promise((resolve) => {
            resolve([{ path: VIRTUAL }]);
        });
    }
}

export default VirtualSerial;
