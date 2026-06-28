import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    expectSupportsLinkEvents,
    expectNullTokenWhenDisconnected,
    expectTokenShape,
    expectResolveContract,
    expectClosedOnIntentionalDisconnect,
    expectLostOnUnsolicitedDrop,
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

describe("S6b Websocket LinkEvent adapter", () => {
    it("declares LinkEvent support", async () => {
        expectSupportsLinkEvents(await newWebsocket());
    });

    it("emits open on socket onopen", async () => {
        const ws = await newWebsocket();
        let opened = false;
        ws.addEventListener("open", () => (opened = true));

        await ws.connect("ws://localhost:5761");
        FakeWS.last.onopen({});

        expect(ws.connected).toBe(true);
        expect(opened).toBe(true);
    });

    it("emits data on each socket message", async () => {
        const ws = await newWebsocket();
        const chunk = new Uint8Array([4, 5, 6]);
        vi.spyOn(ws, "blob2uint").mockResolvedValue(chunk);

        const received = [];
        ws.addEventListener("data", (e) => received.push(e.detail));

        await ws.connect("ws://localhost:5761");
        await FakeWS.last.onmessage({ data: new Blob() });

        expect(received).toEqual([chunk]);
    });

    it("emits closed when the close was initiated by disconnect()", async () => {
        const ws = await newWebsocket();
        await ws.connect("ws://localhost:5761");
        FakeWS.last.onopen({});

        // disconnect() sets _closing; the real socket then fires onclose.
        await expectClosedOnIntentionalDisconnect(ws, async () => {
            await ws.disconnect();
            await FakeWS.last.onclose({});
        });
    });

    it("emits lost when the peer closes the socket unexpectedly", async () => {
        const ws = await newWebsocket();
        await ws.connect("ws://localhost:5761");
        FakeWS.last.onopen({});

        // Server vanished: onclose fires without disconnect() having run.
        await expectLostOnUnsolicitedDrop(ws, () => FakeWS.last.onclose({}));
    });
});

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
