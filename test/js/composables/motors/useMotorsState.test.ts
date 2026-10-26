import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import Features from "../../../../src/js/Features";
import { useFlightControllerStore } from "../../../../src/stores/fc";
import { useMotorsState } from "../../../../src/composables/motors/useMotorsState";

describe("useMotorsState", () => {
    let fcStore: ReturnType<typeof useFlightControllerStore>;

    beforeEach(() => {
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        const features = new Features({ apiVersion: "1.47.0" });
        features.enable("3D");
        fcStore.features.features = features;
        fcStore.mixerConfig.mixer = 3;
        fcStore.pidAdvancedConfig.fast_pwm_protocol = 5;
        fcStore.motorConfig.use_dshot_telemetry = true;
        fcStore.filterConfig.dyn_notch_q = 300;
        fcStore.filterConfig.dyn_notch_count = 2;
    });

    it("snapshots the FC settings under the legacy item names", () => {
        const state = useMotorsState();
        state.initializeDefaults();

        expect(state.defaultConfiguration.value.mixer).toBe(3);
        // The ESC protocol is stored one-based, as the legacy select used it.
        expect(state.defaultConfiguration.value.escprotocol).toBe(6);
        expect(state.defaultConfiguration.value.feature12).toBe(true);
        expect(state.defaultConfiguration.value.feature4).toBe(false);
        expect(state.previousDshotBidir.value).toBe(true);
        expect(state.previousFilterDynQ.value).toBe(300);
        expect(state.previousFilterDynCount.value).toBe(2);
        expect(state.feature3DEnabled.value).toBe(true);
    });

    it("records a change and drops it again when the value returns to the default", () => {
        const state = useMotorsState();
        state.initializeDefaults();

        state.trackChange("mixer", 4);
        expect(state.configChanges.value).toEqual({ mixer: 4 });
        expect(state.configHasChanged.value).toBe(true);

        state.trackChange("mixer", 3);
        expect(state.configChanges.value).toEqual({});
        expect(state.configHasChanged.value).toBe(false);
    });

    it("still records a change that arrives before the snapshot, with a warning", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const state = useMotorsState();

        state.trackChange("mixer", 3);

        expect(state.configChanges.value).toEqual({ mixer: 3 });
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });

    it("resetChanges clears changes and analytics and re-snapshots the current values", () => {
        const state = useMotorsState();
        state.initializeDefaults();
        state.trackChange("mixer", 4);
        state.trackAnalytics("mixer", 4);
        fcStore.mixerConfig.mixer = 4;

        state.resetChanges();

        expect(state.configChanges.value).toEqual({});
        expect(state.analyticsChanges.value).toEqual({});
        expect(state.defaultConfiguration.value.mixer).toBe(4);
    });

    it("throws when the snapshot is taken before FEATURE_CONFIG has loaded", () => {
        fcStore.features.features = null;
        const state = useMotorsState();

        expect(() => state.initializeDefaults()).toThrow(TypeError);
    });
});
