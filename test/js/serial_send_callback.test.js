import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// serial.send() callback contract.
//
// The facade used to pass `callback` down into the protocol AND invoke it
// itself. Every transport fires the callback on each of its own exit paths, so
// the caller's callback ran twice per send. That is not cosmetic: AutoBackup
// passes `onClose` as a send callback, so a double call disconnected twice and
// logged "serial port closed" twice.
//
// The contract pinned here: the facade is the single owner of the callback.
// Protocols are handed no callback and are the single source of the byte count.
// ---------------------------------------------------------------------------

vi.mock("../../src/js/utils/checkCompatibility.js", () => ({
    isAndroid: () => false,
    isTauri: () => false,
    isTauriIOS: () => false,
    isTauriAndroid: () => false,
}));

const stub = (tag) =>
    ({
        [tag]: class extends EventTarget {},
    })[tag];

vi.mock("../../src/js/protocols/WebSerial.js", () => ({ default: stub("WebSerial") }));
vi.mock("../../src/js/protocols/WebBluetooth.js", () => ({ default: stub("WebBluetooth") }));
vi.mock("../../src/js/protocols/WebSocket.js", () => ({ default: stub("Websocket") }));
vi.mock("../../src/js/protocols/VirtualSerial.js", () => ({ default: stub("VirtualSerial") }));
vi.mock("../../src/js/protocols/CapacitorSerial.js", () => ({ default: stub("CapacitorSerial") }));
vi.mock("../../src/js/protocols/CapacitorBle.js", () => ({ default: stub("CapacitorBle") }));
vi.mock("../../src/js/protocols/CapacitorTcp.js", () => ({ default: stub("CapacitorTcp") }));
vi.mock("../../src/js/protocols/TauriSerial.js", () => ({ default: stub("TauriSerial") }));
vi.mock("../../src/js/protocols/TauriTcp.js", () => ({ default: stub("TauriTcp") }));
vi.mock("../../src/js/protocols/TauriBle.js", () => ({ default: stub("TauriBle") }));

let serial;
// The singleton builds its slot table at module load.
async function loadSerial() {
    vi.resetModules();
    ({ serial } = await import("../../src/js/serial.js"));
}

/**
 * A transport that behaves like the real ones: it fires whatever callback it is
 * handed, on every exit path. If the facade still passed one down, that is what
 * would produce the second invocation.
 */
function fakeProtocol({ bytesSent = 0, throws = false, hasSend = true } = {}) {
    const proto = { receivedCallbacks: [] };
    if (hasSend) {
        proto.send = vi.fn(async (data, cb) => {
            proto.receivedCallbacks.push(cb);
            cb?.({ error: null, bytesSent });
            if (throws) {
                throw new Error("write failed");
            }
            return { bytesSent };
        });
    }
    return proto;
}

describe("serial.send callback contract", () => {
    beforeEach(async () => {
        await loadSerial();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("invokes the callback exactly once on a successful send", async () => {
        serial._protocol = fakeProtocol({ bytesSent: 12 });
        const callback = vi.fn();

        await serial.send(new Uint8Array(12), callback);

        expect(callback).toHaveBeenCalledTimes(1);
    });

    it("hands the protocol no callback, so it cannot fire a second one", async () => {
        const proto = fakeProtocol({ bytesSent: 4 });
        serial._protocol = proto;

        await serial.send(new Uint8Array(4), vi.fn());

        expect(proto.receivedCallbacks).toEqual([undefined]);
    });

    it("reports the protocol's real byte count, not zero", async () => {
        serial._protocol = fakeProtocol({ bytesSent: 64 });
        const callback = vi.fn();

        const result = await serial.send(new Uint8Array(64), callback);

        expect(result).toEqual({ bytesSent: 64 });
        expect(callback).toHaveBeenCalledWith({ bytesSent: 64 });
    });

    it("invokes the callback exactly once when the protocol throws", async () => {
        serial._protocol = fakeProtocol({ bytesSent: 8, throws: true });
        const callback = vi.fn();

        const result = await serial.send(new Uint8Array(8), callback);

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith({ bytesSent: 0 });
        expect(result).toEqual({ bytesSent: 0 });
    });

    it("invokes the callback exactly once in virtual mode, which has no send method", async () => {
        // VirtualSerial defines no send(); the guarded call yields undefined and
        // the facade reports zero bytes quietly. Virtual mode sends constantly,
        // so this path must not log an error per send.
        serial._protocol = fakeProtocol({ hasSend: false });
        const callback = vi.fn();

        const result = await serial.send(new Uint8Array(3), callback);

        expect(callback).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ bytesSent: 0 });
        expect(console.error).not.toHaveBeenCalled();
    });
});

describe("WebBluetooth.send return value", () => {
    // The facade's `?? { bytesSent: 0 }` is now the only value the caller sees,
    // so a transport that returns undefined would silently report every send as
    // zero bytes and break the msp.js bytesSent === byteLength check.
    beforeEach(() => {
        vi.resetModules();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns the byte count written, not undefined", async () => {
        const { default: WebBluetooth } = await vi.importActual("../../src/js/protocols/WebBluetooth.js");
        const ble = new WebBluetooth();
        ble.writeCharacteristic = { writeValue: vi.fn().mockResolvedValue(undefined) };
        ble.device = { gatt: { connected: true } };
        ble.writeQueue = Promise.resolve();

        const result = await ble.send(new Uint8Array(20));

        expect(result).toEqual({ bytesSent: 20 });
    });

    it("returns zero bytes when there is no write characteristic", async () => {
        const { default: WebBluetooth } = await vi.importActual("../../src/js/protocols/WebBluetooth.js");
        const ble = new WebBluetooth();
        ble.writeCharacteristic = null;

        expect(await ble.send(new Uint8Array(5))).toEqual({ bytesSent: 0 });
    });

    it("returns zero bytes without writing when the GATT server is disconnected", async () => {
        const { default: WebBluetooth } = await vi.importActual("../../src/js/protocols/WebBluetooth.js");
        const ble = new WebBluetooth();
        ble.writeCharacteristic = { writeValue: vi.fn() };
        ble.device = { gatt: { connected: false } };

        expect(await ble.send(new Uint8Array(5))).toEqual({ bytesSent: 0 });
        expect(ble.writeCharacteristic.writeValue).not.toHaveBeenCalled();
    });
});
