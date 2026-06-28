import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
    expectNullTokenWhenDisconnected,
    expectTokenShape,
    expectResolveContract,
} from "./helpers/linkEventContract.js";

// ---------------------------------------------------------------------------
// S6b — CapacitorSerial (Android USB) reconnect token.
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

describe("S6b CapacitorSerial reconnect-token contract", () => {
    it("returns null token when not connected", async () => {
        expectNullTokenWhenDisconnected(await newCapacitorSerial());
    });

    it("freezes the capacitor device key, baud and transport when connected", async () => {
        const cs = await newCapacitorSerial();
        listeners.deviceAttached(fakeDevice());
        const path = cs.ports[0].path;
        await cs.connect(path, { baudRate: 230400 });

        expectTokenShape(cs, {
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

        expectResolveContract(cs, {
            token: { transportType: "serial", opaqueId: path },
            resolvesTo: path,
            unknownToken: { transportType: "serial", opaqueId: "capacitor-9:9:9" },
            wrongTransportToken: { transportType: "tcp", opaqueId: path },
            expectNullToken: false,
        });
    });
});
