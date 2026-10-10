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

import semver from "semver";
import MSP from "@/js/msp";
import MSPCodes, { MSP2TextType } from "@/js/msp/MSPCodes";
import { mspHelper } from "@/js/msp/MSPHelper";
import { API_VERSION_1_45, API_VERSION_1_47, API_VERSION_1_49 } from "@/js/data_storage";
import { useFlightControllerStore } from "@/stores/fc";

/** `fcStore.copyProfile.type`: which kind of profile MSP_COPY_PROFILE copies. */
export enum CopyProfileType {
    PID = 0,
    RATE = 1,
}

/** Rate profiles share MSP_SELECT_SETTING with PID profiles; the high bit marks a rate profile. */
const RATE_PROFILE_SELECT_FLAG = 128;

const hasWing = () => {
    const fcStore = useFlightControllerStore();
    return semver.gte(fcStore.config.apiVersion, API_VERSION_1_49) && fcStore.config.buildOptions.includes("USE_WING");
};

const hasPSAS = () => {
    const fcStore = useFlightControllerStore();
    return semver.gte(fcStore.config.apiVersion, API_VERSION_1_49) && fcStore.config.buildOptions.includes("USE_PSAS");
};

/**
 * MSP traffic for the PID Tuning tab: loading and writing the PID / rates / filter config, and the
 * profile commands (select, copy, reset). Every reply lands in FC; the tab keeps the UI state, the
 * dirty baselines and the useSaving / useReboot wrapping.
 */
export function usePidTuningMsp() {
    const fcStore = useFlightControllerStore();

    /** Fetch everything the tab and its sub-tabs render from, gated on what the FC's API supports. */
    const loadPidTuningData = async () => {
        await MSP.promise(MSPCodes.MSP_PIDNAMES);
        await MSP.promise(MSPCodes.MSP_PID);
        await MSP.promise(MSPCodes.MSP_PID_ADVANCED);
        await MSP.promise(MSPCodes.MSP_RC_TUNING);
        await MSP.promise(MSPCodes.MSP_FILTER_CONFIG);
        await MSP.promise(MSPCodes.MSP_RC_DEADBAND);
        await MSP.promise(MSPCodes.MSP_MOTOR_CONFIG);

        // Profile names (API 1.45+)
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
            await MSP.promise(
                MSPCodes.MSP2_GET_TEXT,
                mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSP2TextType.PID_PROFILE_NAME),
            );
            await MSP.promise(
                MSPCodes.MSP2_GET_TEXT,
                mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSP2TextType.RATE_PROFILE_NAME),
            );
        }

        // Status EX (API 1.47+)
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
            await MSP.promise(MSPCodes.MSP_STATUS_EX);
        }

        await MSP.promise(MSPCodes.MSP_SIMPLIFIED_TUNING);
        await MSP.promise(MSPCodes.MSP_ADVANCED_CONFIG);
        await MSP.promise(MSPCodes.MSP_MIXER_CONFIG);

        // Wing config (API 1.49+, WING build)
        if (hasWing()) {
            await MSP.promise(MSPCodes.MSP_WING);
        }

        // Plane SAS
        if (hasPSAS()) {
            await MSP.promise(MSPCodes.MSP_PSAS_CONFIG);
        }
    };

    /**
     * Write the tab's config to the FC (RAM only; the caller persists to EEPROM). Profile names are
     * sent from fcStore.config, so the caller mirrors its inputs there first.
     */
    const writePidTuningConfig = async () => {
        // Save PIDs
        await MSP.promise(MSPCodes.MSP_SET_PID, mspHelper.crunch(MSPCodes.MSP_SET_PID));

        // Save advanced tuning
        await MSP.promise(MSPCodes.MSP_SET_PID_ADVANCED, mspHelper.crunch(MSPCodes.MSP_SET_PID_ADVANCED));

        // Save RC tuning
        await MSP.promise(MSPCodes.MSP_SET_RC_TUNING, mspHelper.crunch(MSPCodes.MSP_SET_RC_TUNING));

        // Save filter config
        await MSP.promise(MSPCodes.MSP_SET_FILTER_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_FILTER_CONFIG));

        // Save simplified tuning (sliders)
        await MSP.promise(MSPCodes.MSP_SET_SIMPLIFIED_TUNING, mspHelper.crunch(MSPCodes.MSP_SET_SIMPLIFIED_TUNING));

        // Save profile names to firmware (API 1.45+)
        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
            if (fcStore.config.pidProfileNames) {
                await MSP.promise(
                    MSPCodes.MSP2_SET_TEXT,
                    mspHelper.crunch(MSPCodes.MSP2_SET_TEXT, MSP2TextType.PID_PROFILE_NAME),
                );
            }
            if (fcStore.config.rateProfileNames) {
                await MSP.promise(
                    MSPCodes.MSP2_SET_TEXT,
                    mspHelper.crunch(MSPCodes.MSP2_SET_TEXT, MSP2TextType.RATE_PROFILE_NAME),
                );
            }
        }

        // Save Wing config (API 1.49+, WING build)
        if (hasWing()) {
            await MSP.promise(MSPCodes.MSP_SET_WING, mspHelper.crunch(MSPCodes.MSP_SET_WING));
        }

        // Plane SAS
        if (hasPSAS()) {
            await MSP.promise(MSPCodes.MSP_SET_PSAS_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_PSAS_CONFIG));
        }
    };

    /** Switch the FC to another PID profile. */
    const selectPidProfile = (profile: number) => MSP.promise(MSPCodes.MSP_SELECT_SETTING, [profile]);

    /** Switch the FC to another rate profile. */
    const selectRateProfile = (rateProfile: number) =>
        MSP.promise(MSPCodes.MSP_SELECT_SETTING, [rateProfile | RATE_PROFILE_SELECT_FLAG]);

    /** Copy one PID or rate profile over another, in the FC's RAM. */
    const copyProfile = (type: CopyProfileType, srcProfile: number, dstProfile: number) => {
        fcStore.copyProfile = fcStore.copyProfile || {};
        fcStore.copyProfile.type = type;
        fcStore.copyProfile.srcProfile = srcProfile;
        fcStore.copyProfile.dstProfile = dstProfile;

        return MSP.promise(MSPCodes.MSP_COPY_PROFILE, mspHelper.crunch(MSPCodes.MSP_COPY_PROFILE));
    };

    /** Reset the active PID profile to defaults, in the FC's RAM. */
    const resetPidProfile = () => MSP.promise(MSPCodes.MSP_SET_RESET_CURR_PID);

    return {
        loadPidTuningData,
        writePidTuningConfig,
        selectPidProfile,
        selectRateProfile,
        copyProfile,
        resetPidProfile,
    };
}
