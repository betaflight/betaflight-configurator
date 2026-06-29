import { describe, expect, it, beforeEach } from "vitest";
import { serial } from "../../src/js/serial.js";

// ---------------------------------------------------------------------------
// The serial facade multiplexes several transports. Device-enumeration events
// (addedDevice/removedDevice) are forwarded from EVERY transport so port_handler
// can build the combined device list. Connection-lifecycle events
// (connect/disconnect/receive) are forwarded ONLY from the active transport —
// otherwise a late event from a transport we've switched away from (e.g. a BLE
// link's gattserverdisconnected firing after the user connected a serial FC)
// would reach onClosed / read_serial against the wrong connection and corrupt
// the live one. This pins that routing.
// ---------------------------------------------------------------------------

const protocol = (name) => serial._protocols.find((p) => p.name === name).instance;

describe("serial facade event routing", () => {
    beforeEach(() => {
        serial._protocol = null;
    });

    it("forwards a disconnect from the ACTIVE transport", () => {
        serial._protocol = protocol("virtual");
        let seen = null;
        const handler = (e) => (seen = e.detail);
        serial.addEventListener("disconnect", handler);
        protocol("virtual").dispatchEvent(new CustomEvent("disconnect", { detail: { ok: true } }));
        serial.removeEventListener("disconnect", handler);
        expect(seen).toMatchObject({ ok: true, protocolType: "virtual" });
    });

    it("DROPS a connect/disconnect/receive from a non-active transport (stale link)", () => {
        serial._protocol = protocol("virtual"); // active transport
        const stale = protocol("bluetooth"); // a transport we are no longer connected through

        const seen = [];
        const handler = (e) => seen.push(e.type);
        for (const type of ["connect", "disconnect", "receive"]) {
            serial.addEventListener(type, handler);
        }
        stale.dispatchEvent(new CustomEvent("connect", { detail: { connectionId: "bluetooth_x" } }));
        stale.dispatchEvent(new CustomEvent("disconnect", { detail: true }));
        stale.dispatchEvent(new CustomEvent("receive", { detail: new Uint8Array([1, 2, 3]) }));
        for (const type of ["connect", "disconnect", "receive"]) {
            serial.removeEventListener(type, handler);
        }

        expect(seen).toEqual([]);
    });

    it("forwards a primitive connect:false unchanged (not spread into a truthy object)", () => {
        serial._protocol = protocol("virtual");
        let seen;
        const handler = (e) => (seen = e.detail);
        serial.addEventListener("connect", handler);
        // A failed open dispatches `false`; if the facade spread it into
        // { protocolType }, onOpen() would treat the failure as a success.
        protocol("virtual").dispatchEvent(new CustomEvent("connect", { detail: false }));
        serial.removeEventListener("connect", handler);
        expect(seen).toBe(false);
    });

    it("still forwards device-enumeration events from ANY transport regardless of the active one", () => {
        serial._protocol = protocol("virtual");
        let seen = null;
        const handler = (e) => (seen = e.detail);
        serial.addEventListener("addedDevice", handler);
        protocol("bluetooth").dispatchEvent(new CustomEvent("addedDevice", { detail: { path: "bluetooth_x" } }));
        serial.removeEventListener("addedDevice", handler);
        expect(seen).toMatchObject({ path: "bluetooth_x", protocolType: "bluetooth" });
    });
});
