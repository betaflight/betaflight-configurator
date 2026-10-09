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
import { mspHelper } from "../../js/msp/MSPHelper";

/**
 * Truthy when the connected FC's MSP API is at least some version. Read at the point of each
 * request, not when the composable is created.
 */
type ApiGate = Readonly<Ref<string | boolean | undefined>>;

type MspCallback = () => void;

/**
 * MSP traffic for the Sensors tab: the config load and save, and the one-shot requests behind
 * the attitude display, accelerometer calibration and GPS-based geo reference. Every reply
 * lands in the flightController store; the tab keeps the local copies and the UI.
 * @param isApi146 gates the compass config
 * @param isApi147 gates the gyro sensor list
 */
export function useSensorsData(isApi146: ApiGate, isApi147: ApiGate) {
    /** Fetch everything the tab hydrates from, one request at a time. */
    const loadSensorsConfig = async () => {
        await MSP.promise(MSPCodes.MSP_SENSOR_CONFIG);
        await MSP.promise(MSPCodes.MSP_SENSOR_ALIGNMENT);
        await MSP.promise(MSPCodes.MSP_BOARD_ALIGNMENT_CONFIG);
        await MSP.promise(MSPCodes.MSP_ACC_TRIM);
        await MSP.promise(MSPCodes.MSP2_SENSOR_CONFIG_ACTIVE);
        // initModel() / wizard Model read mixer + motor_count (Custom mmix → craft mesh).
        await MSP.promise(MSPCodes.MSP_MIXER_CONFIG);
        await MSP.promise(MSPCodes.MSP_MOTOR_CONFIG);

        if (isApi146.value) {
            await MSP.promise(MSPCodes.MSP_COMPASS_CONFIG);
        }

        if (isApi147.value) {
            await MSP.promise(MSPCodes.MSP2_GYRO_SENSOR);
        }
    };

    /**
     * Send the sensor, alignment, trim and (API 1.46+) compass config from the store, in that
     * order. The caller has already written its edits into the store, and persists afterwards.
     */
    const sendSensorsConfig = async () => {
        await MSP.promise(MSPCodes.MSP_SET_SENSOR_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_SENSOR_CONFIG));
        await MSP.promise(MSPCodes.MSP_SET_SENSOR_ALIGNMENT, mspHelper.crunch(MSPCodes.MSP_SET_SENSOR_ALIGNMENT));
        await MSP.promise(
            MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG,
            mspHelper.crunch(MSPCodes.MSP_SET_BOARD_ALIGNMENT_CONFIG),
        );
        await MSP.promise(MSPCodes.MSP_SET_ACC_TRIM, mspHelper.crunch(MSPCodes.MSP_SET_ACC_TRIM));

        if (isApi146.value) {
            await MSP.promise(MSPCodes.MSP_SET_COMPASS_CONFIG, mspHelper.crunch(MSPCodes.MSP_SET_COMPASS_CONFIG));
        }
    };

    /** Refresh the FC's GPS data in the store; rejects when the request fails. */
    const loadGpsData = async () => {
        await MSP.promise(MSPCodes.MSP_RAW_GPS);
    };

    /** Start the FC's accelerometer calibration; `onSent` runs once the FC acknowledges it. */
    const startAccCalibration = (onSent: MspCallback) => {
        MSP.send_message(MSPCodes.MSP_ACC_CALIBRATION, false, false, onSent);
    };

    /** Re-fetch board info, which carries configurationProblems. */
    const loadBoardInfo = (onReply: MspCallback) => {
        MSP.send_message(MSPCodes.MSP_BOARD_INFO, false, false, onReply);
    };

    /** Request the Euler attitude (kinematics). */
    const requestAttitude = (onReply: MspCallback) => {
        MSP.send_message(MSPCodes.MSP_ATTITUDE, false, false, onReply);
    };

    /** Request the altitude. */
    const requestAltitude = (onReply: MspCallback) => {
        MSP.send_message(MSPCodes.MSP_ALTITUDE, false, false, onReply);
    };

    /** Request the attitude quaternion (API 1.48+; the caller gates it). */
    const requestAttitudeQuaternion = (onReply: MspCallback) => {
        MSP.send_message(MSPCodes.MSP_ATTITUDE_QUATERNION, false, false, onReply);
    };

    return {
        loadSensorsConfig,
        sendSensorsConfig,
        loadGpsData,
        startAccCalibration,
        loadBoardInfo,
        requestAttitude,
        requestAltitude,
        requestAttitudeQuaternion,
    };
}
