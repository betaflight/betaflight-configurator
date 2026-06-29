import { describe, expect, it } from "vitest";
import { makeReconnectToken, resolveStableAddress, resolveByPath } from "../../src/js/protocols/reconnect_token.js";

// ---------------------------------------------------------------------------
// The reconnect-token contract used to be copy-pasted into every transport, so
// every transport test re-proved the same resolve logic. The logic now lives in
// one module — so it is tested ONCE here. Each transport test keeps only its own
// token-SHAPE proof (that it populates transportType/opaqueId/baud from its live
// connect state); TauriSerial additionally tests its bespoke CDC-path resolve.
// ---------------------------------------------------------------------------

describe("makeReconnectToken", () => {
    it("returns null when not connected", () => {
        expect(makeReconnectToken({ connected: false, transportType: "serial", opaqueId: "serial_0" })).toBeNull();
    });

    it("returns null when opaqueId is missing even if connected", () => {
        expect(makeReconnectToken({ connected: true, transportType: "tcp", opaqueId: undefined })).toBeNull();
        expect(makeReconnectToken({ connected: true, transportType: "tcp", opaqueId: null })).toBeNull();
    });

    it("freezes the full token shape, defaulting baud=0 and isVirtual=false", () => {
        expect(makeReconnectToken({ connected: true, transportType: "tcp", opaqueId: "host:5761" })).toEqual({
            transportType: "tcp",
            opaqueId: "host:5761",
            baud: 0,
            isVirtual: false,
        });
    });

    it("carries baud and isVirtual through when given", () => {
        expect(
            makeReconnectToken({
                connected: true,
                transportType: "virtual",
                opaqueId: "virtual",
                baud: 115200,
                isVirtual: true,
            }),
        ).toEqual({ transportType: "virtual", opaqueId: "virtual", baud: 115200, isVirtual: true });
    });
});

describe("resolveStableAddress (TCP / virtual)", () => {
    it("returns the address unchanged for a matching transport", () => {
        expect(resolveStableAddress({ transportType: "tcp", opaqueId: "host:5761" }, "tcp")).toBe("host:5761");
    });

    it("returns null for a null token, a wrong transport, or a missing opaqueId", () => {
        expect(resolveStableAddress(null, "tcp")).toBeNull();
        expect(resolveStableAddress({ transportType: "serial", opaqueId: "host:5761" }, "tcp")).toBeNull();
        expect(resolveStableAddress({ transportType: "tcp", opaqueId: null }, "tcp")).toBeNull();
    });
});

describe("resolveByPath (USB / BLE serial)", () => {
    const ports = [{ path: "serial_0" }, { path: "serial_1" }];

    it("returns the current path when the device is still present", () => {
        expect(resolveByPath({ transportType: "serial", opaqueId: "serial_1" }, "serial", ports)).toBe("serial_1");
    });

    it("returns null for an unknown id, a wrong transport, or a null token", () => {
        expect(resolveByPath({ transportType: "serial", opaqueId: "serial_999" }, "serial", ports)).toBeNull();
        expect(resolveByPath({ transportType: "bluetooth", opaqueId: "serial_0" }, "serial", ports)).toBeNull();
        expect(resolveByPath(null, "serial", ports)).toBeNull();
    });
});
