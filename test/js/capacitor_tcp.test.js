import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    expectSupportsLinkEvents,
    expectTokenShape,
    expectResolveContract,
    expectLostOnUnsolicitedDrop,
} from "./helpers/linkEventContract.js";

// S6b — CapacitorTcp LinkEvent adapter + reconnect token. Native BetaflightTcp
// plugin mocked; addListener captures dataReceived / dataReceivedError /
// connectionClosed handlers.

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

describe("S6b CapacitorTcp LinkEvent adapter", () => {
    it("declares LinkEvent support", async () => {
        expectSupportsLinkEvents(await newTcp());
    });

    it("emits open on connect and closed on intentional disconnect", async () => {
        const tcp = await newTcp();
        const events = [];
        tcp.addEventListener("open", () => events.push("open"));
        tcp.addEventListener("closed", () => events.push("closed"));
        tcp.addEventListener("lost", () => events.push("lost"));

        await tcp.connect("http://localhost:5761");
        await tcp.disconnect();

        expect(events).toEqual(["open", "closed"]);
    });

    it("emits lost when the peer closes the connection", async () => {
        const tcp = await newTcp();
        await tcp.connect("http://localhost:5761");

        await expectLostOnUnsolicitedDrop(tcp, () => listeners.connectionClosed());
    });

    it("emits data on dataReceived (base64 decoded)", async () => {
        const tcp = await newTcp();
        const received = [];
        tcp.addEventListener("data", (e) => received.push(Array.from(e.detail)));

        listeners.dataReceived({ data: btoa(String.fromCharCode(1, 2, 3)) });

        expect(received).toEqual([[1, 2, 3]]);
    });

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
