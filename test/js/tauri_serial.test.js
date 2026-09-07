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

/** Every Channel the transport constructed, newest last. */
const channels = vi.hoisted(() => []);

vi.mock("@tauri-apps/api/core", () => ({
    invoke,
    Channel: class {
        constructor() {
            this.onmessage = () => {};
            channels.push(this);
        }
    },
}));

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

const commands = () => invoke.mock.calls.map(([cmd]) => cmd);
const argsFor = (cmd) => invoke.mock.calls.find(([name]) => name === cmd)?.[1];

/** The most recently constructed Channel — the one the call under test just handed the plugin. */
const lastChannel = () => channels.at(-1);

/**
 * Resolve every command as if PORT were present and openable. `watch` and
 * `watch_ports` resolve to channel ids, which the transport stores to unwatch.
 */
function mockPresentPort() {
    invoke.mockImplementation((cmd) => {
        if (cmd === "plugin:serialplugin|available_ports") {
            return Promise.resolve({ [PORT]: { type: "Usb", vid: "1155", pid: "22336" } });
        }
        if (cmd === "plugin:serialplugin|watch" || cmd === "plugin:serialplugin|watch_ports") {
            return Promise.resolve(1);
        }
        return Promise.resolve(undefined);
    });
}

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
        channels.length = 0;
        // _bootstrap() would subscribe to the port monitor asynchronously,
        // leaking a subscription into later tests; stub it out at the source.
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
        channels.length = 0;
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
        channels.length = 0;
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
        mockPresentPort();
        const serial = new TauriSerial();

        const connected = await serial.connect(PORT, { baudRate: 115200 });

        expect(connected).toBe(true);
        expect(commands()).toContain("plugin:serialplugin|open");
    });

    it("does not call the inert set_timeout command", async () => {
        // set_timeout is a no-op on 3.x: the RX hub owns the fd and every
        // command re-applies its own timeout to the guard before each op.
        mockPresentPort();
        const serial = new TauriSerial();

        const connected = await serial.connect(PORT, { baudRate: 115200 });

        expect(connected).toBe(true);
        expect(commands()).not.toContain("plugin:serialplugin|set_timeout");
    });

    it("subscribes to the byte stream rather than polling for it", async () => {
        mockPresentPort();
        const serial = new TauriSerial();

        await serial.connect(PORT, { baudRate: 115200 });

        expect(commands()).not.toContain("plugin:serialplugin|read_binary");
        expect(argsFor("plugin:serialplugin|watch")).toMatchObject({
            path: PORT,
            // raw keeps MSP out of the plugin's AT line router, which would
            // decode the bytes as UTF-8 and trim them; a zero flush interval
            // stops the hub holding a frame back for its batching window.
            options: { raw: true, serialDataFlushIntervalMs: 0 },
        });
    });

    it("fails the connection when the byte stream will not start", async () => {
        // The port would otherwise be left open with nothing reading it, and the
        // caller told the connection succeeded.
        invoke.mockImplementation((cmd) => {
            if (cmd === "plugin:serialplugin|available_ports") {
                return Promise.resolve({ [PORT]: { type: "Usb", vid: "1155", pid: "22336" } });
            }
            if (cmd === "plugin:serialplugin|watch") {
                return Promise.reject("watch already active");
            }
            return Promise.resolve(1);
        });
        const serial = new TauriSerial();
        const outcomes = [];
        serial.addEventListener("connect", (event) => outcomes.push(event.detail));

        const connected = await serial.connect(PORT, { baudRate: 115200 });

        expect(connected).toBe(false);
        expect(outcomes).toEqual([false]);
        expect(serial.connected).toBe(false);
        expect(serial.connectionId).toBe(null);
        expect(commands()).toContain("plugin:serialplugin|close");
    });

    it("suspends port enumeration for the life of the connection", async () => {
        // available_ports crosses into Kotlin and queries the USB service on a
        // single-threaded executor over the same bridge the reads and writes
        // use. Leaving it running underneath a live session wedged the bridge.
        mockPresentPort();
        const serial = new TauriSerial();
        const stop = vi.spyOn(serial, "stopDeviceMonitoring");

        await serial.connect(PORT, { baudRate: 115200 });

        expect(stop).toHaveBeenCalled();
    });

    it("resumes port enumeration after disconnecting", async () => {
        // The snapshot the monitor sends on subscribe is what reports a device
        // unplugged while the port was open, which the reconnect cycle waits on.
        mockPresentPort();
        const serial = new TauriSerial();
        await serial.connect(PORT, { baudRate: 115200 });
        // The describe-level stub keeps _bootstrap() from subscribing; from here
        // the real subscribe path is the behaviour under test.
        TauriSerial.prototype.startDeviceMonitoring.mockRestore();
        invoke.mockClear();

        await serial.disconnect();

        expect(commands()).toContain("plugin:serialplugin|watch_ports");
        expect(serial.portListChannelId).toBe(1);
    });
});

