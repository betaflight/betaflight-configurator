import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// TauriSerial write path under tauri-plugin-serialplugin 3.x.
//
// 3.x spawns a background RX hub thread on open() that becomes the sole reader
// of the fd and holds the port mutex through each 10 ms poll. A write that
// loses that race fails with "serial port lock timeout after 250 ms" — a real,
// rare failure measured against a PTY pair, and one that cannot happen on 2.x.
//
// The plugin returns that error before it touches the port, so no bytes reached
// the device and the chunk can be resent. These tests pin that one retry, and
// pin that it stays bounded and does not swallow other write errors.
// ---------------------------------------------------------------------------

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

vi.mock("../../src/js/protocols/devices", () => ({
    serialDevices: [],
    vendorIdNames: { 0x2e3c: "AT32" },
}));

vi.mock("../../src/js/gui", () => ({
    default: { operating_system: "Linux" },
}));

const { default: TauriSerial } = await import("../../src/js/protocols/TauriSerial");

const LOCK_TIMEOUT = "serial port lock timeout after 250 ms";
const PORT = "/dev/ttyACM0";

/**
 * Queue outcomes for write_binary only. The constructor starts device
 * monitoring, which issues its own invokes, so call-order mocking would hand
 * the port-poll a write's result. The last outcome repeats.
 */
function mockWrites(...outcomes) {
    let call = 0;
    invoke.mockImplementation((cmd) => {
        if (cmd !== "plugin:serialplugin|write_binary") {
            return Promise.resolve(cmd === "plugin:serialplugin|available_ports" ? {} : undefined);
        }
        const outcome = outcomes[Math.min(call++, outcomes.length - 1)];
        return typeof outcome === "string" ? Promise.reject(outcome) : Promise.resolve(outcome);
    });
}

/** A TauriSerial already past connect(), with no read or monitor loop running. */
function connectedSerial() {
    const serial = new TauriSerial();
    serial.connected = true;
    serial.connectionId = PORT;
    serial.connectionInfo = { connectionId: PORT, bitrate: 115200 };
    return serial;
}

const writeCalls = () => invoke.mock.calls.filter(([cmd]) => cmd === "plugin:serialplugin|write_binary");

describe("TauriSerial write lock timeout", () => {
    beforeEach(() => {
        invoke.mockReset();
        // _bootstrap() would start the 1 s device monitor asynchronously,
        // leaking an interval into later tests; stub it out at the source.
        vi.spyOn(TauriSerial.prototype, "startDeviceMonitoring").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("resends the chunk once and reports the full length", async () => {
        mockWrites(LOCK_TIMEOUT, 4);
        const serial = connectedSerial();
        const callback = vi.fn();

        const result = await serial.send(new Uint8Array([1, 2, 3, 4]), callback);

        expect(result).toEqual({ bytesSent: 4 });
        expect(callback).toHaveBeenCalledWith({ bytesSent: 4 });
        expect(writeCalls()).toHaveLength(2);
        // The resend must carry the same bytes, not a rebuilt or empty buffer.
        expect(writeCalls()[1][1]).toEqual({ path: PORT, value: [1, 2, 3, 4] });
        expect(serial.transmitting).toBe(false);
    });

    it("gives up after one retry rather than looping", async () => {
        mockWrites(LOCK_TIMEOUT);
        const serial = connectedSerial();

        const result = await serial.send(new Uint8Array([1, 2, 3]));

        expect(result).toEqual({ bytesSent: 0 });
        expect(writeCalls()).toHaveLength(2);
        // A lock timeout is contention, not a dead link — the port stays open.
        expect(serial.connected).toBe(true);
    });

    it("does not retry an unrelated write error", async () => {
        mockWrites("Port '/dev/ttyACM0' not found");
        const serial = connectedSerial();

        const result = await serial.send(new Uint8Array([1, 2, 3]));

        expect(result).toEqual({ bytesSent: 0 });
        expect(writeCalls()).toHaveLength(1);
    });

    it("still tears the connection down on a broken pipe", async () => {
        mockWrites("Serial port disconnected: Broken pipe");
        const serial = connectedSerial();

        const result = await serial.send(new Uint8Array([1, 2, 3]));

        expect(result).toEqual({ bytesSent: 0 });
        expect(writeCalls()).toHaveLength(1);
        expect(serial.connected).toBe(false);
    });

    it("retries only the failing chunk in batch write mode", async () => {
        // AT32 on macOS splits writes into 63-byte chunks; a retry must not
        // resend chunks that already reached the device.
        mockWrites(63, LOCK_TIMEOUT, 63);
        const serial = connectedSerial();
        serial.isNeedBatchWrite = true;

        const result = await serial.send(new Uint8Array(126).fill(7));

        expect(result).toEqual({ bytesSent: 126 });
        expect(writeCalls()).toHaveLength(3);
        expect(writeCalls()[1][1].value).toEqual(writeCalls()[2][1].value);
    });

    it("does not resend into a new session after a disconnect and reconnect", async () => {
        const serial = connectedSerial();
        invoke.mockImplementation((cmd) => {
            if (cmd !== "plugin:serialplugin|write_binary") {
                return Promise.resolve(cmd === "plugin:serialplugin|available_ports" ? {} : undefined);
            }
            // While the plugin held the write, the user disconnected and
            // reconnected to the same path: a fresh session, same connectionId.
            serial.connectionInfo = { connectionId: PORT, bitrate: 115200 };
            return Promise.reject(LOCK_TIMEOUT);
        });

        const result = await serial.send(new Uint8Array([1, 2, 3]));

        expect(result).toEqual({ bytesSent: 0 });
        expect(writeCalls()).toHaveLength(1);
    });
});

describe("TauriSerial connect", () => {
    beforeEach(() => {
        invoke.mockReset();
        vi.spyOn(TauriSerial.prototype, "startDeviceMonitoring").mockImplementation(() => {});
        vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("does not call the inert set_timeout command", async () => {
        // set_timeout is a no-op on 3.x: the RX hub owns the fd and every
        // command re-applies its own timeout to the guard before each op.
        invoke.mockImplementation((cmd) => {
            if (cmd === "plugin:serialplugin|read_binary") {
                return Promise.resolve([]);
            }
            if (cmd === "plugin:serialplugin|available_ports") {
                return Promise.resolve({});
            }
            return Promise.resolve(undefined);
        });
        const serial = new TauriSerial();

        const connected = await serial.connect(PORT, { baudRate: 115200 });
        serial.reading = false;

        expect(connected).toBe(true);
        expect(invoke.mock.calls.map(([cmd]) => cmd)).not.toContain("plugin:serialplugin|set_timeout");
    });
});
