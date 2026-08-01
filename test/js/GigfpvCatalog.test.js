import { describe, expect, it } from "vitest";
import BuildApi from "../../src/js/BuildApi";
import {
    GIGFLIGHT_CONFIG_REPOSITORY,
    GIGFLIGHT_REPOSITORY,
    GIGLRS_REPOSITORY,
    GIGLRS_TARGETS_REPOSITORY,
} from "../../src/js/GigfpvCatalog";

describe("GIGFPV firmware catalogues", () => {
    it("points GIGFLIGHT firmware and target discovery at GIGFPV repositories", () => {
        expect(GIGFLIGHT_REPOSITORY).toBe("timmyfpv/GIGFLIGHT");
        expect(GIGFLIGHT_CONFIG_REPOSITORY).toBe("timmyfpv/gigflight-config");
    });

    it("points GIGLRS firmware and target discovery at GIGFPV repositories", () => {
        expect(GIGLRS_REPOSITORY).toBe("timmyfpv/giglrs");
        expect(GIGLRS_TARGETS_REPOSITORY).toBe("timmyfpv/giglrs-targets");
    });

    it("keeps the ELRS selector scoped to GIGLRS betaflight-passthrough targets", () => {
        const targets = new BuildApi().flattenGiglrsTargets({
            GIGFPV: {
                name: "GIGFPV",
                rx_2400: {
                    GIGLRS_AIO_RX: {
                        product_name: "GIGLRS 2.4GHz AIO RX",
                        firmware: "Unified_ESP32C3_2400_RX",
                        upload_methods: ["uart", "wifi", "betaflight"],
                    },
                    WIFI_ONLY_RX: {
                        product_name: "Wi-Fi Only RX",
                        firmware: "WiFiOnly",
                        upload_methods: ["wifi"],
                    },
                },
            },
        });

        expect(targets).toEqual([
            expect.objectContaining({
                productName: "GIGLRS 2.4GHz AIO RX",
                firmware: "Unified_ESP32C3_2400_RX",
                uploadMethods: ["uart", "wifi", "betaflight"],
                repository: GIGLRS_REPOSITORY,
                targetsRepository: GIGLRS_TARGETS_REPOSITORY,
            }),
        ]);
    });
});
