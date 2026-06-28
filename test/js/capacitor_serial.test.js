import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// S6b — CapacitorSerial (Android USB) LinkEvent adapter + reconnect token.
//
// The native BetaflightSerial plugin is mocked: addListener captures the
// dataReceived / deviceAttached / deviceDetached handlers so the test can drive
// them, and connect/disconnect/getDevices resolve synthetically.
// ---------------------------------------------------------------------------

const listeners = {};
const native = {
    addListener: vi.fn((event, handler) => {
        listeners[event] = handler;
    }),
    getDevices: vi.fn(async () => ({ devices: [] })),
    connect: vi.fn(async () => ({ success: true })),
    disconnect: vi.fn(async () => ({})),
    write: vi.fn(async () => ({ bytesSent: 0 })),
    requestPermission: vi.fn(),
};

vi.mock("@capacitor/core", () => ({
    Capacitor: { Plugins: { BetaflightSerial: native } },
}));

beforeEach(() => {
    for (const k of Object.keys(listeners)) {
        delete listeners[k];
    }
    vi.clearAllMocks();
    native.getDevices.mockResolvedValue({ devices: [] });
    native.connect.mockResolvedValue({ success: true });
    native.disconnect.mockResolvedValue({});
});

afterEach(() => {
    vi.resetModules();
});

async function newCapacitorSerial() {
    const mod = await import("../../src/js/protocols/CapacitorSerial.js");
    return new mod.default();
}

const fakeDevice = (deviceId = "1155:22336:1") => ({
    deviceId,
    vendorId: 0x0483,
    productId: 0x5740,
    product: "Betaflight",
});

describe("S6b CapacitorSerial LinkEvent adapter", () => {
    it("declares LinkEvent support", async () => {
        const cs = await newCapacitorSerial();
        expect(cs.supportsLinkEvents).toBe(true);
    });

    it("emits deviceArrived on attach and deviceLeft on detach", async () => {
        const cs = await newCapacitorSerial();
        const arrived = [];
        const left = [];
        cs.addEventListener("deviceArrived", (e) => arrived.push(e.detail.path));
        cs.addEventListener("deviceLeft", (e) => left.push(e.detail?.path));

        const dev = fakeDevice();
        listeners.deviceAttached(dev);
        expect(arrived).toEqual(["capacitor-1155:22336:1"]);

        listeners.deviceDetached(dev);
        expect(left).toEqual(["capacitor-1155:22336:1"]);
    });

    it("emits open on connect and closed on intentional disconnect", async () => {
        const cs = await newCapacitorSerial();
        listeners.deviceAttached(fakeDevice());
        const path = cs.ports[0].path;

        const events = [];
        cs.addEventListener("open", () => events.push("open"));
        cs.addEventListener("closed", () => events.push("closed"));
        cs.addEventListener("lost", () => events.push("lost"));

        await cs.connect(path, { baudRate: 115200 });
        await cs.disconnect();

        expect(events).toEqual(["open", "closed"]);
    });

    it("emits lost (not closed) when the connected device detaches", async () => {
        const cs = await newCapacitorSerial();
        const dev = fakeDevice();
        listeners.deviceAttached(dev);
        await cs.connect(cs.ports[0].path, { baudRate: 115200 });

        const events = [];
        cs.addEventListener("closed", () => events.push("closed"));
        cs.addEventListener("lost", () => events.push("lost"));

        listeners.deviceDetached(dev);

        expect(events).toContain("lost");
        expect(events).not.toContain("closed");
    });

    it("emits data on dataReceived", async () => {
        const cs = await newCapacitorSerial();
        const received = [];
        cs.addEventListener("data", (e) => received.push(Array.from(e.detail)));

        listeners.dataReceived({ data: "0a0b" });

        expect(received).toEqual([[0x0a, 0x0b]]);
    });
});

describe("S6b CapacitorSerial reconnect-token contract", () => {
    it("returns null token when not connected", async () => {
        const cs = await newCapacitorSerial();
        expect(cs.getReconnectToken()).toBeNull();
    });

    it("freezes the capacitor device key, baud and transport when connected", async () => {
        const cs = await newCapacitorSerial();
        listeners.deviceAttached(fakeDevice());
        const path = cs.ports[0].path;
        await cs.connect(path, { baudRate: 230400 });

        expect(cs.getReconnectToken()).toEqual({
            transportType: "serial",
            opaqueId: path,
            baud: 230400,
            isVirtual: false,
        });
    });

    it("resolveReconnectTarget matches a present device, null when gone or wrong transport", async () => {
        const cs = await newCapacitorSerial();
        listeners.deviceAttached(fakeDevice());
        const path = cs.ports[0].path;

        expect(cs.resolveReconnectTarget({ transportType: "serial", opaqueId: path })).toBe(path);
        expect(cs.resolveReconnectTarget({ transportType: "serial", opaqueId: "capacitor-9:9:9" })).toBeNull();
        expect(cs.resolveReconnectTarget({ transportType: "tcp", opaqueId: path })).toBeNull();
    });
});
