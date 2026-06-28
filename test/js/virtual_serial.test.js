import { afterEach, describe, expect, it } from "vitest";
import {
    expectSupportsLinkEvents,
    expectNullTokenWhenDisconnected,
    expectTokenShape,
    expectResolveContract,
} from "./helpers/linkEventContract.js";

// ---------------------------------------------------------------------------
// S6e — VirtualSerial is now an EventTarget that emits synthetic
// connect/disconnect (+ open/closed LinkEvents) and the reconnect-token
// contract, so it stops being special-cased relative to real transports.
// ---------------------------------------------------------------------------

afterEach(() => {});

async function newVirtual() {
    const mod = await import("../../src/js/protocols/VirtualSerial.js");
    return new mod.default();
}

describe("S6e VirtualSerial EventTarget + LinkEvent adapter", () => {
    it("is an EventTarget and declares LinkEvent support", async () => {
        const vs = await newVirtual();
        expect(vs).toBeInstanceOf(EventTarget);
        expectSupportsLinkEvents(vs);
    });

    it("emits connect + open on connect", async () => {
        const vs = await newVirtual();
        const events = [];
        vs.addEventListener("connect", () => events.push("connect"));
        vs.addEventListener("open", () => events.push("open"));

        const ok = vs.connect("virtual", {});

        expect(ok).toBe(true);
        expect(vs.connected).toBe(true);
        expect(events).toEqual(["connect", "open"]);
    });

    it("emits disconnect + closed on disconnect, and only once", async () => {
        const vs = await newVirtual();
        vs.connect("virtual", {});

        const events = [];
        vs.addEventListener("disconnect", () => events.push("disconnect"));
        vs.addEventListener("closed", () => events.push("closed"));

        expect(vs.disconnect()).toBe(true);
        expect(events).toEqual(["disconnect", "closed"]);

        // Already disconnected: returns false, emits nothing more.
        expect(vs.disconnect()).toBe(false);
        expect(events).toEqual(["disconnect", "closed"]);
    });
});

describe("S6e VirtualSerial reconnect-token contract", () => {
    it("returns null token when not connected", async () => {
        expectNullTokenWhenDisconnected(await newVirtual());
    });

    it("returns an isVirtual token when connected", async () => {
        const vs = await newVirtual();
        vs.connect("virtual", {});
        expectTokenShape(vs, {
            transportType: "virtual",
            opaqueId: "virtual",
            baud: 115200,
            isVirtual: true,
        });
    });

    it("resolveReconnectTarget returns 'virtual' for a virtual token, null otherwise", async () => {
        const vs = await newVirtual();
        expectResolveContract(vs, {
            token: { transportType: "virtual", opaqueId: "virtual" },
            resolvesTo: "virtual",
            wrongTransportToken: { transportType: "serial", opaqueId: "x" },
        });
    });
});

describe("S6e serial.js now forwards virtual transport events", () => {
    it("forwards open from the virtual protocol with protocolType, and still routes 'virtual'", async () => {
        const { serial } = await import("../../src/js/serial.js");
        const vs = serial._protocols.find((p) => p.name === "virtual").instance;

        let detail = null;
        const handler = (e) => (detail = e.detail);
        serial.addEventListener("open", handler);
        vs.dispatchEvent(new CustomEvent("open", { detail: { connectionId: "virtual" } }));
        serial.removeEventListener("open", handler);

        expect(detail).toEqual({ connectionId: "virtual", protocolType: "virtual" });
        expect(serial.selectProtocol("virtual").constructor.name).toBe("VirtualSerial");
        expect(serial.resolveReconnectTarget({ transportType: "virtual", opaqueId: "virtual" })).toBe("virtual");
    });
});
