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
import MSP from "../../js/msp";
import MSPCodes, { MSP2TextType } from "../../js/msp/MSPCodes";
import { mspHelper, type DataflashReadCallback } from "../../js/msp/MSPHelper";
import { API_VERSION_1_45, API_VERSION_1_47 } from "../../js/data_storage";
import { useFlightControllerStore } from "@/stores/fc";
import { useAppInfoStore } from "@/stores/appInfo";

export type { DataflashReadCallback } from "../../js/msp/MSPHelper";

/**
 * True when a dataflash read was cancelled by the MSP queue (tab switch, disconnect) rather
 * than failing, so the tab can close the file quietly.
 */
export { isMspCancelled } from "../../js/msp/mspErrors";

/** The `state` values the FC reports in MSP_SDCARD_SUMMARY. */
export const SdcardState = {
    NOT_PRESENT: MSP.SDCARD_STATE_NOT_PRESENT,
    FATAL: MSP.SDCARD_STATE_FATAL,
    CARD_INIT: MSP.SDCARD_STATE_CARD_INIT,
    FS_INIT: MSP.SDCARD_STATE_FS_INIT,
    READY: MSP.SDCARD_STATE_READY,
} as const;

/**
 * MSP traffic for the Blackbox (onboard logging) tab: the initial load, the dataflash and
 * SD card summaries, the dataflash read loop's block requests and the reboot into mass
 * storage. Replies land in the flightController store, where the tab reads them.
 */
export function useOnboardLoggingData() {
    const fcStore = useFlightControllerStore();

    /** Fetch everything the tab renders from, gated on the FC's API version where needed. */
    const loadOnboardLoggingData = async () => {
        await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
        await MSP.promise(MSPCodes.MSP_DATAFLASH_SUMMARY);
        await MSP.promise(MSPCodes.MSP_SDCARD_SUMMARY);
        await MSP.promise(MSPCodes.MSP_BLACKBOX_CONFIG);
        await MSP.promise(MSPCodes.MSP_ADVANCED_CONFIG);
        await MSP.promise(MSPCodes.MSP_SENSOR_CONFIG);

        if (fcStore.config?.apiVersion && semver.gte(fcStore.config.apiVersion, API_VERSION_1_45)) {
            await MSP.promise(
                MSPCodes.MSP2_GET_TEXT,
                mspHelper.crunch(MSPCodes.MSP2_GET_TEXT, MSP2TextType.CRAFT_NAME),
            );
        } else {
            await MSP.promise(MSPCodes.MSP_NAME);
        }

        if (fcStore.config?.apiVersion && semver.gte(fcStore.config.apiVersion, API_VERSION_1_47)) {
            await MSP.promise(MSPCodes.MSP2_SENSOR_CONFIG_ACTIVE);
        }
    };

    /** Refresh the dataflash summary (used size); `onDone` runs once the reply has landed. */
    const requestDataflashSummary = (onDone?: () => void) => {
        MSP.send_message(MSPCodes.MSP_DATAFLASH_SUMMARY, false, false, () => {
            if (onDone) {
                onDone();
            }
        });
    };

    /** Refresh the SD card summary; `onReply` runs once the reply has landed. */
    const requestSdcardSummary = (onReply: () => void) => {
        MSP.send_message(MSPCodes.MSP_SDCARD_SUMMARY, false, false, onReply);
    };

    /** Request one dataflash block; `onChunkRead` receives it (or the reason it failed). */
    const readDataflash = (address: number, blockSize: number, onChunkRead: DataflashReadCallback) => {
        mspHelper.dataflashRead(address, blockSize, onChunkRead);
    };

    /** Reboot the FC into USB mass storage, with the UTC variant on Linux. */
    const rebootToMassStorage = () => {
        const buffer: number[] = [];
        if (useAppInfoStore().operatingSystem === "Linux") {
            buffer.push(mspHelper.REBOOT_TYPES.MSC_UTC);
        } else {
            buffer.push(mspHelper.REBOOT_TYPES.MSC);
        }
        MSP.send_message(MSPCodes.MSP_SET_REBOOT, buffer, false);
    };

    return {
        loadOnboardLoggingData,
        requestDataflashSummary,
        requestSdcardSummary,
        readDataflash,
        rebootToMassStorage,
    };
}
