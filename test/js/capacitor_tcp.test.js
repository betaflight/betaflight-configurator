import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { expectTokenShape, expectResolveContract } from "./helpers/linkEventContract.js";

// S6b — CapacitorTcp reconnect token. Native BetaflightTcp plugin mocked;
// addListener captures dataReceived / dataReceivedError / connectionClosed
// handlers.

const listeners = {};
const native = {
    addListener: vi.fn((event, handler) => {
        listeners[event] = handler;
    }),
    connect: vi.fn(async () => ({ success: true })),
    disconnect: vi.fn(async () => ({ success: true })),
    send: vi.fn(async () => ({ success: true })),
};

vi.mock("@capacitor/core", () => ({
    Capacitor: { Plugins: { BetaflightTcp: native } },
}));

beforeEach(() => {
    for (const k of Object.keys(listeners)) {
        delete listeners[k];
    }
    vi.clearAllMocks();
    native.connect.mockResolvedValue({ success: true });
    native.disconnect.mockResolvedValue({ success: true });
});

afterEach(() => vi.resetModules());

async function newTcp() {
    const mod = await import("../../src/js/protocols/CapacitorTcp.js");
    return new mod.default();
}

describe("S6b CapacitorTcp reconnect-token contract", () => {
    it("freezes the address as a tcp token and resolves it back", async () => {
        const tcp = await newTcp();
        await tcp.connect("http://localhost:5761");

        const token = { transportType: "tcp", opaqueId: "localhost:5761", baud: 0, isVirtual: false };
        expectTokenShape(tcp, token);
        expectResolveContract(tcp, {
            token,
            resolvesTo: "localhost:5761",
            wrongTransportToken: { transportType: "serial", opaqueId: "x" },
            expectNullToken: false,
        });
    });
});
