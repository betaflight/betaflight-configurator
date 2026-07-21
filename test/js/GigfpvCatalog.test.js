import { describe, expect, it } from "vitest";
import { GIGFLIGHT_CONFIG_REPOSITORY, GIGFLIGHT_REPOSITORY, GIGLRS_TARGETS } from "../../src/js/GigfpvCatalog";

describe("GIGFPV firmware catalogues", () => {
    it("points GIGFLIGHT firmware and target discovery at GIGFPV repositories", () => {
        expect(GIGFLIGHT_REPOSITORY).toBe("timmyfpv/GIGFLIGHT");
        expect(GIGFLIGHT_CONFIG_REPOSITORY).toBe("timmyfpv/gigflight-config");
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
