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
    serialDevices: [{ vendorId: 0x0483, productId: 0x5740 }],
    vendorIdNames: { 0x2e3c: "AT32", 0x0483: "STM32" },
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
    // Fatal-error paths fire disconnect() un-awaited; its teardown settles a
    // real 50 ms timer before logging. Track the promises here so afterEach
    // can await them: the trailing logs then land inside the test instead of
    // after vitest closes the worker RPC ("Closing rpc while
    // onUserConsoleLog was pending", #5418).
    /** @type {Set<Promise<unknown>>} */
    let pendingDisconnects;

    beforeEach(() => {
        pendingDisconnects = new Set();
        invoke.mockReset();
        // _bootstrap() would start the 1 s device monitor asynchronously,
        // leaking an interval into later tests; stub it out at the source.
        vi.spyOn(TauriSerial.prototype, "startDeviceMonitoring").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
        const original = TauriSerial.prototype.disconnect;
        vi.spyOn(TauriSerial.prototype, "disconnect").mockImplementation(function (...args) {
            const result = original.apply(this, args);
            pendingDisconnects.add(result);
            result.finally(() => pendingDisconnects.delete(result));
            return result;
        });
    });

    afterEach(async () => {
        await Promise.allSettled(pendingDisconnects);
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
        mockWrites("Failed to write binary data: Input/output error");
        const serial = connectedSerial();

        const result = await serial.send(new Uint8Array([1, 2, 3]));

        expect(result).toEqual({ bytesSent: 0 });
        expect(writeCalls()).toHaveLength(1);
        // Not a dead link — an I/O hiccup leaves the port open.
        expect(serial.connected).toBe(true);
    });

    it("tears the connection down once the plugin has dropped the port", async () => {
        // A flight controller re-enumerates on every reboot, and on Android the
        // path is the USB device node, so it never comes back. Without this the
        // MSP queue keeps writing to a dead path until the 1 s hotplug poll
        // catches up, which reads as a hang.
        mockWrites("Port '/dev/ttyACM0' not found");
        const serial = connectedSerial();

        const result = await serial.send(new Uint8Array([1, 2, 3]));

        expect(result).toEqual({ bytesSent: 0 });
        expect(serial.connected).toBe(false);
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

describe("TauriSerial port enumeration", () => {
    // The plugin's two backends format the USB IDs differently: the desktop
    // serialport enumerator stringifies them as decimal, the Android USB bridge
    // as hex. Both must survive into the known-device filter, or the transport
    // reports no ports at all on that platform.
    const STM32_VCP = { type: "Usb", manufacturer: "Betaflight", product: "SPEEDYBEEF405MINI" };

    beforeEach(() => {
        invoke.mockReset();
        vi.spyOn(TauriSerial.prototype, "startDeviceMonitoring").mockImplementation(() => {});
        vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    /** Resolve available_ports with `portsMap` and return the filtered port list. */
    async function listPorts(portsMap) {
        invoke.mockImplementation((cmd) =>
            Promise.resolve(cmd === "plugin:serialplugin|available_ports" ? portsMap : undefined),
        );
        return new TauriSerial().getDevices();
    }

    it("parses the decimal IDs the desktop backend reports", async () => {
        const ports = await listPorts({ "/dev/ttyACM0": { ...STM32_VCP, vid: "1155", pid: "22336" } });

        expect(ports).toHaveLength(1);
        expect(ports[0]).toMatchObject({ path: "/dev/ttyACM0", vendorId: 0x0483, productId: 0x5740 });
    });

    it("parses the hex IDs the Android backend reports", async () => {
        const ports = await listPorts({ "/dev/bus/usb/002/003": { ...STM32_VCP, vid: "0x0483", pid: "0x5740" } });

        expect(ports).toHaveLength(1);
        expect(ports[0]).toMatchObject({
            path: "/dev/bus/usb/002/003",
            vendorId: 0x0483,
            productId: 0x5740,
            displayName: "Betaflight STM32",
        });
    });

    it("drops a port whose IDs are unknown rather than reading them as zero", async () => {
        const ports = await listPorts({ "/dev/ttyS0": { type: "Unknown", vid: "Unknown", pid: "Unknown" } });

        expect(ports).toEqual([]);
    });

    it("drops a port whose IDs are only partly numeric", async () => {
        // parseInt stops at the first invalid character, so a lenient parse would
        // read "1155unknown" as 1155 and promote an unrecognised device into the
        // known-device list.
        const ports = await listPorts({ "/dev/ttyS0": { ...STM32_VCP, vid: "1155unknown", pid: "22336" } });

        expect(ports).toEqual([]);
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

    it("refuses to open a path the transport no longer lists", async () => {
        // Opening a vanished USB node makes the plugin's Kotlin bridge throw, and
        // its JNI wrapper leaves that exception pending, wedging every later call
        // over the bridge. The reconnect after "Save and Reboot" aims at exactly
        // such a stale path, so the open must not be attempted at all.
        invoke.mockImplementation((cmd) =>
            Promise.resolve(cmd === "plugin:serialplugin|available_ports" ? {} : undefined),
        );
        const serial = new TauriSerial();

        const connected = await serial.connect(PORT, { baudRate: 115200 });

        expect(connected).toBe(false);
        expect(invoke.mock.calls.map(([cmd]) => cmd)).not.toContain("plugin:serialplugin|open");
        // The flag must clear, or every later connect is refused as "already requested".
        expect(serial.openRequested).toBe(false);
    });

    it("opens a path that is still present", async () => {
        invoke.mockImplementation((cmd) => {
            if (cmd === "plugin:serialplugin|available_ports") {
                return Promise.resolve({ [PORT]: { type: "Usb", vid: "1155", pid: "22336" } });
            }
            if (cmd === "plugin:serialplugin|read_binary") {
                return Promise.resolve([]);
            }
            return Promise.resolve(undefined);
        });
        const serial = new TauriSerial();

        const connected = await serial.connect(PORT, { baudRate: 115200 });
        serial.reading = false;

        expect(connected).toBe(true);
        expect(invoke.mock.calls.map(([cmd]) => cmd)).toContain("plugin:serialplugin|open");
    });

    it("does not call the inert set_timeout command", async () => {
        // set_timeout is a no-op on 3.x: the RX hub owns the fd and every
        // command re-applies its own timeout to the guard before each op.
        invoke.mockImplementation((cmd) => {
            if (cmd === "plugin:serialplugin|read_binary") {
                return Promise.resolve([]);
            }
            if (cmd === "plugin:serialplugin|available_ports") {
                return Promise.resolve({ [PORT]: { type: "Usb", vid: "1155", pid: "22336" } });
            }
            return Promise.resolve(undefined);
        });
        const serial = new TauriSerial();

        const connected = await serial.connect(PORT, { baudRate: 115200 });
        serial.reading = false;

        expect(connected).toBe(true);
        expect(invoke.mock.calls.map(([cmd]) => cmd)).not.toContain("plugin:serialplugin|set_timeout");
    });

    it("polls for more bytes than the plugin's RX chunk can hold", async () => {
        // The plugin's RX hub reads the port into a 1024-byte buffer and hands
        // the whole chunk to the pending read slot, which keeps only what fits
        // in the requested size and drops the remainder instead of buffering
        // it. A request below one hub chunk therefore truncates every burst
        // above it — MSP_BOXNAMES (~500 bytes) fails its CRC and the stream
        // never resynchronises.
        invoke.mockImplementation((cmd) => {
            if (cmd === "plugin:serialplugin|read_binary") {
                return Promise.resolve([]);
            }
            if (cmd === "plugin:serialplugin|available_ports") {
                return Promise.resolve({ [PORT]: { type: "Usb", vid: "1155", pid: "22336" } });
            }
            return Promise.resolve(undefined);
        });
        const serial = new TauriSerial();

        await serial.connect(PORT, { baudRate: 115200 });
        serial.reading = false;

        const read = invoke.mock.calls.find(([cmd]) => cmd === "plugin:serialplugin|read_binary");
        expect(read).toBeDefined();
        expect(read[1].size).toBeGreaterThan(1024);
    });
});
