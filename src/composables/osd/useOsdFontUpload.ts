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
import { reinitializeConnection } from "@/js/serial_backend";

/** MSP side of the OSD tab's font upload: what has to happen once the font is on the FC. */
export function useOsdFontUpload() {
    /** Reboot the FC so it applies the font it has just received. */
    const rebootAfterFontUpload = () => {
        // Reset MSP parser state and flush pending callbacks to prevent
        // CRC errors from residual serial data before the reboot command.
        MSP.disconnect_cleanup();
        // Reboot FC to apply the new font — reinitializeConnection sends
        // MSP_SET_REBOOT (fire-and-forget) and sets rebootTimestamp so the
        // serial backend auto-reconnects after the device comes back.
        reinitializeConnection();
    };

    return { rebootAfterFontUpload };
}
