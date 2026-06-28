import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
    expectNullTokenWhenDisconnected,
    expectTokenShape,
    expectResolveContract,
} from "./helpers/linkEventContract.js";

// ---------------------------------------------------------------------------
// S6b — Websocket (web TCP / SITL) LinkEvent adapter + reconnect-token contract.
//
// We stub the global WebSocket so we can drive onopen/onmessage/onclose by hand
// and observe the normalized open/data/closed/lost events. Identity for a TCP
// endpoint is its address, stable across an FC reboot.
// ---------------------------------------------------------------------------

class FakeWS {
    constructor(url, protocols) {
        this.url = url;
        this.protocols = protocols;
        this.onopen = null;
        this.onclose = null;
        this.onerror = null;
        this.onmessage = null;
        this.close = vi.fn();
        this.send = vi.fn();
        FakeWS.last = this;
    }
}

beforeEach(() => {
    globalThis.WebSocket = FakeWS;
});

afterEach(() => {
    vi.resetModules();
    FakeWS.last = null;
});

async function newWebsocket() {
    const mod = await import("../../src/js/protocols/WebSocket.js");
    return new mod.default();
}

describe("S6b Websocket reconnect-token contract", () => {
    it("returns null token when not connected", async () => {
        expectNullTokenWhenDisconnected(await newWebsocket());
    });

    it("freezes the address as the tcp opaqueId when connected", async () => {
        const ws = await newWebsocket();
        await ws.connect("ws://localhost:5761");
        FakeWS.last.onopen({});

        expectTokenShape(ws, {
            transportType: "tcp",
            opaqueId: "ws://localhost:5761",
            baud: 0,
            isVirtual: false,
        });
    });

    it("resolveReconnectTarget returns the address for a tcp token, null otherwise", async () => {
        const ws = await newWebsocket();
        expectResolveContract(ws, {
            token: { transportType: "tcp", opaqueId: "ws://h:1" },
            resolvesTo: "ws://h:1",
            wrongTransportToken: { transportType: "serial", opaqueId: "ws://h:1" },
        });
    });
});
