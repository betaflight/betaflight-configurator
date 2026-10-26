/*
 * This file is part of Betaflight.
 *
 * Betaflight is free software. You can redistribute this software
 * and/or modify this software under the terms of the GNU General
 * Public License as published by the Free Software Foundation,
 * either version 3 of the License, or (at your option) any later
 * version.
 *
 * Betaflight is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 *
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public
 * License along with this software.
 *
 * If not, see <http://www.gnu.org/licenses/>.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { usePower } from "../../src/composables/usePower";
import { API_VERSION_1_48 } from "../../src/js/data_storage";
import { useFlightControllerStore } from "../../src/stores/fc";
import VirtualFC from "../../src/js/VirtualFC";
import MSP from "../../src/js/msp";
import MSPCodes, { MSP2TextType } from "../../src/js/msp/MSPCodes";
import { useConnectionStore } from "../../src/stores/connection";

let fcStore: ReturnType<typeof useFlightControllerStore>;

describe("usePower", () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        const connectionStore = useConnectionStore();
        fcStore = useFlightControllerStore();
        fcStore.resetState();
        connectionStore.virtualMode = false;
        connectionStore.virtualApiVersion = "0.0.1";
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("switches battery profiles in virtual mode", async () => {
        const connectionStore = useConnectionStore();
        connectionStore.virtualMode = true;
        connectionStore.virtualApiVersion = API_VERSION_1_48;
        VirtualFC.setVirtualConfig();

        const power = usePower();

        expect(power.hasBatteryProfiles.value).toBe(true);
        expect(power.activeBatteryProfile.value).toBe(0);

        await power.changeBatteryProfile(2);

        expect(fcStore.config.batteryProfile).toBe(2);
        expect(power.activeBatteryProfile.value).toBe(2);
    });

    it("requests the battery profile name with the MSP2TEXT battery-profile type byte", async () => {
        const connectionStore = useConnectionStore();
        connectionStore.virtualMode = true;
        connectionStore.virtualApiVersion = API_VERSION_1_48;
        VirtualFC.setVirtualConfig();

        // A wrong MSP2TextType member reaches the wire as the wrong type byte and the FC
        // answers with the wrong string, so pin the exact payload.
        const mspPromise = vi.spyOn(MSP, "promise").mockResolvedValue(undefined);

        const power = usePower();
        mspPromise.mockClear();

        await power.changeBatteryProfile(2);

        expect(mspPromise).toHaveBeenCalledWith(MSPCodes.MSP2_GET_TEXT, [MSP2TextType.BATTERY_PROFILE_NAME]);
    });

    it("restores virtual battery profile state without MSP resync when profile switching fails", async () => {
        const connectionStore = useConnectionStore();
        connectionStore.virtualMode = true;
        connectionStore.virtualApiVersion = API_VERSION_1_48;
        VirtualFC.setVirtualConfig();

        const profileNameError = new Error("profile name failed");
        const mspPromise = vi.spyOn(MSP, "promise").mockImplementation((code) => {
            if (code === MSPCodes.MSP2_GET_TEXT) {
                return Promise.reject(profileNameError);
            }

            return Promise.resolve(undefined);
        });

        const power = usePower();
        const previousProfileName = power.batteryProfileName.value;
        mspPromise.mockClear();

        await expect(power.changeBatteryProfile(2)).rejects.toThrow(profileNameError);

        expect(fcStore.config.batteryProfile).toBe(0);
        expect(power.activeBatteryProfile.value).toBe(0);
        expect(power.batteryProfileName.value).toBe(previousProfileName);
        expect(mspPromise).not.toHaveBeenCalledWith(MSPCodes.MSP_STATUS_EX);
        expect(mspPromise).not.toHaveBeenCalledWith(MSPCodes.MSP_BATTERY_CONFIG);
    });
});
