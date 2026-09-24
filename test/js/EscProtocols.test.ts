import { describe, expect, it } from "vitest";

import EscProtocols from "../../src/js/utils/EscProtocols";

// GetAvailableProtocols ignores the API version today, so the version string passed below is
// arbitrary; these cover the ordering-dependent lookups and the DSHOT classification that
// gate motor protocol selection in the firmware.

const API_VERSION = "1.48.0";

describe("EscProtocols.GetProtocolName", () => {
    it("maps an index to the protocol at that position", () => {
        const protocols = EscProtocols.GetAvailableProtocols(API_VERSION);

        for (let index = 0; index < protocols.length; index++) {
            expect(EscProtocols.GetProtocolName(API_VERSION, index)).toBe(protocols[index]);
        }
    });

    it("returns undefined for an index past the end", () => {
        const length = EscProtocols.GetAvailableProtocols(API_VERSION).length;

        expect(EscProtocols.GetProtocolName(API_VERSION, length)).toBeUndefined();
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
