import { describe, expect, it, vi } from "vitest";
import { describeClaim, describeInactiveReason } from "../../src/composables/ports/portClaims";
import { i18n } from "../../src/js/localization";

vi.mock("../../src/js/localization", () => ({
    i18n: {
        getMessage: vi.fn(
            (key: string, parameters?: string[]) =>
                ({
                    portsClaimMsp: "MSP",
                    portsClaimTelemetry: "Telemetry",
                    portsInactiveSoftSerialFeature: "Enable SOFTSERIAL",
                    portsInactiveReason: `Inactive: ${parameters?.[0]}`,
                })[key] ?? "",
        ),
    },
}));

describe("describeInactiveReason", () => {
    it("names the feature to enable and the tab that owns it", () => {
        expect(describeInactiveReason("feature SOFTSERIAL off")).toEqual({
            label: "Enable SOFTSERIAL",
            tab: "configuration",
        });
    });

    it("passes an unknown reason through", () => {
        expect(describeInactiveReason("something new")).toEqual({ label: "Inactive: something new", tab: null });
    });
});

describe("describeClaim", () => {
    it("resolves instanced claims and owning tabs", () => {
        expect(describeClaim("gps").tab).toBe("gps");
        expect(describeClaim("msp_2")).toEqual({ label: "MSP 2", tab: null });
        expect(describeClaim("telemetry_1").label).toBe("Telemetry 1");
        expect(describeClaim("osd_custom_text").tab).toBe("osd");
    });

    it("falls back to the stem when the claim has no translation", () => {
        expect(describeClaim("gps")).toEqual({ label: "gps", tab: "gps" });

        vi.mocked(i18n.getMessage).mockReturnValueOnce("");
        expect(describeClaim("msp_2")).toEqual({ label: "msp 2", tab: null });
    });

    it("only splits an instance suffix off instanced claims", () => {
        expect(describeClaim("gps_2")).toEqual({ label: "gps_2", tab: null });
    });

    it("passes an unknown claim through by name", () => {
        expect(describeClaim("mystery")).toEqual({ label: "mystery", tab: null });
    });
});
