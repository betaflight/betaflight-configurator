import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import "../../src/js/injected_methods";
import { usePower } from "../../src/composables/usePower";
import CONFIGURATOR, { API_VERSION_1_48 } from "../../src/js/data_storage";
import FC from "../../src/js/fc";
import VirtualFC from "../../src/js/VirtualFC";
import MSP from "../../src/js/msp";
import MSPCodes from "../../src/js/msp/MSPCodes";

describe("usePower", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        FC.resetState();
        CONFIGURATOR.virtualMode = false;
        CONFIGURATOR.virtualApiVersion = "0.0.1";
    });

    afterEach(() => {
        vi.restoreAllMocks();
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

    it("restores virtual battery profile state without MSP resync when profile switching fails", async () => {
        CONFIGURATOR.virtualMode = true;
        CONFIGURATOR.virtualApiVersion = API_VERSION_1_48;
        VirtualFC.setVirtualConfig();

        const profileNameError = new Error("profile name failed");
        const mspPromise = vi.spyOn(MSP, "promise").mockImplementation((code) => {
            if (code === MSPCodes.MSP2_GET_TEXT) {
                return Promise.reject(profileNameError);
            }

            return Promise.resolve();
        });

        const power = usePower();
        mspPromise.mockClear();

        await expect(power.changeBatteryProfile(2)).rejects.toThrow(profileNameError);

        expect(FC.CONFIG.batteryProfile).toBe(0);
        expect(power.activeBatteryProfile.value).toBe(0);
        expect(mspPromise).not.toHaveBeenCalledWith(MSPCodes.MSP_STATUS_EX);
        expect(mspPromise).not.toHaveBeenCalledWith(MSPCodes.MSP_BATTERY_CONFIG);
    });
});
