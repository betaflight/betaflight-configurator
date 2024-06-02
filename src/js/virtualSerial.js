const VIRTUAL = "virtual";

/**
 * Stripped down version of our nwjs based serial port implementation
 * which is required to still have virtual serial port support in the
 * browser.
 */
class VirtualSerial {
    constructor() {
        this.connected = false;
        this.connectionId = false;
        this.openCanceled = false;
        this.bitrate = 0;
        this.bytesReceived = 0;
        this.bytesSent = 0;
        this.failed = 0;
        this.connectionType = VIRTUAL;
        this.transmitting = false;
        this.outputBuffer = [];
    }
    connect(callback) {
        if (!this.openCanceled) {
            this.connected = true;
            this.connectionId = "virtual";
            this.bitrate = 115200;
            callback();
        }
    }
    disconnect(callback) {
        this.connected = false;
        this.outputBuffer = [];
        this.transmitting = false;
        if (this.connectionId) {
            this.connectionId = false;
            this.bitrate = 0;
            if (callback) {
                callback(true);
            }
        }
    }
}

export default new VirtualSerial();
