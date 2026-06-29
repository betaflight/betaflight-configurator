import { afterEach, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// VirtualSerial is an EventTarget that emits synthetic connect/disconnect, so it
// stops being special-cased relative to real transports.
// ---------------------------------------------------------------------------

afterEach(() => {});

async function newVirtual() {
    const mod = await import("../../src/js/protocols/VirtualSerial.js");
    return new mod.default();
}

describe("VirtualSerial EventTarget", () => {
    it("is an EventTarget", async () => {
        const vs = await newVirtual();
        expect(vs).toBeInstanceOf(EventTarget);
    });

    it("emits connect on connect", async () => {
        const vs = await newVirtual();
        const events = [];
        vs.addEventListener("connect", () => events.push("connect"));

        const ok = vs.connect("virtual", {});

        expect(ok).toBe(true);
        expect(vs.connected).toBe(true);
        expect(events).toEqual(["connect"]);
    });

    it("emits disconnect on disconnect, and only once", async () => {
        const vs = await newVirtual();
        vs.connect("virtual", {});

        const events = [];
        vs.addEventListener("disconnect", () => events.push("disconnect"));

        expect(vs.disconnect()).toBe(true);
        expect(events).toEqual(["disconnect"]);

        // Already disconnected: returns false, emits nothing more.
        expect(vs.disconnect()).toBe(false);
        expect(events).toEqual(["disconnect"]);
    });
});

describe("serial.js now forwards virtual transport events", () => {
    it("forwards connect from the virtual protocol with protocolType, and still routes 'virtual'", async () => {
        const { serial } = await import("../../src/js/serial.js");
        const vs = serial._protocols.find((p) => p.name === "virtual").instance;
        // Lifecycle events are only forwarded from the active transport, so mark
        // virtual active (as serial.connect() does before the protocol emits connect).
        serial._protocol = vs;

        let detail = null;
        const handler = (e) => (detail = e.detail);
        serial.addEventListener("connect", handler);
        vs.dispatchEvent(new CustomEvent("connect", { detail: { connectionId: "virtual" } }));
        serial.removeEventListener("connect", handler);

        expect(detail).toEqual({ connectionId: "virtual", protocolType: "virtual" });
        expect(serial.selectProtocol("virtual").constructor.name).toBe("VirtualSerial");
    });
});
