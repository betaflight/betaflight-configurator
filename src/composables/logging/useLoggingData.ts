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

import MSP from "../../js/msp";
import MSPCodes from "../../js/msp/MSPCodes";

/** The name of an MSP command, e.g. `"MSP_RAW_IMU"`. */
export type MspCodeName = keyof typeof MSPCodes;

/**
 * MSP traffic for the (telemetry) Logging tab. The tab owns the sampling interval, the CSV
 * file and the columns; the replies land in the flightController store, where it reads them.
 */
export function useLoggingData() {
    /**
     * Fetch RC and motor data once so the column headers know the channel and motor counts.
     * @param onReady called after the motor reply, i.e. once both have landed
     */
    const requestInitialData = (onReady: () => void) => {
        MSP.send_message(MSPCodes.MSP_RC, false, false, () => {
            MSP.send_message(MSPCodes.MSP_MOTOR, false, false, () => {
                onReady();
            });
        });
    };

    /**
     * Fire one request per logged property, in the given order, without waiting for replies.
     * The tab's guard is kept: a property with no MSP code is skipped.
     */
    const requestProperties = (properties: readonly MspCodeName[]) => {
        properties.forEach((property) => {
            if (MSPCodes[property]) {
                MSP.send_message(MSPCodes[property]);
            }
        });
    };

    return { requestInitialData, requestProperties };
}
