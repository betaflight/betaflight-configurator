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

import { computed, ref, type Ref } from "vue";
import { storeToRefs } from "pinia";
import semver from "semver";
import MSP from "../../js/msp";
import MSPCodes, { MSP2TextType } from "../../js/msp/MSPCodes";
import { mspHelper } from "../../js/msp/MSPHelper";
import { API_VERSION_1_45 } from "../../js/data_storage";
import { useFlightControllerStore } from "@/stores/fc";
import { getSetting, getSettingInfo, setSetting } from "../useMspSetting";
import { isMspCancelled } from "../../js/msp/mspErrors";
import { useMixerSaveStore } from "../../stores/mixerSave";
import { withSaveFailureMessage } from "../useSaving";
import { i18n } from "../../js/localization";

/**
 * MSP traffic for the Configuration tab: the initial load and the save writes.
 * The tab keeps the UI state and moves it in and out of the flightController store.
 */
export function useConfigurationData() {
    const fcStore = useFlightControllerStore();
    const mixerType = ref<string | null>(null);
    const ezLandingAvailable = ref(false);
    const { loadedMixerType, controllerMixerType, mixerNeedsSave, mixerPersistenceUncertain } =
        storeToRefs(useMixerSaveStore());
    const ezLandingEnabled = computed({
        get: () => mixerType.value === "EZLANDING",
        set: (enabled: boolean) => {
            if (ezLandingAvailable.value) mixerType.value = enabled ? "EZLANDING" : "LEGACY";
        },
    });

    /**
     * Fetch everything the tab renders from; the replies land in the flightController store.
     * Stops between groups of requests once the tab has unmounted.
     * @param isMounted the tab's mounted state
     * @returns false if the tab unmounted before the load finished
     */
    const loadConfigurationData = async (isMounted: Ref<boolean>): Promise<boolean> => {
        if (!isMounted.value) return false;
        await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
        await MSP.promise(MSPCodes.MSP_BEEPER_CONFIG);
        await MSP.promise(MSPCodes.MSP_ARMING_CONFIG);
        await MSP.promise(MSPCodes.MSP_SENSOR_CONFIG);

        if (!isMounted.value) return false;

        if (semver.lt(fcStore.config.apiVersion, API_VERSION_1_45)) {
            await MSP.promise(MSPCodes.MSP_NAME);
        }

        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
            await MSP.promise(
                MSPCodes.MSP2_GET_TEXT,
                mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSP2TextType.CRAFT_NAME),
            );
        }

        await MSP.promise(MSPCodes.MSP_RX_CONFIG);

        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
            await MSP.promise(
                MSPCodes.MSP2_GET_TEXT,
                mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSP2TextType.PILOT_NAME),
            );
        }

        if (!isMounted.value) return false;

        await MSP.promise(MSPCodes.MSP_ADVANCED_CONFIG);

        if (!isMounted.value) return false;

        try {
            const currentMixerType = await getSetting("mixer_type");
            if (!isMounted.value) return false;
            const mixerInfo = currentMixerType === null ? null : await getSettingInfo("mixer_type");
            if (!isMounted.value) return false;

            if (!mixerNeedsSave.value) loadedMixerType.value = currentMixerType;
            controllerMixerType.value = currentMixerType;
            mixerType.value = currentMixerType;
            ezLandingAvailable.value =
                currentMixerType !== null &&
                !!mixerInfo?.values?.includes(currentMixerType) &&
                mixerInfo.values.includes("EZLANDING") &&
                mixerInfo.values.includes("LEGACY");
        } catch (error) {
            if (isMspCancelled(error)) throw error;
            if (!isMounted.value) return false;

            // Mixer capability discovery is optional; the remaining settings can still load.
            controllerMixerType.value = null;
            mixerType.value = null;
            ezLandingAvailable.value = false;
            console.warn("Unable to read EZ Landing settings:", error);
        }

        return true;
    };

    /**
     * Send the tab's settings to the FC from the flightController store. The caller writes the
     * edited values into the store first, and persists (EEPROM / reboot) afterwards.
     */
    const sendConfigurationData = async () => {
        if (mixerNeedsSave.value && (!ezLandingAvailable.value || mixerType.value === null)) {
            throw withSaveFailureMessage(
                new Error("Mixer recovery is pending but its current settings could not be read"),
                i18n.getMessage("configurationMixerReadFailed"),
            );
        }
        // Preserve LINEAR/DYNAMIC when saving unrelated settings with the switch off.
        const selectedMixerType = mixerType.value;
        if (ezLandingAvailable.value && selectedMixerType !== null && selectedMixerType !== controllerMixerType.value) {
            // A lost response can still leave the write applied in RAM.
            mixerNeedsSave.value = true;
            controllerMixerType.value = null;
            const confirmed = await setSetting("mixer_type", selectedMixerType);
            if (confirmed !== selectedMixerType) {
                throw new Error("The flight controller did not confirm the selected mixer type");
            }
            controllerMixerType.value = confirmed;
        }
        await MSP.promise(MSPCodes.MSP_SET_FEATURE_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FEATURE_CONFIG));

        if (fcStore.beepers) {
            await MSP.promise(MSPCodes.MSP_SET_BEEPER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_BEEPER_CONFIG));
        }

        await MSP.promise(MSPCodes.MSP_SET_ARMING_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ARMING_CONFIG));

        if (semver.lt(fcStore.config.apiVersion, API_VERSION_1_45)) {
            await MSP.promise(MSPCodes.MSP_SET_NAME, mspHelper.crunch(MSPCodes.MSP_SET_NAME));
        } else {
            await MSP.promise(
                MSPCodes.MSP2_SET_TEXT,
                mspHelper.crunch(MSPCodes.MSP2_SET_TEXT, MSP2TextType.CRAFT_NAME),
            );
            await MSP.promise(
                MSPCodes.MSP2_SET_TEXT,
                mspHelper.crunch(MSPCodes.MSP2_SET_TEXT, MSP2TextType.PILOT_NAME),
            );
        }

        await MSP.promise(MSPCodes.MSP_SET_RX_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_RX_CONFIG));
        await MSP.promise(MSPCodes.MSP_SET_ADVANCED_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_ADVANCED_CONFIG));
    };

    /** Restore the pre-save mixer after a failure, retaining recovery state until confirmed. */
    async function restoreMixerConfig(): Promise<void> {
        if (!mixerNeedsSave.value || loadedMixerType.value === null) return;

        controllerMixerType.value = null;
        const currentMixerType = await getSetting("mixer_type");
        if (currentMixerType !== loadedMixerType.value) {
            const restored = await setSetting("mixer_type", loadedMixerType.value);
            if (restored !== loadedMixerType.value) {
                throw new Error("The flight controller did not confirm the restored mixer type");
            }
        }
        controllerMixerType.value = loadedMixerType.value;
        // An EEPROM timeout may mean the save completed but its acknowledgement was lost.
        mixerNeedsSave.value = mixerPersistenceUncertain.value;
    }

    function markMixerSaveAttempted(): void {
        if (mixerNeedsSave.value) mixerPersistenceUncertain.value = true;
    }

    /** Advance the baseline only once the EEPROM write has been acknowledged. */
    function confirmMixerSaved(): void {
        loadedMixerType.value = controllerMixerType.value;
        mixerNeedsSave.value = false;
        mixerPersistenceUncertain.value = false;
    }

    return {
        loadConfigurationData,
        sendConfigurationData,
        mixerType,
        ezLandingAvailable,
        ezLandingEnabled,
        mixerNeedsSave,
        restoreMixerConfig,
        markMixerSaveAttempted,
        confirmMixerSaved,
    };
}