describe("TauriSerial receive", () => {
    beforeEach(() => {
        invoke.mockReset();
        channels.length = 0;
        vi.spyOn(TauriSerial.prototype, "startDeviceMonitoring").mockImplementation(() => {});
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    /** A connected TauriSerial plus the channel the plugin would push events on. */
    async function watched() {
        mockPresentPort();
        const serial = new TauriSerial();
        await serial.connect(PORT, { baudRate: 115200 });
        return { serial, channel: lastChannel() };
    }

    it("dispatches the bytes verbatim", async () => {
        // The bytes the plugin's text path would have eaten: a NUL, the
        // whitespace its trim strips, and a pair that is not valid UTF-8.
        const payload = [0x24, 0x4d, 0x3e, 0x00, 0x09, 0x0d, 0x0a, 0x20, 0xff, 0xfe];
        const { serial, channel } = await watched();
        const received = [];
        serial.addEventListener("receive", (event) => received.push(event.detail));

        channel.onmessage({ kind: "data", path: PORT, data: payload, size: payload.length });

        expect(received).toHaveLength(1);
        expect([...received[0]]).toEqual(payload);
    });

    it("counts the bytes it received", async () => {
        const { serial, channel } = await watched();

        channel.onmessage({ kind: "data", path: PORT, data: [1, 2, 3], size: 3 });

        expect(serial.bytesReceived).toBe(3);
    });

    it("drops an event that arrives after the port closed", async () => {
        // A channel still in flight when the port closed would otherwise inject
        // its bytes into whatever session comes next.
        const { serial, channel } = await watched();
        const received = [];
        serial.addEventListener("receive", (event) => received.push(event.detail));
        await serial.disconnect();

        channel.onmessage({ kind: "data", path: PORT, data: [1, 2, 3], size: 3 });

        expect(received).toEqual([]);
    });

    it("tears the connection down on a disconnect event", async () => {
        const { serial, channel } = await watched();

        channel.onmessage({ kind: "disconnect", path: PORT, reason: "Serial port disconnected" });

        // disconnect() is not awaited from the event handler, so the teardown
        // lands over the following microtasks.
        await vi.waitFor(() => expect(commands()).toContain("plugin:serialplugin|close"));
        expect(serial.connected).toBe(false);
    });

    it("keeps the connection on a transient read error", async () => {
        const { serial, channel } = await watched();

        channel.onmessage({ kind: "error", path: PORT, message: "Serial read error: temporary" });

        expect(serial.connected).toBe(true);
    });

    it("unwatches the stream when disconnecting", async () => {
        const { serial } = await watched();
        const channelId = serial.dataChannelId;

        await serial.disconnect();

        expect(argsFor("plugin:serialplugin|unwatch")).toEqual({ channelId });
        expect(serial.dataChannelId).toBe(null);
    });
});

describe("TauriSerial hotplug", () => {
    const STM32 = { type: "Usb", vid: "1155", pid: "22336" };

    beforeEach(() => {
        invoke.mockReset();
        channels.length = 0;
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    /** A TauriSerial subscribed to the port monitor, with the events it emitted. */
    async function monitored(initialPorts = {}) {
        invoke.mockImplementation((cmd) =>
            Promise.resolve(cmd === "plugin:serialplugin|available_ports" ? initialPorts : 7),
        );
        const serial = new TauriSerial();
        await vi.waitFor(() => expect(serial.portListChannelId).toBe(7));

        const events = [];
        for (const name of ["addedDevice", "removedDevice"]) {
            serial.addEventListener(name, (event) => events.push([name, event.detail.path]));
        }
        return { serial, channel: lastChannel(), events };
    }

    it("reports a device that appeared", async () => {
        const { channel, events } = await monitored();

        channel.onmessage({ kind: "added", path: PORT, info: STM32 });

        expect(events).toEqual([["addedDevice", PORT]]);
    });

    it("reports a device that went away", async () => {
        const { channel, events } = await monitored({ [PORT]: STM32 });

        channel.onmessage({ kind: "removed", path: PORT });

        expect(events).toEqual([["removedDevice", PORT]]);
    });

    it("reconciles a snapshot against the ports it knew about", async () => {
        // The monitor sends a snapshot on every subscribe, and the transport
        // resubscribes on disconnect. That snapshot is what reports a device
        // unplugged while the port was open, which the reconnect cycle waits on.
        const { channel, events } = await monitored({ [PORT]: STM32 });

        channel.onmessage({ kind: "snapshot", ports: {} });

        expect(events).toEqual([["removedDevice", PORT]]);
    });

    it("stays silent for a device it does not recognise", async () => {
        const { channel, events } = await monitored();

        channel.onmessage({ kind: "added", path: "/dev/ttyS0", info: { vid: "Unknown", pid: "Unknown" } });

        expect(events).toEqual([]);
    });

    it("stays silent when a snapshot changes nothing", async () => {
        const { channel, events } = await monitored({ [PORT]: STM32 });

        channel.onmessage({ kind: "snapshot", ports: { [PORT]: STM32 } });

        expect(events).toEqual([]);
    });

    it("does not list a port twice when told it was added twice", async () => {
        const { serial, channel } = await monitored();

        channel.onmessage({ kind: "added", path: PORT, info: STM32 });
        channel.onmessage({ kind: "added", path: PORT, info: STM32 });

        expect(serial.ports.map((port) => port.path)).toEqual([PORT]);
    });

    it("drops a port-list event that arrives after the monitor was torn down", async () => {
        // connect() suspends the monitor. A channel still in flight would
        // otherwise report a removal underneath the open port, which the
        // reconnect cycle acts on.
        const { serial, channel, events } = await monitored({ [PORT]: STM32 });

        await serial.stopDeviceMonitoring();
        channel.onmessage({ kind: "removed", path: PORT });

        expect(events).toEqual([]);
        expect(serial.ports.map((port) => port.path)).toEqual([PORT]);
    });

    it("ignores the previous subscription once the monitor has restarted", async () => {
        const { serial, channel, events } = await monitored({ [PORT]: STM32 });

        await serial.stopDeviceMonitoring();
        await serial.startDeviceMonitoring();
        channel.onmessage({ kind: "snapshot", ports: {} });

        expect(events).toEqual([]);
        expect(lastChannel()).not.toBe(channel);
    });

    it("waits for an in-flight subscribe before tearing the monitor down", async () => {
        // Otherwise the subscribe stores its channel id after the teardown read
        // it, and the monitor keeps enumerating for the whole connection.
        let resolveWatch;
        invoke.mockImplementation((cmd) => {
            if (cmd === "plugin:serialplugin|watch_ports") {
                return new Promise((resolve) => {
                    resolveWatch = resolve;
                });
            }
            return Promise.resolve(undefined);
        });
        const serial = new TauriSerial();
        await vi.waitFor(() => expect(resolveWatch).toBeDefined());

        const stopped = serial.stopDeviceMonitoring();
        resolveWatch(7);
        await stopped;

        expect(argsFor("plugin:serialplugin|unwatch_ports")).toEqual({ channelId: 7 });
        expect(serial.portListChannelId).toBe(null);
    });
});
