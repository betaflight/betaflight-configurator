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
import { mspHelper } from "../../js/msp/MSPHelper";

/**
 * One-shot MSP commands the Receiver tab sends on user action. Neither waits for a reply.
 */
export function useReceiverCommands() {
    /** Put the receiver into bind mode. */
    const bindReceiver = () => {
        MSP.send_message(MSPCodes.MSP2_BETAFLIGHT_BIND);
    };

    /**
     * Drive the RC channels from the stick window (RX_MSP).
     * @param channels 16-bit channel values, in channel order
     */
    const sendRawRx = (channels: number[]) => {
        mspHelper.setRawRx(channels);
    };

    return { bindReceiver, sendRawRx };
}
