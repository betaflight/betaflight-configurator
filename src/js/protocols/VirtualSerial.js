import { LinkEvent } from "./LinkEvent.js";

const VIRTUAL = "virtual";

/**
 * Stripped down version of previous nwjs based serial port implementation
 * which is required to still have virtual serial port support in the
 * browser.
 *
 * S6e: VirtualSerial now extends EventTarget and emits synthetic
 * connect/disconnect (+ normalized open/closed LinkEvents) plus the reconnect
 * token contract, so the FSM can treat it like any other transport instead of
 * special-casing "virtual" everywhere.
 */
class VirtualSerial extends EventTarget {
    supportsLinkEvents = true;

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
        // same events as a real transport lets the FSM drive it uniformly.
        this.dispatchEvent(new CustomEvent("connect", { detail: { connectionId: VIRTUAL } }));
        this.dispatchEvent(new CustomEvent(LinkEvent.OPEN, { detail: { connectionId: VIRTUAL } }));
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
            this.dispatchEvent(new CustomEvent(LinkEvent.CLOSED, { detail: true }));
            return true;
        }
        return false;
    }
    getConnectedPort() {
        return this.connectionId;
    }
    getDevices() {
        return new Promise((resolve) => {
            resolve([{ path: VIRTUAL }]);
        });
    }

    /**
     * S6e: reconnect token for the virtual transport. `isVirtual` lets the FSM
     * short-circuit transport resolution — there is nothing to re-enumerate.
     */
    getReconnectToken() {
        if (!this.connected) {
            return null;
        }
        return { transportType: VIRTUAL, opaqueId: VIRTUAL, baud: this.bitrate, isVirtual: true };
    }

    resolveReconnectTarget(token) {
        if (!token || token.transportType !== VIRTUAL) {
            return null;
        }
        return VIRTUAL;
    }
}

export default VirtualSerial;
