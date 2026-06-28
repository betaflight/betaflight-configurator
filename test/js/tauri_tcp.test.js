import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// S6b — TauriTcp LinkEvent adapter + reconnect token. The Tauri core `invoke`
// and event `listen` APIs are mocked; listen captures the tcp-data / tcp-closed
// handlers so the test can drive them.

const handlers = {};
const invoke = vi.fn(async () => undefined);
const listen = vi.fn(async (event, handler) => {
    handlers[event] = handler;
    return vi.fn(async () => undefined); // unlisten
});

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

beforeEach(() => {
    for (const k of Object.keys(handlers)) {
        delete handlers[k];
    }
    vi.clearAllMocks();
    invoke.mockResolvedValue(undefined);
});

afterEach(() => vi.resetModules());

async function newTcp() {
    const mod = await import("../../src/js/protocols/TauriTcp.js");
    return new mod.default();
}

describe("S6b TauriTcp LinkEvent adapter", () => {
    it("declares LinkEvent support", async () => {
        expect((await newTcp()).supportsLinkEvents).toBe(true);
    });

    it("emits open on connect and closed on intentional disconnect", async () => {
        const tcp = await newTcp();
        const events = [];
        tcp.addEventListener("open", () => events.push("open"));
        tcp.addEventListener("closed", () => events.push("closed"));
        tcp.addEventListener("lost", () => events.push("lost"));

        await tcp.connect("tcp://localhost:5761");
        await tcp.disconnect();

        expect(events).toEqual(["open", "closed"]);
    });

    it("emits lost when the peer closes (tcp-closed)", async () => {
        const tcp = await newTcp();
        await tcp.connect("tcp://localhost:5761");

        const events = [];
        tcp.addEventListener("closed", () => events.push("closed"));
        tcp.addEventListener("lost", () => events.push("lost"));

        handlers["tcp-closed"]();
        await vi.waitFor(() => expect(events).toContain("lost"));
        expect(events).not.toContain("closed");
    });

    it("emits data on tcp-data", async () => {
        const tcp = await newTcp();
        await tcp.connect("tcp://localhost:5761");
        const received = [];
        tcp.addEventListener("data", (e) => received.push(Array.from(e.detail)));

        handlers["tcp-data"]({ payload: [7, 8, 9] });

        expect(received).toEqual([[7, 8, 9]]);
    });

    it("freezes the canonical tcp:// address as a tcp token and resolves it back", async () => {
        const tcp = await newTcp();
        await tcp.connect("tcp://localhost:5761");

        const token = tcp.getReconnectToken();
        expect(token).toEqual({ transportType: "tcp", opaqueId: "tcp://localhost:5761", baud: 0, isVirtual: false });
        expect(tcp.resolveReconnectTarget(token)).toBe("tcp://localhost:5761");
        expect(tcp.resolveReconnectTarget(null)).toBeNull();
    });
});
