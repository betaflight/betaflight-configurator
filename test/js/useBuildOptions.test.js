import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { computed } from "vue";
import FC from "../../src/js/fc";
import { useBuildOptions } from "../../src/composables/useBuildOptions";
import { FIRMWARE_BUILD_OPTIONS } from "../../src/js/build_options.js";

describe("useBuildOptions", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        FC.resetState();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("buildOptionsAvailable", () => {
        it("is false on a freshly reset FC (no api version, empty list)", () => {
            const { buildOptionsAvailable } = useBuildOptions();

            expect(buildOptionsAvailable.value).toBe(false);
        });

        it("is false when the api version is too old, even with a populated list", () => {
            FC.CONFIG.apiVersion = "1.44.0";
            FC.CONFIG.buildOptions = ["USE_GPS"];
            const { buildOptionsAvailable } = useBuildOptions();

            expect(buildOptionsAvailable.value).toBe(false);
        });

        it("is false when the api version is new enough but the list is empty", () => {
            FC.CONFIG.apiVersion = "1.47.0";
            FC.CONFIG.buildOptions = [];
            const { buildOptionsAvailable } = useBuildOptions();

            expect(buildOptionsAvailable.value).toBe(false);
        });

        it("is false when the api version is not valid semver, and does not throw", () => {
            FC.CONFIG.apiVersion = "not-a-version";
            FC.CONFIG.buildOptions = ["USE_GPS"];
            const { buildOptionsAvailable, hasBuildOption } = useBuildOptions();

            expect(() => buildOptionsAvailable.value).not.toThrow();
            expect(buildOptionsAvailable.value).toBe(false);
            expect(hasBuildOption("USE_MAG")).toBe(true);
        });

        it("is false when the firmware reported no build option list at all", () => {
            FC.CONFIG.apiVersion = "1.47.0";
            FC.CONFIG.buildOptions = undefined;
            const { buildOptionsAvailable, hasBuildOption } = useBuildOptions();

            expect(buildOptionsAvailable.value).toBe(false);
            expect(hasBuildOption("USE_MAG")).toBe(true);
        });

        it("is true from API 1.45 with a populated list", () => {
            FC.CONFIG.apiVersion = "1.45.0";
            FC.CONFIG.buildOptions = ["USE_GPS"];
            const { buildOptionsAvailable } = useBuildOptions();

            expect(buildOptionsAvailable.value).toBe(true);
        });

        it("stays reactive to later FC.CONFIG changes", () => {
            const { buildOptionsAvailable } = useBuildOptions();
            expect(buildOptionsAvailable.value).toBe(false);

            FC.CONFIG.apiVersion = "1.47.0";
            FC.CONFIG.buildOptions = ["USE_GPS"];

            expect(buildOptionsAvailable.value).toBe(true);
        });
    });

    describe("hasBuildOption", () => {
        it("returns true for everything when gating does not apply", () => {
            const { hasBuildOption } = useBuildOptions();

            expect(hasBuildOption("USE_GPS")).toBe(true);
            expect(hasBuildOption("USE_MAG")).toBe(true);
            expect(hasBuildOption("USE_DRONECAN_ESC")).toBe(true);
        });

        it("returns true for everything when the firmware is too old to report options", () => {
            FC.CONFIG.apiVersion = "1.44.0";
            FC.CONFIG.buildOptions = ["USE_GPS"];
            const { hasBuildOption } = useBuildOptions();

            expect(hasBuildOption("USE_MAG")).toBe(true);
        });

        it("reports presence and absence when gating applies", () => {
            FC.CONFIG.apiVersion = "1.47.0";
            FC.CONFIG.buildOptions = ["USE_GPS", "USE_DSHOT"];
            const { hasBuildOption } = useBuildOptions();

            expect(hasBuildOption("USE_GPS")).toBe(true);
            expect(hasBuildOption("USE_DSHOT")).toBe(true);
            expect(hasBuildOption("USE_MAG")).toBe(false);
            expect(hasBuildOption("USE_PWM_OUTPUT")).toBe(false);
        });

        it("re-evaluates on every call rather than capturing a value", () => {
            FC.CONFIG.apiVersion = "1.47.0";
            FC.CONFIG.buildOptions = ["USE_GPS"];
            const { hasBuildOption } = useBuildOptions();
            expect(hasBuildOption("USE_MAG")).toBe(false);

            FC.CONFIG.buildOptions = ["USE_GPS", "USE_MAG"];

            expect(hasBuildOption("USE_MAG")).toBe(true);
        });

        it("drives a computed that a template would render", () => {
            const { hasBuildOption } = useBuildOptions();
            const gated = computed(() => hasBuildOption("USE_MAG"));
            expect(gated.value).toBe(true);

            FC.CONFIG.apiVersion = "1.47.0";
            FC.CONFIG.buildOptions = ["USE_GPS"];

            expect(gated.value).toBe(false);
        });

        it("fails open for a name that is not a key of FIRMWARE_BUILD_OPTIONS", () => {
            vi.spyOn(console, "warn").mockImplementation(() => {});
            FC.CONFIG.apiVersion = "1.47.0";
            FC.CONFIG.buildOptions = ["USE_GPS"];
            const { hasBuildOption } = useBuildOptions();

            // Such a name can never be present in FC.CONFIG.buildOptions, so
            // answering "absent" would hide the gated UI forever.
            expect(hasBuildOption("USE_TYPO_NOT_IN_TABLE")).toBe(true);
            expect(hasBuildOption("USE_MAG")).toBe(false);
        });

        it("warns once per unknown option name in dev and never throws", () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
            const { hasBuildOption } = useBuildOptions();
            const unknown = `USE_NOT_A_REAL_OPTION_${Math.random().toString(36).slice(2)}`;

            expect(() => hasBuildOption(unknown)).not.toThrow();
            hasBuildOption(unknown);
            hasBuildOption(unknown);

            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0][0]).toContain(unknown);
        });

        it("does not warn for a known option name", () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
            const { hasBuildOption } = useBuildOptions();

            hasBuildOption("USE_GPS");

            expect(warn).not.toHaveBeenCalled();
        });
    });

    describe("FIRMWARE_BUILD_OPTIONS", () => {
        it("includes the DroneCAN options served by the 2026.12 build API", () => {
            expect(FIRMWARE_BUILD_OPTIONS.USE_DRONECAN).toBe(16430);
            expect(FIRMWARE_BUILD_OPTIONS.USE_DRONECAN_ESC).toBe(8236);
        });
    });
});
