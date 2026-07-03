import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import "../../src/js/injected_methods";
import { usePower } from "../../src/composables/usePower";
import CONFIGURATOR, { API_VERSION_1_48 } from "../../src/js/data_storage";
import FC from "../../src/js/fc";
import VirtualFC from "../../src/js/VirtualFC";

describe("usePower", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        FC.resetState();
        CONFIGURATOR.virtualMode = false;
        CONFIGURATOR.virtualApiVersion = "0.0.1";
    });

    it("switches battery profiles in virtual mode", async () => {
        CONFIGURATOR.virtualMode = true;
        CONFIGURATOR.virtualApiVersion = API_VERSION_1_48;
        VirtualFC.setVirtualConfig();

        const power = usePower();

        expect(power.hasBatteryProfiles.value).toBe(true);
        expect(power.activeBatteryProfile.value).toBe(0);

        await power.changeBatteryProfile(2);

        expect(FC.CONFIG.batteryProfile).toBe(2);
        expect(power.activeBatteryProfile.value).toBe(2);
    });
});
