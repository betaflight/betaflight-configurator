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
import MSPCodes from "../../js/msp/MSPCodes";
import { API_VERSION_1_41 } from "../../js/data_storage";
import { useFlightControllerStore } from "@/stores/fc";

/**
 * MSP traffic for the Failsafe tab's initial load. The replies land in the flightController
 * store, which the tab reads from.
 */
export function useFailsafeData() {
    const fcStore = useFlightControllerStore();

    /** Fetch everything the tab renders from, in order. GPS Rescue only exists from API 1.41. */
    const loadFailsafeData = async () => {
        await MSP.promise(MSPCodes.MSP_RX_CONFIG);
        await MSP.promise(MSPCodes.MSP_FAILSAFE_CONFIG);

        if (semver.gte(fcStore.config.apiVersion, API_VERSION_1_41)) {
            await MSP.promise(MSPCodes.MSP_GPS_RESCUE);
        }

        await MSP.promise(MSPCodes.MSP_RXFAIL_CONFIG);
        await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
        await MSP.promise(MSPCodes.MSP_BOXNAMES);
        await MSP.promise(MSPCodes.MSP_BOXIDS);
        await MSP.promise(MSPCodes.MSP_RC);
        await MSP.promise(MSPCodes.MSP_RSSI_CONFIG);
        await MSP.promise(MSPCodes.MSP_MODE_RANGES);
    };

    return { loadFailsafeData };
}
