import { describe, expect, it } from "vitest";

import EscProtocols from "../../src/js/utils/EscProtocols";

// GetAvailableProtocols ignores the API version today, so the version string passed below is
// arbitrary; these cover the ordering-dependent lookups and the DSHOT classification that
// gate motor protocol selection in the firmware.

const API_VERSION = "1.48.0";

// The firmware identifies a protocol by its index into this list, so the order is a wire
// contract, not an implementation detail: reordering it silently remaps every stored value.
// Pinned explicitly here so such a change fails the suite instead of passing unnoticed.
const EXPECTED_PROTOCOLS = [
    "PWM_OUTPUT",
    "ONESHOT125",
    "ONESHOT42",
    "MULTISHOT",
    "BRUSHED",
    "DSHOT150",
    "DSHOT300",
    "DSHOT600",
    "PROSHOT1000",
    "DISABLED",
];

describe("EscProtocols.GetAvailableProtocols", () => {
    it("returns the protocols in the firmware's index order", () => {
        expect(EscProtocols.GetAvailableProtocols(API_VERSION)).toEqual(EXPECTED_PROTOCOLS);
    });
});

describe("EscProtocols.GetProtocolName", () => {
    it("maps an index to the protocol at that position", () => {
        EXPECTED_PROTOCOLS.forEach((protocol, index) => {
            expect(EscProtocols.GetProtocolName(API_VERSION, index)).toBe(protocol);
        });
    });

    it("returns undefined for an index past the end", () => {
        expect(EscProtocols.GetProtocolName(API_VERSION, EXPECTED_PROTOCOLS.length)).toBeUndefined();
    });
});

describe("EscProtocols.IsProtocolDshot", () => {
    it("is true for every DSHOT/PROSHOT protocol", () => {
        const protocols = EscProtocols.GetAvailableProtocols(API_VERSION);

        for (const protocol of EscProtocols.DSHOT_PROTOCOLS_SET) {
            const index = protocols.indexOf(protocol);
            expect(EscProtocols.IsProtocolDshot(API_VERSION, index)).toBe(true);
        }
    });

    it("is false for the non-DSHOT protocols", () => {
        const protocols = EscProtocols.GetAvailableProtocols(API_VERSION);

        protocols.forEach((protocol, index) => {
            if (!EscProtocols.DSHOT_PROTOCOLS_SET.includes(protocol)) {
                expect(EscProtocols.IsProtocolDshot(API_VERSION, index)).toBe(false);
            }
        });
    });

    it("is false for an out-of-range index rather than throwing", () => {
        const length = EscProtocols.GetAvailableProtocols(API_VERSION).length;

        expect(EscProtocols.IsProtocolDshot(API_VERSION, length)).toBe(false);
    });
});

describe("EscProtocols.ReorderPwmProtocols", () => {
    it("returns the index unchanged", () => {
        for (const index of [0, 3, 9]) {
            expect(EscProtocols.ReorderPwmProtocols(API_VERSION, index)).toBe(index);
        }
    });
});
