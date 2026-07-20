import { describe, expect, it } from "vitest";
import { GIGFLIGHT_TARGETS, GIGLRS_TARGETS, isGigflightTarget } from "../../src/js/GigfpvCatalog";

describe("GIGFPV firmware catalogues", () => {
    it("exposes only the GIGFlight target maintained by GIGFPV", () => {
        expect(GIGFLIGHT_TARGETS.map(({ target }) => target)).toEqual(["GIGRACE"]);
        expect(isGigflightTarget("GIGRACE")).toBe(true);
        expect(isGigflightTarget("MATEKF405")).toBe(false);
    });

    it("keeps the ELRS selector scoped to the GIGLRS AIO receiver", () => {
        expect(GIGLRS_TARGETS).toEqual([
            expect.objectContaining({
                productName: "GIGLRS 2.4GHz AIO RX",
                firmware: "Unified_ESP32C3_2400_RX",
                uploadMethods: ["uart", "wifi", "betaflight"],
            }),
        ]);
    });
});
