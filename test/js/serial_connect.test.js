import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { serial } from "../../src/js/serial.js";

// A tiny fake protocol to simulate connect delays and openRequested
class FakeProtocol extends EventTarget {
    constructor() {
        super();
        this.connected = false;
        this.openRequested = false;
        this.connectionId = null;
        this._connectDelay = 100;
        this.getDevices = async () => [];
    }

    async connect(path, options) {
        if (this.openRequested) {
            throw new Error("connect already requested");
        }
        this.openRequested = true;
        // simulate async open
        await new Promise((resolve) => setTimeout(resolve, this._connectDelay));
        this.connected = true;
        this.openRequested = false;
        this.connectionId = path;
        this.dispatchEvent(new CustomEvent("connect", { detail: { path } }));
        return true;
    }

    async disconnect() {
        if (!this.connected) return true;
        this.connected = false;
        this.connectionId = null;
        this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
        return true;
    }

    getConnectedPort() {
        return this.connected ? { path: this.connectionId } : null;
    }
}

describe("serial connect concurrency and failure cases", () => {
    let fake;
    let originalWebSerial;
    let originalProtocol;

    beforeEach(() => {
        fake = new FakeProtocol();
        originalWebSerial = serial._webSerial;
        originalProtocol = serial._protocolMap.webserial;
        serial._webSerial = fake;
        serial._protocolMap.webserial = fake;
        serial._setupEventForwarding();
    });

    afterEach(() => {
        serial._webSerial = originalWebSerial;
        serial._protocolMap.webserial = originalProtocol;
        serial._setupEventForwarding();
        vi.restoreAllMocks();
    });

    it("queues concurrent connect calls so second caller waits", async () => {
        const t1 = Date.now();
        const p1 = serial.connect("COM1", { baudRate: 115200 });
        await new Promise((r) => setTimeout(r, 10));
        const p2 = serial.connect("COM1", { baudRate: 115200 });

        const r1 = await p1;
        const r2 = await p2;
        const elapsed = Date.now() - t1;

        expect(r1).toBe(true);
        expect(r2).toBe(true);
        // The second connect call should wait for the in-progress connect to finish,
        // so elapsed should be roughly >= one _connectDelay (allow some margin).
        const expected = Math.max(40, fake._connectDelay - 20);
        expect(elapsed).toBeGreaterThanOrEqual(expected);
    });

    // Protocol that simulates an async failure during connect
    class ThrowingProtocol extends EventTarget {
        constructor() {
            super();
            this.connected = false;
            this.openRequested = false;
            this.connectionId = null;
            this.getDevices = async () => [];
        }

        async connect(path, options) {
            if (this.openRequested) {
                throw new Error("connect already requested");
            }
            this.openRequested = true;
            // simulate a short async attempt then fail
            await new Promise((r) => setTimeout(r, 10));
            // mimic a failing open (reject)
            this.openRequested = false;
            throw new Error("simulated connect failure");
        }

        async disconnect() {
            if (!this.connected) return true;
            this.connected = false;
            this.connectionId = null;
            this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
            return true;
        }

        getConnectedPort() {
            return this.connected ? { path: this.connectionId } : null;
        }
    }

    it("resets protocol state and notifies disconnect when connect fails (including waiters)", async () => {
        // install the throwing protocol
        const original = serial._webSerial;
        const originalMap = { ...serial._protocolMap };
        const fakeThrow = new ThrowingProtocol();
        serial._webSerial = fakeThrow;
        serial._protocolMap.webserial = fakeThrow;
        serial._setupEventForwarding();

        const disconnectDetails = [];
        const onDisconnect = (e) => disconnectDetails.push(e.detail);
        serial.addEventListener("disconnect", onDisconnect);

        const cb1 = vi.fn();
        const cb2 = vi.fn();

        const p1 = serial.connect("COM1", { baudRate: 115200 }, cb1);
        await new Promise((r) => setTimeout(r, 2));
        const p2 = serial.connect("COM1", { baudRate: 115200 }, cb2);

        const r1 = await p1;
        const r2 = await p2;

        expect(r1).toBe(false);
        expect(r2).toBe(false);

        expect(fakeThrow.openRequested).toBe(false);
        expect(fakeThrow.connected).toBe(false);
        expect(fakeThrow.connectionId).toBe(null);

        expect(cb1).toHaveBeenCalledWith(false);
        expect(cb2).toHaveBeenCalledWith(false);

        expect(disconnectDetails.length).toBeGreaterThanOrEqual(1);
        expect(disconnectDetails[0]).toBe(false);

        serial.removeEventListener("disconnect", onDisconnect);

        // restore original
        serial._webSerial = original;
        serial._protocolMap = originalMap;
        serial._setupEventForwarding();
    });

    // Protocol that simulates an InvalidStateError during connect
    class InvalidStateProtocol extends EventTarget {
        constructor() {
            super();
            this.connected = false;
            this.openRequested = false;
            this.connectionId = null;
            this.getDevices = async () => [];
        }

        async connect(path, options) {
            if (this.openRequested) {
                throw new Error("connect already requested");
            }
            this.openRequested = true;
            // short async window
            await new Promise((r) => setTimeout(r, 5));
            this.openRequested = false;
            const err = new Error("already open");
            err.name = "InvalidStateError";
            throw err;
        }

        async disconnect() {
            if (!this.connected) return true;
            this.connected = false;
            this.connectionId = null;
            this.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
            return true;
        }

        getConnectedPort() {
            return this.connected ? { path: this.connectionId } : null;
        }
    }

    it("notifies waiters and resets state when InvalidStateError occurs", async () => {
        const original = serial._webSerial;
        const originalMap = { ...serial._protocolMap };
        const fakeInvalid = new InvalidStateProtocol();
        serial._webSerial = fakeInvalid;
        serial._protocolMap.webserial = fakeInvalid;
        serial._setupEventForwarding();

        const disconnectDetails = [];
        const onDisconnect = (e) => disconnectDetails.push(e.detail);
        serial.addEventListener("disconnect", onDisconnect);

        const cb1 = vi.fn();
        const cb2 = vi.fn();

        const p1 = serial.connect("COM1", { baudRate: 115200 }, cb1);
        await new Promise((r) => setTimeout(r, 2));
        const p2 = serial.connect("COM1", { baudRate: 115200 }, cb2);

        const r1 = await p1;
        const r2 = await p2;

        expect(r1).toBe(false);
        expect(r2).toBe(false);

        expect(fakeInvalid.openRequested).toBe(false);
        expect(fakeInvalid.connected).toBe(false);
        expect(fakeInvalid.connectionId).toBe(null);

        expect(cb1).toHaveBeenCalledWith(false);
        expect(cb2).toHaveBeenCalledWith(false);

        expect(disconnectDetails.length).toBeGreaterThanOrEqual(1);
        expect(disconnectDetails[0]).toBe(false);

        serial.removeEventListener("disconnect", onDisconnect);

        // restore original
        serial._webSerial = original;
        serial._protocolMap = originalMap;
        serial._setupEventForwarding();
    });

    it("disconnects from different port and reconnects when requested", async () => {
        // Start with fake connected to a different port
        fake.connected = true;
        fake.connectionId = "COM2";

        // spy on disconnect and connect
        const spyDisconnect = vi.spyOn(fake, "disconnect");
        const spyConnect = vi.spyOn(fake, "connect");

        const result = await serial.connect("COM1", { baudRate: 115200 });

        expect(spyDisconnect).toHaveBeenCalled();
        expect(spyConnect).toHaveBeenCalled();
        // after reconnect, serial.connect should return true
        expect(result).toBe(true);
        // verify fake now connected to requested path
        expect(fake.getConnectedPort().path).toEqual("COM1");
    });
});
