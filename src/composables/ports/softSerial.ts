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

import { useFlightControllerStore } from "@/stores/fc";
import type { SerialPort } from "@/stores/fc.types";
import { SOFT_SERIAL_IDENTIFIERS } from "./portNames";

/**
 * The board's soft serial ports the FC did not report.
 *
 * A soft serial port only reaches MSP once the SOFTSERIAL feature is enabled and
 * its pins are assigned, so a port list built from the FC's report alone cannot
 * offer one. The build still accepts an assignment naming it, which is what lets
 * a feature claim a soft serial port and only then have the feature turned on.
 *
 * @param ports FC.SERIAL_CONFIG.ports
 * @returns identifiers, empty when the build has no soft serial at all
 */
export function unreportedSoftSerialIdentifiers(
    ports: readonly Pick<SerialPort, "identifier">[] | null | undefined,
): number[] {
    if (!useFlightControllerStore().boardHasSoftSerial()) {
        return [];
    }

    const reported = new Set((ports ?? []).map((port) => port.identifier));

    return SOFT_SERIAL_IDENTIFIERS.filter((identifier) => !reported.has(identifier));
}
