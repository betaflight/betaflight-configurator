import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { expectTokenShape } from "./helpers/tokenContract.js";

// S6b — TauriTcp reconnect token. The Tauri core `invoke`
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

describe("S6b TauriTcp reconnect token", () => {
    it("freezes the canonical tcp:// address as a tcp token", async () => {
        const tcp = await newTcp();
        await tcp.connect("tcp://localhost:5761");

        // resolveReconnectTarget is the shared resolveStableAddress helper — see reconnect_token.test.js.
        expectTokenShape(tcp, { transportType: "tcp", opaqueId: "tcp://localhost:5761", baud: 0, isVirtual: false });
    });
});
