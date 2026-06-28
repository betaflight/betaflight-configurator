import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
        expect((await newTcp()).supportsLinkEvents).toBe(true);
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

        const events = [];
        tcp.addEventListener("closed", () => events.push("closed"));
        tcp.addEventListener("lost", () => events.push("lost"));

        listeners.connectionClosed();
        await vi.waitFor(() => expect(events).toContain("lost"));
        expect(events).not.toContain("closed");
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

        const token = tcp.getReconnectToken();
        expect(token).toEqual({ transportType: "tcp", opaqueId: "localhost:5761", baud: 0, isVirtual: false });
        expect(tcp.resolveReconnectTarget(token)).toBe("localhost:5761");
        expect(tcp.resolveReconnectTarget({ transportType: "serial", opaqueId: "x" })).toBeNull();
    });
});
