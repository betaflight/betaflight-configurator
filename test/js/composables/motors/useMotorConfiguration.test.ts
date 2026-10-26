import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { effectScope, nextTick, ref, type EffectScope } from "vue";
import Features from "../../../../src/js/Features";
import { useFlightControllerStore } from "../../../../src/stores/fc";
import { useMotorConfiguration } from "../../../../src/composables/motors/useMotorConfiguration";

describe("useMotorConfiguration", () => {
    let fcStore: ReturnType<typeof useFlightControllerStore>;
    let scope: EffectScope;
    const trackChange = vi.fn();
    const stopMotorTesting = vi.fn();
    const motorsTestingEnabled = ref(false);

    beforeEach(() => {
        setActivePinia(createPinia());
        fcStore = useFlightControllerStore();
        fcStore.features.features = new Features({ apiVersion: "1.47.0" });
        trackChange.mockReset();
        stopMotorTesting.mockReset();
        motorsTestingEnabled.value = false;

        scope?.stop();
        scope = effectScope();
        scope.run(() => {
            useMotorConfiguration({ trackChange }, motorsTestingEnabled, stopMotorTesting).setupConfigWatchers();
        });
    });

    it("tracks a changed setting under its legacy item name", async () => {
        fcStore.motorConfig.motor_poles = 12;
        await nextTick();

        expect(trackChange).toHaveBeenCalledExactlyOnceWith("motorPoles", 12);
    });

    it("reports the ESC protocol one-based", async () => {
        fcStore.pidAdvancedConfig.fast_pwm_protocol = 5;
        await nextTick();

        expect(trackChange).toHaveBeenCalledExactlyOnceWith("escprotocol", 6);
    });

    it("tracks a feature toggle", async () => {
        fcStore.features.features!.enable("MOTOR_STOP");
        await nextTick();

        expect(trackChange).toHaveBeenCalledExactlyOnceWith("feature4", true);
    });

    it("stops motor testing when a setting changes while testing is enabled", async () => {
        motorsTestingEnabled.value = true;
        fcStore.mixerConfig.mixer = 7;
        await nextTick();

        expect(stopMotorTesting).toHaveBeenCalledOnce();
    });

    it("leaves motor testing alone when it is not enabled", async () => {
        fcStore.mixerConfig.mixer = 7;
        await nextTick();

        expect(trackChange).toHaveBeenCalledOnce();
        expect(stopMotorTesting).not.toHaveBeenCalled();
    });
});
