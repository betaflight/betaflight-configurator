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

import type { Ref } from "vue";
import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";
import { useInterval } from "@/composables/useInterval";

const GPS_POLL_INTERVAL = "gps_pull";

/**
 * MSP traffic for the GPS tab: the config load and the telemetry poll.
 * The tab keeps only UI state and reads the replies from the flightController store.
 */
export function useGpsData() {
    const { addInterval, removeAllIntervals, pauseInterval, resumeInterval } = useInterval();

    /** Fetch the feature and GPS config; the replies land in the flightController store. */
    const fetchGpsConfig = async () => {
        await MSP.promise(MSPCodes.MSP_FEATURE_CONFIG);
        await MSP.promise(MSPCodes.MSP_GPS_CONFIG);
    };

    /**
     * Poll GPS telemetry every 100 ms until the tab unmounts. Each tick is one chained request
     * sequence (raw GPS, comp GPS, SV info, attitude, raw IMU, then the compass config when a
     * magnetometer is present), and `onData` runs once the last reply has landed.
     * @param hasMag read on every tick, so a sensor change takes effect on the next poll
     * @param onData called after each complete sequence
     */
    const startPolling = (hasMag: Readonly<Ref<boolean>>, onData: () => void) => {
        const getMagData = () => {
            if (hasMag.value) {
                MSP.send_message(MSPCodes.MSP_COMPASS_CONFIG, false, false, onData);
            } else {
                onData();
            }
        };

        const getImuData = () => {
            MSP.send_message(MSPCodes.MSP_RAW_IMU, false, false, getMagData);
        };

        const getAttitudeData = () => {
            MSP.send_message(MSPCodes.MSP_ATTITUDE, false, false, getImuData);
        };

        const getGpsSvInfo = () => {
            MSP.send_message(MSPCodes.MSP_GPS_SV_INFO, false, false, getAttitudeData);
        };

        const getCompGpsData = () => {
            MSP.send_message(MSPCodes.MSP_COMP_GPS, false, false, getGpsSvInfo);
        };

        const getRawGpsData = () => {
            MSP.send_message(MSPCodes.MSP_RAW_GPS, false, false, getCompGpsData);
        };

        addInterval(GPS_POLL_INTERVAL, getRawGpsData, 100, true);
    };

    /** Hold the telemetry poll, e.g. while a save talks to the FC. */
    const pausePolling = () => pauseInterval(GPS_POLL_INTERVAL);

    /** Restart a poll held by {@link pausePolling}. */
    const resumePolling = () => resumeInterval(GPS_POLL_INTERVAL);

    /** Remove the poll now; it is also removed when the owning scope is disposed. */
    const stopPolling = () => removeAllIntervals();

    return { fetchGpsConfig, startPolling, pausePolling, resumePolling, stopPolling };
}
