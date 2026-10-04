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

import MSP from "@/js/msp";
import MSPCodes from "@/js/msp/MSPCodes";
import { mspHelper } from "@/js/msp/MSPHelper";
import { useFlightControllerStore } from "@/stores/fc";
import { useReboot } from "@/composables/useReboot";

/**
 * MSP traffic for the motor output reordering dialog: spinning one motor at a time while the
 * user identifies it, and writing the resulting output order.
 */
export function useMotorOutputReordering() {
    const fcStore = useFlightControllerStore();
    const { saveAndReboot } = useReboot();

    /**
     * Send MSP_SET_MOTOR with `motorIndex` at `spinValue` and every other motor at `stopValue`.
     * @param motorIndex the motor to spin; -1 (or any index not below `numberOfMotors`) stops all
     */
    const spinOnlyMotor = (motorIndex: number, numberOfMotors: number, spinValue: number, stopValue: number) => {
        const buffer: number[] = [];

        for (let i = 0; i < numberOfMotors; i++) {
            const value = i === motorIndex ? spinValue : stopValue;
            buffer.push(value & 0xff, (value >> 8) & 0xff);
        }

        MSP.send_message(MSPCodes.MSP_SET_MOTOR, buffer);
    };

    /**
     * Put the new order in the store, send it, and save + reboot once the FC acknowledges.
     * Returns straight after the send: the caller does not wait for the reply.
     */
    const saveMotorOutputOrder = (order: readonly number[]) => {
        fcStore.motorOutputOrder = Array.from(order);

        MSP.send_message(
            MSPCodes.MSP2_SET_MOTOR_OUTPUT_REORDERING,
            mspHelper.crunch(MSPCodes.MSP2_SET_MOTOR_OUTPUT_REORDERING),
            false,
            () => saveAndReboot(),
        );
    };

    return { spinOnlyMotor, saveMotorOutputOrder };
}
